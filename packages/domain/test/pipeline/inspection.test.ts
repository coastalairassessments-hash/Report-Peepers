import { describe, it, expect } from "vitest";
import { makePdf, type PageSpec } from "../ingest/fixtures.js";
import { lines, j } from "./slice-fixtures.js";
import { makeServices, readyCase, sys } from "./helpers.js";
import { runAnalysis } from "../../src/pipeline/analyze.js";
import { loadChecklist } from "../../src/inspection/checklist.js";
import { loadConsistencyConfig } from "../../src/inspection/consistency.js";
import { loadSelfConsistencyConfig } from "../../src/inspection/selfConsistency.js";
import { loadEvidenceMapConfig } from "../../src/inspection/evidenceMap.js";
import { loadGapWording } from "../../src/inspection/gaps.js";
import { loadExpectations } from "../../src/context.js";
import { loadScopeEffects } from "../../src/inspection/gaps.js";

import { checklist, idOf, NOTHING, NO_PROPOSAL, ev, cl, run, THIN, thinScript, COMPLETE, completeScript } from "./inspection-fixtures.js";

describe("inspection review, end to end", () => {
  it("a thin report comes back with the questions to ask, material ones first, each traced to the report", async () => {
    const { r, rec } = await run(THIN, thinScript);
    expect(r).toMatchObject({ ok: true });
    const rv = rec.inspection_review!;
    const kinds = rv.questions.map((q) => q.kind);
    expect(kinds).toContain("map");
    expect(kinds).toContain("contradiction");
    expect(kinds).toContain("checklist");
    const map = rv.questions.find((q) => q.kind === "map")!;
    expect(map.text).toContain("Living Room");
    expect(map.material).toBe(true);
    expect(rv.questions.findIndex((q) => q.material) === 0).toBe(true);
    const dry = rv.questions.find((q) => q.topic === "Dry standard")!;
    expect(dry.text).toBe(checklist.items.find((i) => i.topic === "Dry standard")!.leading_question);
    const contradictions = rv.questions.filter((q) => q.kind === "contradiction").map((q) => q.text).join(" ");
    expect(contradictions).toMatch(/different dates|more than one laboratory/);
    for (const q of rv.questions.filter((x) => x.kind === "contradiction")) expect(q.quotes.length).toBeGreaterThan(0);
  });

  it("the map shows the living room's chain with its break", async () => {
    const { rec } = await run(THIN, thinScript);
    const row = rec.inspection_review!.map.find((m) => m.name === "Living Room")!;
    expect(row.cells.recommended).toHaveLength(1);
    expect(row.cells.measured).toEqual([]);
    expect(row.gaps.map((g) => g.rule)).toContain("recommendation_without_measure_or_sample");
  });

  it("a complete report has no map gaps, no contradictions, and its covered list shows what it answers", async () => {
    const { r, rec } = await run(COMPLETE, completeScript);
    expect(r).toMatchObject({ ok: true });
    const rv = rec.inspection_review!;
    expect(rv.questions.filter((q) => q.kind === "map" || q.kind === "contradiction")).toEqual([]);
    expect(rv.covered.flatMap((g) => g.topics)).toContain("Dry standard");
    expect(rv.questions.filter((q) => q.topic === "Dry standard").map((q) => `${q.kind}: ${q.text}`)).toEqual([]);
  });

  it("a room name the model invents that is not on the page is dropped; the statement stays in the whole-report area", async () => {
    const bad = [j({ evidence: [ev("a", "Elevated water content was found along the NW corner.", "BASEMENT")], claims: [] }), NOTHING, NO_PROPOSAL, j({ items: [], conditions: [] }), j({ items: [], conditions: [] })];
    const { rec } = await run(THIN, bad);
    expect(rec.snapshot!.areas.map((a) => a.name)).not.toContain("BASEMENT");
  });

  it("when the review step fails on a page, that page is listed as not checked, and the case still reaches the reviewer", async () => {
    const script = [...thinScript.slice(0, 4), new Error("model unavailable") as unknown as string];
    const { r, rec } = await run(THIN, script);
    expect(r).toMatchObject({ ok: true, state: "awaiting_reviewer" });
    expect(rec.issues.some((i) => i.stage === "inspection_review" && i.page === 2)).toBe(true);
    expect(rec.inspection_review!.not_checked.join(" ")).toMatch(/page 2/);
  });

  it("with no checklist answer for a page, an absence is never claimed: items stay 'not verifiable', not 'not shown'", async () => {
    const script = [...thinScript.slice(0, 4), new Error("model unavailable") as unknown as string];
    const { rec } = await run(THIN, script);
    expect(rec.inspection_review!.questions.some((q) => q.topic === "Dry standard")).toBe(false);
  });

  it("every question that reaches a person passes the wording rules", async () => {
    const { wordingProblems } = await import("../../src/integrity.js");
    const { rec } = await run(THIN, thinScript);
    for (const q of rec.inspection_review!.questions) expect([...wordingProblems(q.text), ...wordingProblems(q.why)], q.id).toEqual([]);
  });
});

