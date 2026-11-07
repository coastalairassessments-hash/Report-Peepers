import { describe, it, expect } from "vitest";
import { validateCaseSnapshot } from "@report-peepers/contracts";
import { makePdf, type PageSpec } from "../ingest/fixtures.js";
import { P1, j, extraction, proposal } from "./slice-fixtures.js";
import { makeServices, readyCase, alice, sys, rev1 } from "./helpers.js";
import { runAnalysis, assignReviewer } from "../../src/pipeline/analyze.js";
import { loadChecklist } from "../../src/inspection/checklist.js";
import { loadConsistencyConfig } from "../../src/inspection/consistency.js";
import { loadSelfConsistencyConfig } from "../../src/inspection/selfConsistency.js";
import { loadEvidenceMapConfig } from "../../src/inspection/evidenceMap.js";
import { loadGapWording } from "../../src/inspection/gaps.js";

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

  it("with reading from images switched on, an image-only page is read and sent through extraction", async () => {
    const svc = makeServices([extraction, j({ evidence: [], claims: [] }), proposal]);
    svc.ocr = { port: { async recognize() { return [{ text: "Aspergillus/Penicillium-Like 85 1,267", confidence: 90, box: [0.1, 0.2, 0.9, 0.22] }, { text: "Chaetomium 9 120 Total Spores 97 1,293", confidence: 90, box: [0.1, 0.3, 0.9, 0.32] }] } }, renderer: { async render() { return new Uint8Array([1]); } } };
    const id = await readyCase(svc, await makePdf([P1, { puts: [] }]));
    expect(await runAnalysis(svc, id)).toMatchObject({ ok: true });
    const rec = (await svc.repo.get(sys, id))!;
    expect(rec.issues.some((i) => i.code === "no_text_layer")).toBe(false);
  });

  it("with a second reader that disagrees on a number, the case lists the page and the number is left out", async () => {
    const svc = makeServices([extraction, j({ evidence: [], claims: [] }), proposal]);
    const lines = (n: string) => [{ text: "Aspergillus/Penicillium-Like 85 1,267", confidence: 90, box: [0.1, 0.2, 0.9, 0.22] as [number, number, number, number] }, { text: `Chaetomium 9 ${n} Total Spores 97 1,293`, confidence: 90, box: [0.1, 0.3, 0.9, 0.32] as [number, number, number, number] }];
    svc.ocr = { port: { async recognize() { return lines("120"); } }, second: { async recognize() { return lines("720"); } }, renderer: { async render() { return new Uint8Array([1]); } } };
    const id = await readyCase(svc, await makePdf([P1, { puts: [] }]));
    expect(await runAnalysis(svc, id)).toMatchObject({ ok: true });
    const rec = (await svc.repo.get(sys, id))!;
    expect(rec.issues.some((i) => i.code === "numbers_not_confirmed" && i.page === 2)).toBe(true);
  });

  it("with the inspection review switched on, the case carries the questions, the covered list and the map, and a customer cannot change them", async () => {
    const svc = makeServices([extraction, proposal, j({ items: [], conditions: [] })]);
    svc.inspection = { checklist: loadChecklist(), consistency: loadConsistencyConfig(), selfConsistency: loadSelfConsistencyConfig(), evidenceMap: loadEvidenceMapConfig(), wording: loadGapWording() };
    const id = await readyCase(svc, await makePdf([P1]));
    expect(await runAnalysis(svc, id)).toMatchObject({ ok: true });
    const rec = (await svc.repo.get(sys, id))!;
    expect(rec.inspection_review!.questions.length).toBeGreaterThan(0);
    expect(rec.inspection_review!.questions.every((q) => q.text.length > 0)).toBe(true);
    expect(rec.inspection_review!.map.length).toBeGreaterThan(0);
    const mine = (await svc.repo.get(alice, id))!;
    mine.inspection_review = { covered: [], questions: [], done_well: [], not_checked: [], not_expected: [], map: [], held_back: [] };
    await expect(svc.repo.save(alice, mine)).rejects.toThrow();
  });

  it("without the switch, nothing about the inspection review is stored", async () => {
    const { svc, id } = await setup([extraction, proposal]);
    await runAnalysis(svc, id);
    expect((await svc.repo.get(sys, id))!.inspection_review ?? null).toBeNull();
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
