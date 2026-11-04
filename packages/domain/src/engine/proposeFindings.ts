import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { CaseSnapshot } from "@report-peepers/contracts";
import { checkIntegrity, type Issue } from "../integrity.js";
import { runStage, type Stage, type StageOutcome } from "./runStage.js";
import type { AuditRecord } from "./audit.js";
import type { ModelPort } from "./port.js";

type Snap = CaseSnapshot;

/* ---------- what the model may say ---------- */

const NES = { type: "string", minLength: 1 } as const;
const IDS = { type: "array", maxItems: 50, items: NES } as const;
const LOCAL = { type: "string", pattern: "^[A-Za-z0-9_-]{1,40}$" } as const;
const obj = (required: string[], properties: Record<string, unknown>) => ({ type: "object", additionalProperties: false, required, properties });

/**
 * The reply schema is the firewall's first wall. It has no field for approval, release, payment, reviewer, permissions,
 * or reference verification, and every object forbids extra fields, so a model cannot set them even if told to.
 */
export const PROPOSAL_SCHEMA = obj(["questions", "hypotheses", "findings"], {
  questions: { type: "array", maxItems: 100, items: obj(["local_id", "audience", "text", "trigger_evidence_ids", "trigger_claim_ids", "why_it_matters", "decision_it_can_change", "stop_condition"], {
    local_id: LOCAL, audience: { enum: ["client", "original_inspector"] }, text: NES, trigger_evidence_ids: IDS, trigger_claim_ids: IDS,
    why_it_matters: NES, decision_it_can_change: NES, stop_condition: NES,
  }) },
  hypotheses: { type: "array", maxItems: 50, items: obj(["local_id", "claim_id", "mechanism", "support_evidence_ids", "counter_evidence_ids", "alternative_explanations", "time_compatible", "status", "what_would_change_interpretation", "concise_rationale"], {
    local_id: LOCAL, claim_id: NES, mechanism: NES, support_evidence_ids: IDS, counter_evidence_ids: IDS, alternative_explanations: IDS,
    time_compatible: { enum: ["yes", "no", "unknown"] }, status: { enum: ["supported_with_limits", "plausible_unconfirmed", "insufficiently_supported", "contradicted", "indeterminate"] },
    what_would_change_interpretation: IDS, concise_rationale: NES,
  }) },
  findings: { type: "array", maxItems: 50, items: obj(["local_id", "finding_type", "title", "explanation", "claim_ids", "support_evidence_ids", "counter_evidence_ids", "reference_bindings", "evidence_strength", "decision_relevance", "uncertainty", "question_local_ids", "possible_next_steps", "resolution_condition", "assumptions"], {
    local_id: LOCAL,
    // a verified departure needs a person to verify the reference; the model cannot propose one
    finding_type: { enum: ["supported_reasoning", "clarification_needed", "documentation_limitation", "insufficiently_supported_recommendation", "internal_inconsistency"] },
    title: NES, explanation: NES, claim_ids: IDS, support_evidence_ids: IDS, counter_evidence_ids: IDS,
    reference_bindings: { type: "array", maxItems: 20, items: obj(["reference_id", "relevance_explanation"], { reference_id: NES, relevance_explanation: NES }) },
    evidence_strength: { enum: ["strong", "moderate", "limited", "indeterminate"] }, decision_relevance: { enum: ["material", "contextual"] },
    uncertainty: NES, question_local_ids: { type: "array", maxItems: 50, items: LOCAL }, possible_next_steps: IDS, resolution_condition: NES, assumptions: IDS,
  }) },
});

export interface Proposal {
  questions: { local_id: string; audience: "client" | "original_inspector"; text: string; trigger_evidence_ids: string[]; trigger_claim_ids: string[]; why_it_matters: string; decision_it_can_change: string; stop_condition: string }[];
  hypotheses: { local_id: string; claim_id: string; mechanism: string; support_evidence_ids: string[]; counter_evidence_ids: string[]; alternative_explanations: string[]; time_compatible: "yes" | "no" | "unknown"; status: "supported_with_limits" | "plausible_unconfirmed" | "insufficiently_supported" | "contradicted" | "indeterminate"; what_would_change_interpretation: string[]; concise_rationale: string }[];
  findings: { local_id: string; finding_type: "supported_reasoning" | "clarification_needed" | "documentation_limitation" | "insufficiently_supported_recommendation" | "internal_inconsistency"; title: string; explanation: string; claim_ids: string[]; support_evidence_ids: string[]; counter_evidence_ids: string[]; reference_bindings: { reference_id: string; relevance_explanation: string }[]; evidence_strength: "strong" | "moderate" | "limited" | "indeterminate"; decision_relevance: "material" | "contextual"; uncertainty: string; question_local_ids: string[]; possible_next_steps: string[]; resolution_condition: string; assumptions: string[] }[];
}

