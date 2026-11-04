import type { Scope, Restriction } from "@report-peepers/contracts";

export type Choice = "yes" | "no" | "unsure";
export type RestrictionKind = Restriction["kind"];

export interface QuestionDef {
  id: string;
  text: string;
  why: string; // shown to the client: why we ask
  kind: "text" | "choice" | "yes_no_unsure" | "service";
  options?: string[];
  restriction?: RestrictionKind[]; // restriction kinds this question establishes
}

/** Q01-Q12 from the spec, asked one at a time. Wording is neutral: no blame, no inference from price or length. */
export const QUESTION_BANK: QuestionDef[] = [
  { id: "Q01", kind: "text", text: "What did you hope to learn from this report, and what decision are you facing?", why: "So the review answers your actual question." },
  { id: "Q02", kind: "yes_no_unsure", text: "Was the inspection limited in any way?", why: "Limits change what a report can reasonably conclude." },
  { id: "Q03", kind: "service", text: "What service were you sold?", why: "Labels vary, so we read what was actually agreed.",
    options: ["Sampling only", "Screening", "Limited assessment", "Broader assessment", "Review of a remediation protocol", "Not sure"] },
  { id: "Q04", kind: "yes_no_unsure", text: "Was the visit time capped (for example, one hour)?", why: "Time limits shape how much could be checked.", restriction: ["time"] },
  { id: "Q05", kind: "yes_no_unsure", text: "Was the number or type of samples capped (for example, three air samples)?", why: "A sampling package is different from a decision not to sample more.", restriction: ["samples"] },
  { id: "Q06", kind: "yes_no_unsure", text: "Did a budget limit what was done?", why: "Budget can explain why certain steps were not taken.", restriction: ["budget"] },
  { id: "Q07", kind: "yes_no_unsure", text: "Were specific rooms, surfaces, systems, or concerns included or left out?", why: "We only judge areas the work covered.", restriction: ["areas"] },
  { id: "Q08", kind: "yes_no_unsure", text: "Were any methods, equipment, test materials, moving of belongings, or opening of walls limited or declined?", why: "Some questions can only be answered with certain methods.", restriction: ["methods", "equipment_materials"] },
  { id: "Q09", kind: "yes_no_unsure", text: "Were any areas hard or impossible to reach, for reasons other than your own choice?", why: "Unreachable areas are unknown, not clean or affected.", restriction: ["access"] },
  { id: "Q10", kind: "text", text: "For each limit, who proposed it, and what did you understand the effect to be?", why: "Keeps the review fair to everyone involved." },
  { id: "Q11", kind: "yes_no_unsure", text: "Do you have other written records or verbal findings from the inspector?", why: "Existing records may already answer open questions." },
  { id: "Q12", kind: "text", text: "What question do you still feel is unanswered?", why: "So we focus on what matters to you." },
];

export interface Answer {
  choice?: Choice;
  text?: string;
  value?: number;
  unit?: string;
  proposedBy?: Restriction["proposed_by"];
  service?: string;
}
export type Answers = Record<string, Answer>;

const byId = (id: string) => QUESTION_BANK.find((q) => q.id === id)!;
const RESTRICTION_Q = ["Q04", "Q05", "Q06", "Q07", "Q08", "Q09"];
const isAnswered = (a?: Answer) => !!a && (a.choice !== undefined || !!a.text?.trim() || a.service !== undefined);

/** Skip rules. Q02 = "no" skips the restriction questions. Q10 only if some limit was reported. */
export function isApplicable(id: string, answers: Answers): boolean {
  if (RESTRICTION_Q.includes(id)) return answers["Q02"]?.choice !== "no";
  if (id === "Q10") return RESTRICTION_Q.some((q) => answers[q]?.choice === "yes");
  return true;
}

/** The next unanswered, applicable question. null when intake is complete. One at a time. */
export function nextQuestion(answers: Answers): QuestionDef | null {
  return QUESTION_BANK.find((q) => isApplicable(q.id, answers) && !isAnswered(answers[q.id])) ?? null;
}

const SERVICE_LABEL: Record<string, Scope["service_label"]> = {
  "Sampling only": "sampling_only", "Screening": "screening", "Limited assessment": "limited_assessment",
  "Broader assessment": "broader_assessment", "Review of a remediation protocol": "protocol",
};

/** Build the plain scope record from answers. Silence stays "unknown": never inferred as none or present. */
export function buildScope(answers: Answers): Scope {
  const q2 = answers["Q02"]?.choice;
  const restrictions: Restriction[] = [];
  for (const qid of RESTRICTION_Q) {
    const def = byId(qid);
    const a = answers[qid];
    const status: Restriction["status"] =
      q2 === "no" ? "explicitly_none" : a?.choice === "yes" ? "present" : a?.choice === "no" ? "explicitly_none" : "unknown";
    for (const kind of def.restriction!) {
      restrictions.push({
        id: `RES-${kind}`, kind, status,
        description: status === "present" ? (a?.text?.trim() || def.text) : status === "explicitly_none" ? "Client reports no limit of this kind." : "Not yet answered or client is unsure.",
        limit_value: status === "present" ? a?.value ?? null : null,
        limit_unit: status === "present" ? a?.unit ?? null : null,
        proposed_by: status === "present" ? a?.proposedBy ?? "unknown" : "unknown",
        agreed_status: "unknown", consequences_explained: "unknown",
        basis_evidence_ids: [], client_answer_ids: a ? [qid] : q2 ? ["Q02"] : [],
      });
    }
  }
  const goal = answers["Q01"]?.text?.trim();
  const svc = answers["Q03"]?.service;
  return {
    client_goal: goal || "Not yet stated by client.",
    decision_at_stake: goal || "Not yet stated by client.",
    service_description: svc && svc !== "Not sure" ? svc : "Client is not sure what service was purchased.",
    service_label: (svc && SERVICE_LABEL[svc]) || "unknown",
    included_areas: [], excluded_areas: [],
    restrictions,
    confirmation_status: "unconfirmed", confirmed_at: null,
    unresolved_discrepancies: [],
    client_understanding: answers["Q10"]?.text?.trim() || "Not yet stated by client.",
  };
}

