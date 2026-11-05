import { makePdf, type PageSpec } from "../ingest/fixtures.js";
import { makeServices, readyCase, type TestServices } from "./helpers.js";
import { runAnalysis, assignReviewer } from "../../src/pipeline/analyze.js";

export const lines = (ls: string[]): PageSpec => ({ puts: ls.map((text, i) => ({ text, x: 72, y: 730 - i * 14, size: 10 })) });
export const P1 = lines([
  "Staining was observed on the hall bathroom ceiling, approximately 2 feet by 3 feet.",
  "The mold growth is caused by a roof leak above the hall bathroom.",
  "The duration of the condition may be more than 6 months.",
]);
export const j = (o: unknown) => JSON.stringify(o);
export const extraction = j({
  evidence: [{ local_id: "a", origin: "report_author", exact_text: "Staining was observed on the hall bathroom ceiling" }],
  claims: [{ local_id: "c", claim_type: "cause", text: "A roof leak caused the growth.", exact_text: "The mold growth is caused by a roof leak above the hall bathroom.", strength_in_report: "categorical", basis_local_ids: ["a"] }],
});
export const proposal = j({
  questions: [{ local_id: "1", audience: "original_inspector", text: "What was the cause statement based on?", trigger_evidence_ids: ["AI-EV-p1-a"], trigger_claim_ids: ["AI-CL-p1-c"], why_it_matters: "The cause changes what is repaired.", decision_it_can_change: "Whether the cause is relied on.", stop_condition: "The basis is supplied." }],
  hypotheses: [{ local_id: "2", claim_id: "AI-CL-p1-c", mechanism: "Water entering from the roof", support_evidence_ids: ["AI-EV-p1-a"], counter_evidence_ids: [], alternative_explanations: ["A plumbing leak", "Condensation"], time_compatible: "unknown", status: "plausible_unconfirmed", what_would_change_interpretation: ["Dated repair records"], concise_rationale: "One observation; timing unknown." }],
  findings: [{
    local_id: "1", finding_type: "clarification_needed", title: "Basis for the cause statement", explanation: "The report states a cause without showing what it rests on.",
    claim_ids: ["AI-CL-p1-c"], support_evidence_ids: ["AI-EV-p1-a"], counter_evidence_ids: [], reference_bindings: [], evidence_strength: "limited", decision_relevance: "material",
    uncertainty: "Other records may exist.", question_local_ids: ["1"], possible_next_steps: ["Ask for the supporting history."], resolution_condition: "The basis is supplied.", assumptions: ["The staining described is the area the cause refers to."],
  }],
});


/** A synthetic report taken through analysis and assigned to rev1. */
export async function reviewReady(over: { script?: string[]; pages?: PageSpec[] } = {}): Promise<{ svc: TestServices; id: string; bytes: Uint8Array }> {
  const svc = makeServices(over.script ?? [extraction, proposal]);
  const bytes = await makePdf(over.pages ?? [P1]);
  const id = await readyCase(svc, bytes);
  const r = await runAnalysis(svc, id);
  if (!r.ok) throw new Error(`Test setup: analysis failed (${r.reason})`);
  await assignReviewer(svc, id, "rev1");
  return { svc, id, bytes };
}
