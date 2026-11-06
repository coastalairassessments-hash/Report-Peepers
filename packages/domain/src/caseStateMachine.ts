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
  /** ADR-006: set only by autoReleaseGates, when every gate passed. */
  automaticGatesPassed?: boolean;
  /** Which release path is being taken. Absent means the person-reviewed path. */
  releaseMode?: "human" | "automatic";
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
type FactKey = Exclude<keyof Facts, "releaseMode">;

/** Guard table: transition -> facts that must all be true. Mirrors spec "guards". */
export const GUARDS: Record<string, FactKey[]> = {
  "awaiting_payment -> ready_for_analysis": ["entitlementVerified", "scopeConfirmedOrConditional", "preflightComplete"],
  "analysis -> awaiting_reviewer": ["typedOutputValidated", "ambiguitiesAddressed", "referencesVerified", "prohibitedClaimsAbsent"],
  "awaiting_reviewer -> released": ["humanApprovalRecorded", "activeRevisionUnchanged", "entitlementVerified", "rightsRechecked", "releaseImmutableAligned"],
  "revision_pending -> ready_for_analysis": ["newScopeConfirmed", "clarificationEntitlementValid", "newDocsPreflighted", "oldRunsSuperseded"],
  "failed -> analysis": ["retryable", "sameSnapshotOrNewRun", "entitlementVerified", "attemptCapOk"],
  "deletion_pending -> deleted": ["queuedWorkCancelled", "derivedDataDeleted", "grantsInvalidated", "tombstoneStored", "onlyMinimizedTransactionData"],
};

/** Automatic mode (ADR-006): the gates stand in for the person. Human approval never counts here. */
export const AUTOMATIC_GUARDS: Record<string, FactKey[]> = {
  "awaiting_reviewer -> released": ["automaticGatesPassed", "activeRevisionUnchanged", "entitlementVerified", "rightsRechecked", "releaseImmutableAligned"],
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
  const key = `${from} -> ${to}`;
  const required = facts.releaseMode === "automatic" && AUTOMATIC_GUARDS[key] ? AUTOMATIC_GUARDS[key] : GUARDS[key];
  if (required) {
    const missing = required.filter((k) => facts[k] !== true);
    if (missing.length) return { ok: false, reason: "guard_failed", missing };
  }
  return { ok: true, to: to as CaseState };
}
