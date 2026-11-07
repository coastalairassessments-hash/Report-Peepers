import type { CaseSnapshot } from "@report-peepers/contracts";
import { buildSummaryRecord, factsFrom } from "../analysis/record.js";
import { blockedNamesFrom } from "../analysis/scrub.js";
import { checkIntegrity, wordingProblems } from "../integrity.js";
import { exportRelease } from "../release.js";
import { exportMarkup } from "../render/exportMarkup.js";
import { fingerprint } from "../revision.js";
import { DOCUMENT_VERSION_ID } from "./analyze.js";
import { sha256Hex } from "./hash.js";
import { move, type StepFailure } from "./intake.js";
import type { Actor, ReleasedOutputs, Services } from "./types.js";

/** What the reviewer decides. Nothing is released without every part of this. */
export interface ReviewerDecision {
  reviewer_id: string;
  reviewer_scope: string;
  /** The fingerprint of the draft the reviewer looked at. If the draft has changed since, the decision is refused. */
  reviewed_fingerprint: string;
  include_finding_ids: string[];
  /** Optional wording changes. Each is checked against the wording rules and recorded as reviewer-changed. */
  edits?: { finding_id: string; title?: string; question_text?: string }[];
  pattern_tags: Record<string, string>;
  acknowledged_issue_ids: string[];
  /** Required, even when it says there is nothing to disclose. */
  conflict_disclosure: string;
  overview: string;
}

export type ReleaseResult =
  | { ok: true; record_saved: boolean; notices: { finding_id: string; kind: string }[] }
  | (StepFailure & { problems?: string[] });

/** The fingerprint a reviewer's decision must quote. */
export const reviewFingerprint = (snapshot: CaseSnapshot): string => fingerprint(snapshot as never);

/**
 * Applies the reviewer's decision. Every check runs before anything is saved: a refusal leaves the case awaiting review,
 * untouched. Approval, the marked-up copy, and the saved record all come from the same approved draft, once.
 */
