import { describe, it, expect } from "vitest";
import { validateCaseSnapshot } from "@report-peepers/contracts";
import { makePdf, type PageSpec } from "../ingest/fixtures.js";
import { makeServices, readyCase, alice, sys, rev1 } from "./helpers.js";
import { runAnalysis, assignReviewer } from "../../src/pipeline/analyze.js";

const lines = (ls: string[]): PageSpec => ({ puts: ls.map((text, i) => ({ text, x: 72, y: 730 - i * 14, size: 10 })) });
const P1 = lines([
  "Staining was observed on the hall bathroom ceiling, approximately 2 feet by 3 feet.",
  "The mold growth is caused by a roof leak above the hall bathroom.",
  "The duration of the condition may be more than 6 months.",
]);
const j = (o: unknown) => JSON.stringify(o);
const extraction = j({
  evidence: [{ local_id: "a", origin: "report_author", exact_text: "Staining was observed on the hall bathroom ceiling" }],
  claims: [{ local_id: "c", claim_type: "cause", text: "A roof leak caused the growth.", exact_text: "The mold growth is caused by a roof leak above the hall bathroom.", strength_in_report: "categorical", basis_local_ids: ["a"] }],
});
const proposal = j({
  questions: [{ local_id: "1", audience: "original_inspector", text: "What was the cause statement based on?", trigger_evidence_ids: ["AI-EV-p1-a"], trigger_claim_ids: ["AI-CL-p1-c"], why_it_matters: "The cause changes what is repaired.", decision_it_can_change: "Whether the cause is relied on.", stop_condition: "The basis is supplied." }],
  hypotheses: [{ local_id: "2", claim_id: "AI-CL-p1-c", mechanism: "Water entering from the roof", support_evidence_ids: ["AI-EV-p1-a"], counter_evidence_ids: [], alternative_explanations: ["A plumbing leak", "Condensation"], time_compatible: "unknown", status: "plausible_unconfirmed", what_would_change_interpretation: ["Dated repair records"], concise_rationale: "One observation; timing unknown." }],
  findings: [{
    local_id: "1", finding_type: "clarification_needed", title: "Basis for the cause statement", explanation: "The report states a cause without showing what it rests on.",
    claim_ids: ["AI-CL-p1-c"], support_evidence_ids: ["AI-EV-p1-a"], counter_evidence_ids: [], reference_bindings: [], evidence_strength: "limited", decision_relevance: "material",
    uncertainty: "Other records may exist.", question_local_ids: ["1"], possible_next_steps: ["Ask for the supporting history."], resolution_condition: "The basis is supplied.", assumptions: ["The staining described is the area the cause refers to."],
  }],
});

async function setup(script: any[], pages: PageSpec[] = [P1]) {
  const svc = makeServices(script);
  const id = await readyCase(svc, await makePdf(pages));
  return { svc, id };
}