/* ---------- what the model may see ---------- */

/** The allow-list. Case material goes in as quoted data; approvals, release, payment, reviewer, and blocked sources never go in. */
export function buildContext(s: Snap): Record<string, unknown> {
  return {
    scope: {
      client_goal: s.scope.client_goal, decision_at_stake: s.scope.decision_at_stake, service_description: s.scope.service_description,
      service_label: s.scope.service_label, included_areas: s.scope.included_areas, excluded_areas: s.scope.excluded_areas,
      restrictions: s.scope.restrictions.map((r) => ({ kind: r.kind, status: r.status, description: r.description })),
    },
    areas: s.areas.map((a) => ({ id: a.id, name: a.name, kind: a.kind, condition_status: a.condition_status, assessed_scope: a.assessed_scope })),
    evidence: s.evidence.map((e) => ({
      id: e.id, origin: e.origin, quoted_statement: e.statement, quoted_text: e.anchor.exact_text, observed_time: e.observed_time,
      time_basis: e.time_basis, quality_status: e.quality_status, area_ids: e.area_ids, contradicts_ids: e.contradicts_ids,
    })),
    claims: s.claims.map((c) => ({ id: c.id, text: c.text, claim_type: c.claim_type, basis_evidence_ids: c.basis_evidence_ids, area_ids: c.area_ids, strength_in_report: c.strength_in_report })),
    existing_hypotheses: s.hypotheses.map((h) => ({ id: h.id, claim_id: h.claim_id, status: h.status })),
    sources_you_may_name: s.references.filter((r) => r.ai_use_status === "authorized" || r.ai_use_status === "metadata_only").map((r) => ({ id: r.id, publisher: r.publisher, title: r.title, edition: r.edition })),
  };
}

const PROMPT_FILE = resolve(import.meta.dirname, "../../../../data/rules/prompts/propose_findings.v1.md");

export const proposeFindingsStage: Stage<Snap, Proposal> = {
  name: "propose_findings",
  promptVersion: "propose_findings.v1",
  instructions: readFileSync(PROMPT_FILE, "utf8"),
  buildData: buildContext,
  schema: PROPOSAL_SCHEMA,
};

/* ---------- turning a valid reply into drafts ---------- */

export interface HeldBack { id: string; kind: "finding" | "hypothesis" | "question"; issues: Issue[] }
export interface ApplyResult { snapshot: Snap; held_back: HeldBack[] }

const key = (i: Issue) => `${i.code}|${i.path}|${i.message}`;

/**
 * Adds the proposal to a copy of the snapshot as unapproved drafts, then lets the plain-code checks decide.
 * A draft with any new integrity issue is held back, and so is anything that depended on it. The model's word is never the check.
 */