describe("client context in the review", () => {
  it("adds a question when the client's account is not met by the report", async () => {
    const svc = makeServices(thinScript);
    svc.inspection = { checklist, consistency: loadConsistencyConfig(), selfConsistency: loadSelfConsistencyConfig(), evidenceMap: loadEvidenceMapConfig(), wording: loadGapWording(), expectations: loadExpectations(), scopeEffects: loadScopeEffects() };
    const id = await readyCase(svc, await makePdf(THIN));
    const rec0 = (await svc.repo.get(sys, id))!;
    rec0.context = { answers: { CX33: { picks: ["Rain in the past 3 days"] }, CX15: { picks: ["A health concern"], note: "Private" } }, skipped_sections: [] };
    await svc.repo.save(sys, rec0);
    await runAnalysis(svc, id);
    const rv = (await svc.repo.get(sys, id))!.inspection_review!;
    const ctx = rv.questions.filter((q) => q.kind === "context");
    expect(ctx.map((q) => q.topic)).toEqual(["weather"]);
    expect(JSON.stringify(rv)).not.toMatch(/health|Private/i);
  });
  it("adds nothing when the client gave no context", async () => {
    const { rec } = await run(THIN, thinScript);
    expect(rec.inspection_review!.questions.some((q) => q.kind === "context")).toBe(false);
  });
});

describe("described limits in the pipeline", () => {
  it("a stated access limit moves a hidden-areas gap to the not-expected list", async () => {
    const svc = makeServices(thinScript);
    svc.inspection = { checklist, consistency: loadConsistencyConfig(), selfConsistency: loadSelfConsistencyConfig(), evidenceMap: loadEvidenceMapConfig(), wording: loadGapWording(), scopeEffects: loadScopeEffects() };
    const id = await readyCase(svc, await makePdf(THIN));
    const rec0 = (await svc.repo.get(sys, id))!;
    for (const r of rec0.scope!.restrictions) if (r.kind === "access") r.status = "present";
    await svc.repo.save(sys, rec0);
    await runAnalysis(svc, id);
    const rv = (await svc.repo.get(sys, id))!.inspection_review!;
    expect(rv.questions.some((q) => q.topic === "Hidden areas")).toBe(false);
    expect(rv.not_expected.join(" ")).toMatch(/access limit/);
  });
});

describe("what the report did well, in the pipeline", () => {
  it("a complete report earns stars with real quotes; a thin one earns none for what it skipped", async () => {
    const { rec } = await run(COMPLETE, completeScript);
    const d = rec.inspection_review!.done_well;
    expect(d.some((x) => x.topic === "Dry standard" && x.quote.includes("dry reading of 9%"))).toBe(true);
    for (const x of d) expect(x.quote.length).toBeGreaterThan(0);
    const thin = (await run(THIN, thinScript)).rec.inspection_review!;
    expect(thin.done_well.some((x) => x.topic === "Dry standard")).toBe(false);
  });
});
