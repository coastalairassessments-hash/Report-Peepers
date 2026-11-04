import { createHash } from "node:crypto";
import type { EnvironmentalReviewCaseSnapshotVersion01 as Snap } from "@report-peepers/contracts";
import type { Issue } from "./integrity.js";

type Finding = Snap["findings"][number];
type Change = Snap["release"]["changes"][number];
export type ChangeType = Change["change_type"];

/** Stable canonical JSON (sorted keys) so the same content always gives the same fingerprint. */
export function canon(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canon).join(",")}]`;
  if (v && typeof v === "object")
    return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canon((v as any)[k])}`).join(",")}}`;
  return JSON.stringify(v);
}
/** Fingerprint stored at publish time; any later edit to a published snapshot changes it. */
export const fingerprint = (s: Snap): string => createHash("sha256").update(canon(s)).digest("hex");

const sameSet = (a: string[], b: string[]) => canon([...a].sort()) === canon([...b].sort());

/** Did the substance of a finding change between revisions? */
function substantiveChange(a: Finding, b: Finding): boolean {
  return a.finding_type !== b.finding_type || a.explanation !== b.explanation || a.evidence_strength !== b.evidence_strength ||
    a.title !== b.title || !sameSet(a.support_evidence_ids, b.support_evidence_ids) ||
    !sameSet(a.counter_evidence_ids, b.counter_evidence_ids) || !sameSet(a.question_ids, b.question_ids);
}

/** Classify each finding against the earlier revision. Nothing may vanish: a dropped finding is reported, not hidden. */
export function classify(prev: Snap, next: Snap): { id: string; type: ChangeType | "dropped" }[] {
  const nextById = new Map(next.findings.map((f) => [f.id, f]));
  const out: { id: string; type: ChangeType | "dropped" }[] = [];
  for (const p of prev.findings) {
    const n = nextById.get(p.id);
    if (!n) out.push({ id: p.id, type: "dropped" });
    else if (n.resolution_status === "retracted") out.push({ id: p.id, type: "retracted" });
    else if (n.resolution_status === "resolved") out.push({ id: p.id, type: "resolved" });
    else out.push({ id: p.id, type: substantiveChange(p, n) || n.resolution_status !== p.resolution_status ? "modified" : "unchanged" });
  }
  const prevIds = new Set(prev.findings.map((f) => f.id));
  for (const n of next.findings) if (!prevIds.has(n.id)) out.push({ id: n.id, type: "new" });
  return out;
}

/** The earlier release as it should look once superseded. Returns a copy; the original is never edited. */
export function supersede(prev: Snap): Snap {
  const copy = structuredClone(prev);
  copy.release.status = "superseded";
  return copy;
}

/**
 * Rules for a new revision that follows a published release:
 * new ids, link to the earlier release, earlier evidence untouched, nothing dropped silently,
 * and every change recorded with a reason and the new evidence responsible.
 */
export function checkRevision(prev: Snap, next: Snap): Issue[] {
  const out: Issue[] = [];
  const add = (code: string, path: string, message: string) => out.push({ code, path, message });

  if (prev.release.status !== "published" && prev.release.status !== "superseded")
    add("previous_not_published", "release", "A revision builds on a published release");
  if (next.case_id !== prev.case_id) add("different_case", "case_id", "Revision must belong to the same case");
  if (next.case_revision_id === prev.case_revision_id) add("revision_id_reused", "case_revision_id", "A revision needs a new revision id");
  if (next.release.id === prev.release.id) add("release_id_reused", "release.id", "A revision needs a new release id");
  if (next.release.supersedes_release_id !== prev.release.id)
    add("missing_supersedes_link", "release.supersedes_release_id", "New release must point to the one it replaces");

  // earlier evidence is never rewritten
  const nextEv = new Map(next.evidence.map((e) => [e.id, e]));
  for (const e of prev.evidence) {
    const n = nextEv.get(e.id);
    if (!n) add("evidence_removed", `evidence.${e.id}`, "Earlier evidence cannot be removed");
    else if (canon(n) !== canon(e)) add("evidence_rewritten", `evidence.${e.id}`, "Earlier evidence cannot be edited; add new evidence instead");
  }
  const prevEvIds = new Set(prev.evidence.map((e) => e.id));

  const derived = classify(prev, next);
  const recorded = new Map(next.release.changes.map((c) => [c.finding_id, c]));
  for (const d of derived) {
    if (d.type === "dropped") { add("finding_dropped_silently", `findings.${d.id}`, "A finding must be kept and marked resolved or retracted, not deleted"); continue; }
    const c = recorded.get(d.id);
    if (!c) { add("change_not_recorded", `release.changes.${d.id}`, "Every finding needs a recorded change"); continue; }
    if (c.change_type !== d.type) add("change_type_mismatch", `release.changes.${d.id}`, `Recorded ${c.change_type} but the content shows ${d.type}`);
    if (d.type !== "unchanged") {
      if (!c.reason.trim()) add("change_without_reason", `release.changes.${d.id}`, "State why it changed");
      if (d.type !== "new") {
        if (c.new_evidence_ids.length === 0) add("change_without_evidence", `release.changes.${d.id}`, "Name the new evidence responsible");
        for (const id of c.new_evidence_ids) {
          if (!nextEv.has(id)) add("dangling_reference", `release.changes.${d.id}`, `Evidence ${id} does not exist`);
          else if (prevEvIds.has(id)) add("evidence_not_new", `release.changes.${d.id}`, `Evidence ${id} was already in the earlier revision`);
        }
      }
    }
  }
  for (const c of next.release.changes) if (!derived.some((d) => d.id === c.finding_id)) add("change_for_unknown_finding", `release.changes.${c.finding_id}`, "Change names a finding that does not exist");
  return out;
}