describe("runAnalysis", () => {
  it("a clean run lands at awaiting_reviewer with a valid v0.2 snapshot of unapproved drafts", async () => {
    const { svc, id } = await setup([extraction, proposal]);
    const r = await runAnalysis(svc, id);
    expect(r).toMatchObject({ ok: true, state: "awaiting_reviewer" });
    const rec = (await svc.repo.get(sys, id))!;
    expect(rec.state).toBe("awaiting_reviewer");
    expect(rec.attempts).toBe(1);
    expect(validateCaseSnapshot(rec.snapshot).ok).toBe(true);
    expect(rec.issues.map((i) => i.detail)).toEqual([]);
    expect(rec.snapshot!.findings.length).toBeGreaterThan(0);
    expect(rec.snapshot!.findings.every((f: any) => f.human_approved === false)).toBe(true);
    expect(rec.snapshot!.release.status).toBe("awaiting_approval");
    expect(rec.snapshot!.release.reviewer_id).toBeNull();
    expect(rec.snapshot!.provenance.run_id).toMatch(/^RUN-/);
  });

  it("a page with no text is listed as a coverage limit, not hidden", async () => {
    const { svc, id } = await setup([extraction, proposal], [P1, { puts: [] }]);
    const r = await runAnalysis(svc, id);
    expect(r.ok).toBe(true);
    const rec = (await svc.repo.get(sys, id))!;
    expect(rec.issues.some((i) => i.code === "no_text_layer" && i.page === 2)).toBe(true);
    expect(rec.snapshot!.release.coverage_limitations.join(" ")).toContain("Page 2");
  });

  it("when nothing can be extracted the case fails with a reason and no snapshot", async () => {
    const { svc, id } = await setup([new Error("model unavailable")]);
    const r = await runAnalysis(svc, id);
    expect(r).toMatchObject({ ok: false, reason: "nothing_extracted", state: "failed" });
    const rec = (await svc.repo.get(sys, id))!;
    expect(rec.state).toBe("failed");
    expect(rec.snapshot).toBeNull();
  });

  it("a failed proposal step fails the case instead of guessing", async () => {
    const { svc, id } = await setup([extraction, "not json", "still not json"]);
    const r = await runAnalysis(svc, id);
    expect(r.ok).toBe(false);
    expect((await svc.repo.get(sys, id))!.state).toBe("failed");
    expect((await svc.repo.get(sys, id))!.snapshot).toBeNull();
  });

  it("a proposed finding that fails the rules is held back and listed", async () => {
    const bad = JSON.parse(proposal); bad.findings[0].explanation = "This proves the cause.";
    const { svc, id } = await setup([extraction, j(bad)]);
    const r = await runAnalysis(svc, id);
    expect(r.ok).toBe(true);
    const rec = (await svc.repo.get(sys, id))!;
    expect(rec.snapshot!.findings).toEqual([]);
    expect(rec.issues.some((i) => i.stage === "proposal")).toBe(true);
  });

  it("retry after failure is allowed up to the attempt cap, then refused", async () => {
    const { svc, id } = await setup([new Error("x"), new Error("x"), new Error("x"), new Error("x"), new Error("x"), new Error("x")]);
    for (let n = 1; n <= svc.pipeline.max_analysis_attempts; n++) {
      const r = await runAnalysis(svc, id);
      expect(r).toMatchObject({ ok: false, reason: "nothing_extracted" });
      expect((await svc.repo.get(sys, id))!.attempts).toBe(n);
    }
    const last = await runAnalysis(svc, id);
    expect(last.ok).toBe(false);
    expect((last as any).reason).not.toBe("nothing_extracted");
    expect((await svc.repo.get(sys, id))!.state).toBe("failed");
  });

  it("a retry is refused when entitlement can no longer be verified", async () => {
    const { svc, id } = await setup([new Error("x"), extraction, proposal]);
    expect((await runAnalysis(svc, id)).ok).toBe(false);
    svc.entitled.value = false;
    const r = await runAnalysis(svc, id);
    expect(r.ok).toBe(false);
    const rec = (await svc.repo.get(sys, id))!;
    expect(rec.state).toBe("failed");
    expect(rec.attempts).toBe(1);
  });

  it("runs only from ready_for_analysis or failed", async () => {
    const { svc, id } = await setup([extraction, proposal]);
    await runAnalysis(svc, id);
    const again = await runAnalysis(svc, id);
    expect(again).toMatchObject({ ok: false, reason: "wrong_state" });
  });
});

describe("assignReviewer", () => {
  it("only works in awaiting_reviewer", async () => {
    const { svc, id } = await setup([extraction, proposal]);
    expect((await assignReviewer(svc, id, "rev1")).ok).toBe(false);
    await runAnalysis(svc, id);
    expect((await assignReviewer(svc, id, "rev1")).ok).toBe(true);
    expect((await svc.repo.get(rev1, id))?.id).toBe(id);
    expect(await svc.repo.get({ role: "customer", id: "bob" }, id)).toBeNull();
    expect((await svc.repo.get(alice, id))).not.toBeNull();
  });
});