/** Plain-language summary shown to the client before they confirm. */
export function summarizeScope(scope: Scope): string[] {
  const lines = [`Your goal: ${scope.client_goal}`, `Service: ${scope.service_description}`];
  const phrase: Record<Restriction["status"], string> = {
    present: "limited", explicitly_none: "no limit reported", unknown: "not known yet", conflicting: "records disagree",
  };
  const seen = new Set<string>();
  for (const r of scope.restrictions) {
    if (seen.has(r.kind)) continue; seen.add(r.kind);
    lines.push(`${r.kind.replace("_", " / ")}: ${phrase[r.status]}${r.status === "present" ? ` (${r.description})` : ""}`);
  }
  return lines;
}

export type ConfirmResult =
  | { ok: true; scope: Scope }
  | { ok: false; reason: "goal_missing" | "unknown_limits_need_conditional"; unknownKinds?: string[] };

/**
 * Confirm the scope. Fully "confirmed" needs a stated goal and no unknown limits.
 * If anything is unknown, the client may choose a conditional review instead.
 */
export function confirmScope(scope: Scope, opts: { conditional?: boolean; now?: string } = {}): ConfirmResult {
  if (scope.client_goal.startsWith("Not yet stated")) return { ok: false, reason: "goal_missing" };
  const unknownKinds = [...new Set(scope.restrictions.filter((r) => r.status === "unknown" || r.status === "conflicting").map((r) => r.kind))];
  if (unknownKinds.length && !opts.conditional) return { ok: false, reason: "unknown_limits_need_conditional", unknownKinds };
  return {
    ok: true,
    scope: { ...scope, confirmation_status: unknownKinds.length ? "conditional" : "confirmed", confirmed_at: opts.now ?? new Date().toISOString() },
  };
}

/**
 * Record that the agreement and the client's recollection disagree about a limit.
 * Both accounts are kept word for word; neither is chosen. Returns a new scope.
 */
export function recordScopeConflict(scope: Scope, kind: RestrictionKind, accounts: { agreement: string; client: string }): Scope {
  const agreement = accounts.agreement?.trim(), client = accounts.client?.trim();
  if (!agreement || !client) throw new Error("Both accounts are needed to record a conflict.");
  if (!scope.restrictions.some((r) => r.kind === kind)) throw new Error(`No restriction of kind "${kind}" in this scope.`);
  const next = structuredClone(scope);
  for (const r of next.restrictions) {
    if (r.kind !== kind) continue;
    r.status = "conflicting";
    r.agreed_status = "conflicting";
    r.description = `Agreement says: "${agreement}" | Client says: "${client}"`;
  }
  next.unresolved_discrepancies.push(`${kind}: agreement says "${agreement}"; client says "${client}"`);
  next.conflict_accounts = [...(next.conflict_accounts ?? []).filter((c) => c.kind !== kind), { kind, agreement_account: agreement, client_account: client, status: "open", choice: null, note: null }];
  return next;
}

/**
 * The client decides how a conflict stands. The outcome is stated by the client, never inferred.
 * Both accounts stay on record; the decision and the reason are added.
 */
export function resolveScopeConflict(
  scope: Scope,
  kind: RestrictionKind,
  decision: { choice: "agreement" | "client" | "both_stand"; outcome: "present" | "explicitly_none" | "unknown"; note: string },
): Scope {
  if (!decision.note?.trim()) throw new Error("A resolution needs a note saying why.");
  const targets = scope.restrictions.filter((r) => r.kind === kind && r.status === "conflicting");
  if (targets.length === 0) throw new Error(`No conflicting restriction of kind "${kind}" to resolve.`);
  const next = structuredClone(scope);
  for (const r of next.restrictions) {
    if (r.kind !== kind || r.status !== "conflicting") continue;
    r.status = decision.choice === "both_stand" ? "conflicting" : decision.outcome;
    if (decision.choice !== "both_stand") r.agreed_status = "unknown";
    r.description = `${r.description} | Decision (${decision.choice}): ${decision.note.trim()}`;
  }
  next.unresolved_discrepancies.push(`Resolved ${kind}: relied on ${decision.choice}. ${decision.note.trim()}`);
  next.conflict_accounts = (next.conflict_accounts ?? []).map((c) =>
    c.kind === kind ? { ...c, status: decision.choice === "both_stand" ? "open" : "resolved", choice: decision.choice, note: decision.note.trim() } : c);
  return next;
}