export async function releaseCase(svc: Services, caseId: string, d: ReviewerDecision): Promise<ReleaseResult> {
  const actor: Actor = { role: "reviewer", id: d.reviewer_id };
  const rec = await svc.repo.get(actor, caseId);
  if (!rec) return { ok: false, reason: "not_found" };
  if (rec.state !== "awaiting_reviewer" || !rec.snapshot || !rec.source || !rec.scope) return { ok: false, reason: "wrong_state", detail: rec.state };
  if (rec.reviewer_id !== d.reviewer_id) return { ok: false, reason: "not_assigned" };
  if (reviewFingerprint(rec.snapshot) !== d.reviewed_fingerprint) return { ok: false, reason: "stale_review", detail: "The draft changed after it was reviewed." };
  if (!d.conflict_disclosure.trim()) return { ok: false, reason: "conflict_disclosure_required" };
  if (!d.reviewer_scope.trim()) return { ok: false, reason: "reviewer_scope_required" };
  if (!d.overview.trim()) return { ok: false, reason: "overview_required" };

  const open = rec.issues.filter((i) => !d.acknowledged_issue_ids.includes(i.id)).map((i) => i.id);
  if (open.length) return { ok: false, reason: "unacknowledged_issues", missing: open };

  const snap = structuredClone(rec.snapshot) as CaseSnapshot;
  const known = new Set(snap.findings.map((f) => f.id));
  const include = [...new Set(d.include_finding_ids)];
  if (include.length === 0) return { ok: false, reason: "nothing_included" };
  const unknown = include.filter((id) => !known.has(id));
  if (unknown.length) return { ok: false, reason: "unknown_finding", missing: unknown };

  const changed: string[] = [];
  const problems: string[] = [];
  for (const e of d.edits ?? []) {
    const f = snap.findings.find((x) => x.id === e.finding_id);
    if (!f || !include.includes(f.id)) return { ok: false, reason: "edit_not_on_included_finding", detail: e.finding_id };
    if (e.title !== undefined) { const p = wordingProblems(e.title); if (p.length || !e.title.trim()) problems.push(...p.map((x) => `${f.id} title ${x}`), ...(e.title.trim() ? [] : [`${f.id} title empty`])); else f.title = e.title; }
    if (e.question_text !== undefined) {
      const q = snap.questions.find((x) => f.question_ids.includes(x.id));
      const p = wordingProblems(e.question_text);
      if (!q) problems.push(`${f.id} has no question to edit`);
      else if (p.length || !e.question_text.trim()) problems.push(...p.map((x) => `${f.id} question ${x}`), ...(e.question_text.trim() ? [] : [`${f.id} question empty`]));
      else q.text = e.question_text;
    }
    if (!changed.includes(f.id)) changed.push(f.id);
  }
  if (problems.length) return { ok: false, reason: "edit_breaks_rule", problems };

  // Keep only what the reviewer included, and drop questions no kept finding uses.
  snap.findings = snap.findings.filter((f) => include.includes(f.id));
  const usedQ = new Set(snap.findings.flatMap((f) => f.question_ids));
  snap.questions = snap.questions.filter((q) => usedQ.has(q.id));
  for (const f of snap.findings) f.human_approved = true;
  const now = svc.now();
  snap.release = {
    ...snap.release, status: "published", human_review_status: "approved", reviewer_id: d.reviewer_id, reviewer_scope: d.reviewer_scope.trim(), published_at: now,
    overview: d.overview.trim(), reviewer_conflict_disclosure: d.conflict_disclosure.trim(),
    attention_finding_ids: snap.findings.filter((f) => f.finding_type !== "supported_reasoning").map((f) => f.id),
    supported_finding_ids: snap.findings.filter((f) => f.finding_type === "supported_reasoning").map((f) => f.id),
    leading_question_ids: snap.questions.map((q) => q.id).slice(0, svc.markup.leading_questions_max),
  };
  const overviewProblems = wordingProblems(snap.release.overview);
  if (overviewProblems.length) return { ok: false, reason: "edit_breaks_rule", problems: overviewProblems.map((x) => `overview ${x}`) };
  const integrity = checkIntegrity(snap);
  if (integrity.length) return { ok: false, reason: "integrity", problems: integrity.slice(0, 5).map((i) => `${i.code} at ${i.path}`) };

  const entitled = await svc.entitlement.verified(rec.id, rec.owner_id);
  let bytes: Uint8Array;
  try { bytes = await svc.files.get(rec.source.file_ref); } catch { return { ok: false, reason: "source_missing" }; }
  const sourceIntact = sha256Hex(bytes) === rec.source.sha256;

  const fp = fingerprint(snap as never);
  const out = await exportMarkup(snap, fp, bytes, DOCUMENT_VERSION_ID, svc.markup);
  if (!out.ok) return { ok: false, reason: `markup_${out.reason}`, ...(out.detail ? { detail: out.detail } : {}), ...(out.problems ? { problems: out.problems.map((p) => JSON.stringify(p)).slice(0, 5) } : {}) };

  const exp = exportRelease(snap as never, fp);
  const facts = factsFrom(snap);
  if (!exp.ok || !facts) return { ok: false, reason: "release_not_exportable" };
  const built = buildSummaryRecord(exp.view, facts, { pattern_codes: d.pattern_tags, reviewer_changed: changed }, blockedNamesFrom(snap), svc.patterns);
  if (!built.ok) return { ok: false, reason: `record_${built.reason}` };

  const t = move(rec, "released", { humanApprovalRecorded: true, activeRevisionUnchanged: true, entitlementVerified: entitled, rightsRechecked: sourceIntact, releaseImmutableAligned: true });
  if (!t.ok) return { ok: false, reason: t.reason, ...(t.missing ? { missing: t.missing } : {}) };

  const outputs: ReleasedOutputs = { markup_pdf: out.pdf, text: out.text, hashes: out.hashes, record_id: built.record.record_id, delivered_at: svc.now() };
  rec.snapshot = snap; rec.published_fingerprint = fp; rec.released = outputs;
  rec.issues = rec.issues.map((i) => ({ ...i, acknowledged: true }));
  await svc.repo.save(actor, rec);

  // The record holds no link to the case. A failure here is reported, never retried into a duplicate.
  let saved = true;
  try { await svc.records.save(built.record); } catch { saved = false; }
  return { ok: true, record_saved: saved, notices: built.notices.map((n) => ({ finding_id: n.finding_id, kind: n.kind })) };
}

/** The released files, for the owner, the reviewer, or the system. Rechecks the release is unchanged since publication. */
export async function downloadRelease(svc: Services, actor: Actor, caseId: string): Promise<{ ok: true; pdf: Uint8Array; text: string } | StepFailure> {
  const rec = await svc.repo.get(actor, caseId);
  if (!rec) return { ok: false, reason: "not_found" };
  if (rec.state !== "released" || !rec.released || !rec.snapshot || !rec.published_fingerprint) return { ok: false, reason: "not_released" };
  const exp = exportRelease(rec.snapshot as never, rec.published_fingerprint);
  if (!exp.ok) return { ok: false, reason: exp.reason, ...(exp.notice ? { detail: exp.notice } : {}) };
  if (sha256Hex(rec.released.markup_pdf) !== rec.released.hashes.output_sha256) return { ok: false, reason: "output_changed" };
  return { ok: true, pdf: new Uint8Array(rec.released.markup_pdf), text: rec.released.text };
}
