import spec from "../../../docs/spec/workflow_transitions.json" with { type: "json" };

export type CaseState = keyof typeof spec.case_transitions;

/** Server-known facts that guards check. Payment appears only as a yes/no fact. */
export interface Facts {
  entitlementVerified?: boolean;
  scopeConfirmedOrConditional?: boolean;
  preflightComplete?: boolean;
  typedOutputValidated?: boolean;
  ambiguitiesAddressed?: boolean;
  referencesVerified?: boolean;
  prohibitedClaimsAbsent?: boolean;
  humanApprovalRecorded?: boolean;
  activeRevisionUnchanged?: boolean;
  rightsRechecked?: boolean;
  releaseImmutableAligned?: boolean;
  newScopeConfirmed?: boolean;
  clarificationEntitlementValid?: boolean;
  newDocsPreflighted?: boolean;
  oldRunsSuperseded?: boolean;
  retryable?: boolean;
  sameSnapshotOrNewRun?: boolean;
  attemptCapOk?: boolean;
  queuedWorkCancelled?: boolean;
  derivedDataDeleted?: boolean;
  grantsInvalidated?: boolean;
  tombstoneStored?: boolean;
  onlyMinimizedTransactionData?: boolean;
}
type FactKey = keyof Facts;

/** Guard table: transition -> facts that must all be true. Mirrors spec "guards". */
export const GUARDS: Record<string, FactKey[]> = {
  "awaiting_payment -> ready_for_analysis": ["entitlementVerified", "scopeConfirmedOrConditional", "preflightComplete"],
  "analysis -> awaiting_reviewer": ["typedOutputValidated", "ambiguitiesAddressed", "referencesVerified", "prohibitedClaimsAbsent"],
  "awaiting_reviewer -> released": ["humanApprovalRecorded", "activeRevisionUnchanged", "entitlementVerified", "rightsRechecked", "releaseImmutableAligned"],
  "revision_pending -> ready_for_analysis": ["newScopeConfirmed", "clarificationEntitlementValid", "newDocsPreflighted", "oldRunsSuperseded"],
  "failed -> analysis": ["retryable", "sameSnapshotOrNewRun", "entitlementVerified", "attemptCapOk"],
  "deletion_pending -> deleted": ["queuedWorkCancelled", "derivedDataDeleted", "grantsInvalidated", "tombstoneStored", "onlyMinimizedTransactionData"],
};

export type TransitionResult =
  | { ok: true; to: CaseState }
  | { ok: false; reason: "unknown_state" | "not_allowed" | "guard_failed"; missing?: FactKey[] };

const table = spec.case_transitions as Record<string, string[]>;

export function allowedNext(from: CaseState): string[] {
  return table[from] ?? [];
}

/** Single entry point for moving a case. Anything not explicitly allowed is refused. */
export function transition(from: string, to: string, facts: Facts = {}): TransitionResult {
  if (!(from in table) || !(to in table)) return { ok: false, reason: "unknown_state" };
  if (!table[from]!.includes(to)) return { ok: false, reason: "not_allowed" };
  const required = GUARDS[`${from} -> ${to}`];
  if (required) {
    const missing = required.filter((k) => facts[k] !== true);
    if (missing.length) return { ok: false, reason: "guard_failed", missing };
  }
  return { ok: true, to: to as CaseState };
}
