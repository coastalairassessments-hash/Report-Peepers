import type { Entry } from "./library.js";
import { PARKED_FAMILIES } from "./library.js";
import { registered, type ReviewerRegistry } from "./reviewers.js";

export type DecisionKind = "accept" | "revise" | "reject" | "discuss" | "approve";
export interface Decision {
  entry_id: string; version: string; reviewer: string; role: "iep" | "owner"; decision: DecisionKind;
  reason_code: string | null; comment: string; answer: string; seconds: number; at: string;
}
export const EDITABLE = ["title", "principle", "rationale", "applies_to", "not_applies_to", "evidence_required", "decision_steps", "exceptions", "prohibited_inferences", "homeowner_question", "reviewer_action", "example", "counterexample", "source_hints", "iep_question"] as const;
export type EditableField = (typeof EDITABLE)[number];
export interface Edit { entry_id: string; author: string; at: string; note: string; fields: Partial<Pick<Entry, EditableField>> }
export type Status = "ai_draft" | "in_review" | "revise" | "discussion" | "rejected" | "iep_accepted" | "approved" | "parked";
export type TestResults = Record<string, { executed: boolean; passed: boolean }>;

/** Every edit makes a new version. The original text is never changed. */
export const currentVersion = (base: Entry, edits: Edit[]): string => (edits.length ? `${base.version}+e${edits.length}` : base.version);
export const currentEntry = (base: Entry, edits: Edit[]): Entry => edits.reduce<Entry>((e, ed) => ({ ...e, ...(ed.fields as Partial<Entry>) }), structuredClone(base));

/** Status from the decisions made on the CURRENT version only. Approvals for an older version no longer count. */
export function statusOf(base: Entry, edits: Edit[], decisions: Decision[], registry?: ReviewerRegistry): Status {
  if (registry) decisions = registered(registry, decisions);
  if (PARKED_FAMILIES.includes(base.family)) return "parked";
  const ver = currentVersion(base, edits);
  const mine = decisions.filter((d) => d.entry_id === base.id);
  const now = mine.filter((d) => d.version === ver);
  if (!now.length) return edits.length || mine.length ? "in_review" : "ai_draft";
  const latest = (role: "iep" | "owner") => {
    const m = new Map<string, Decision>();
    for (const d of now) if (d.role === role) m.set(d.reviewer, d);
    return [...m.values()];
  };
  const iep = latest("iep"), owner = latest("owner");
  const accepts = new Set(iep.filter((d) => d.decision === "accept").map((d) => d.reviewer));
  // E13: the owner's approval of the current version is enough. A second reviewer is optional.
  if (owner.some((d) => d.decision === "approve")) return "approved";
  if (iep.some((d) => d.decision === "reject")) return "rejected";
  if (iep.some((d) => d.decision === "revise")) return "revise";
  if (iep.some((d) => d.decision === "discuss")) return "discussion";
  if (accepts.size >= 1) return "iep_accepted";
  return "in_review";
}

/** Live only when approved and every one of its tests has run and passed. */
export function isLive(base: Entry, edits: Edit[], decisions: Decision[], results: TestResults): boolean {
  if (statusOf(base, edits, decisions) !== "approved") return false;
  return currentEntry(base, edits).fixtures.every((f) => results[f.id]?.executed === true && results[f.id]?.passed === true);
}