export function applyProposal(snapshot: Snap, p: Proposal): ApplyResult {
  if (snapshot.schema_version !== "0.2") throw new Error("The AI slot needs a version 0.2 snapshot.");
  const baseKeys = new Set(checkIntegrity(snapshot).map(key));
  const nF = snapshot.findings.length, nH = snapshot.hypotheses.length, nQ = snapshot.questions.length;

  type Draft<T> = { id: string; local: string; value: T };
  let qs: Draft<Snap["questions"][number]>[] = p.questions.map((q) => ({ id: `AI-Q-${q.local_id}`, local: q.local_id, value: {
    id: `AI-Q-${q.local_id}`, audience: q.audience, text: q.text, trigger_evidence_ids: q.trigger_evidence_ids, trigger_claim_ids: q.trigger_claim_ids,
    why_it_matters: q.why_it_matters, answer_options: [], allows_unsure: true, decision_it_can_change: q.decision_it_can_change, stop_condition: q.stop_condition, status: "pending" } }));
  let hs: Draft<Snap["hypotheses"][number]>[] = p.hypotheses.map((h) => ({ id: `AI-HY-${h.local_id}`, local: h.local_id, value: {
    id: `AI-HY-${h.local_id}`, claim_id: h.claim_id, mechanism: h.mechanism, support_evidence_ids: h.support_evidence_ids, counter_evidence_ids: h.counter_evidence_ids,
    alternative_explanations: h.alternative_explanations, time_compatible: h.time_compatible, status: h.status,
    what_would_change_interpretation: h.what_would_change_interpretation, concise_rationale: h.concise_rationale } }));
  const unknownQuestion = new Set<string>();
  let fs: Draft<Snap["findings"][number]>[] = p.findings.map((f) => ({ id: `AI-F-${f.local_id}`, local: f.local_id, value: {
    id: `AI-F-${f.local_id}`, finding_type: f.finding_type, title: f.title, explanation: f.explanation, claim_ids: f.claim_ids, action_ids: [],
    support_evidence_ids: f.support_evidence_ids, counter_evidence_ids: f.counter_evidence_ids,
    reference_bindings: f.reference_bindings.map((b) => ({ reference_id: b.reference_id, verified_locator: null, relevance_explanation: b.relevance_explanation, support_verified: false, applicability_verified: false, permission_verified: false, verified_by: null })),
    evidence_strength: f.evidence_strength, decision_relevance: f.decision_relevance, uncertainty: f.uncertainty,
    question_ids: f.question_local_ids.map((l) => `AI-Q-${l}`), possible_next_steps: f.possible_next_steps, resolution_condition: f.resolution_condition,
    human_approved: false, resolution_status: "open", assumptions: f.assumptions, calculation_ids: [] } }));

  const held = new Map<string, HeldBack>();
  const hold = (id: string, kind: HeldBack["kind"], issue: Issue) => { const h = held.get(id) ?? { id, kind, issues: [] }; h.issues.push(issue); held.set(id, h); };

  // a finding may only name questions that were proposed alongside it
  const proposedQ = new Set(qs.map((q) => q.local));
  fs = fs.filter((f, i) => {
    const bad = p.findings[i]!.question_local_ids.filter((l) => !proposedQ.has(l));
    bad.forEach((l) => { unknownQuestion.add(f.id); hold(f.id, "finding", { code: "unknown_question_reference", path: f.id, message: `Question ${l} was not proposed` }); });
    return !bad.length;
  });

  const build = (): Snap => {
    const c = structuredClone(snapshot);
    c.questions.push(...structuredClone(qs.map((x) => x.value))); c.hypotheses.push(...structuredClone(hs.map((x) => x.value))); c.findings.push(...structuredClone(fs.map((x) => x.value)));
    return c;
  };

  // run the real checks; hold back whatever they flag; repeat until what remains is clean
  for (let round = 0; round < qs.length + hs.length + fs.length + 2; round++) {
    const issues = checkIntegrity(build()).filter((i) => !baseKeys.has(key(i)));
    const drop = new Set<string>();
    const owner = (path: string): { id: string; kind: HeldBack["kind"] } | null => {
      const m = /^(findings|hypotheses|questions)\[(\d+)\]/.exec(path);
      if (m) {
        const idx = Number(m[2]);
        if (m[1] === "findings" && idx >= nF) return { id: fs[idx - nF]!.id, kind: "finding" };
        if (m[1] === "hypotheses" && idx >= nH) return { id: hs[idx - nH]!.id, kind: "hypothesis" };
        if (m[1] === "questions" && idx >= nQ) return { id: qs[idx - nQ]!.id, kind: "question" };
        return null;
      }
      const f = fs.find((x) => path.startsWith(`${x.id}.`) || path === x.id);
      return f ? { id: f.id, kind: "finding" } : null;
    };
    for (const i of issues) { const o = owner(i.path); if (o) { drop.add(o.id); hold(o.id, o.kind, i); } }
    if (drop.size === 0) break;
    qs = qs.filter((x) => !drop.has(x.id)); hs = hs.filter((x) => !drop.has(x.id)); fs = fs.filter((x) => !drop.has(x.id));
  }

  // keep nothing that no kept finding uses
  const usedQ = new Set(fs.flatMap((f) => f.value.question_ids)), usedClaims = new Set(fs.flatMap((f) => f.value.claim_ids));
  for (const q of qs) if (!usedQ.has(q.id)) hold(q.id, "question", { code: "not_used_by_kept_finding", path: q.id, message: "No kept finding uses this question" });
  for (const h of hs) if (!usedClaims.has(h.value.claim_id)) hold(h.id, "hypothesis", { code: "not_used_by_kept_finding", path: h.id, message: "No kept finding uses this hypothesis" });
  qs = qs.filter((q) => usedQ.has(q.id)); hs = hs.filter((h) => usedClaims.has(h.value.claim_id));

  return { snapshot: build(), held_back: [...held.values()] };
}

/* ---------- the whole stage ---------- */

export type ProposeOutcome =
  | { ok: true; result: ApplyResult; audit: AuditRecord[] }
  | { ok: false; issue: "invalid_output" | "model_error"; errors: string[]; audit: AuditRecord[] };

/** Ask the model for drafts. A reply that does not validate is a processing issue and changes nothing. */
export async function proposeFindings(port: ModelPort, snapshot: Snap, now?: () => string): Promise<ProposeOutcome> {
  const out: StageOutcome<Proposal> = await runStage(port, proposeFindingsStage, snapshot, now);
  if (!out.ok) return out;
  return { ok: true, result: applyProposal(snapshot, out.value), audit: out.audit };
}
