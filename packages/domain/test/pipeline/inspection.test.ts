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

const checklist = loadChecklist();
const idOf = (topic: string) => checklist.items.find((i) => i.topic === topic)!.id;
const NOTHING = j({ evidence: [], claims: [] });
const NO_PROPOSAL = j({ questions: [], hypotheses: [], findings: [] });
const ev = (local_id: string, exact_text: string, area_text?: string, origin = "report_author") => ({ local_id, origin, exact_text, ...(area_text ? { area_text } : {}) });
const cl = (local_id: string, claim_type: string, exact_text: string, basis: string[], area_text?: string) => ({ local_id, claim_type, text: "Restated.", exact_text, strength_in_report: "categorical", basis_local_ids: basis, ...(area_text ? { area_text } : {}) });
async function run(pages: PageSpec[], script: string[]) {
  const svc = makeServices(script);
  svc.inspection = { checklist, consistency: loadConsistencyConfig(), selfConsistency: loadSelfConsistencyConfig(), evidenceMap: loadEvidenceMapConfig(), wording: loadGapWording(), expectations: loadExpectations(), scopeEffects: loadScopeEffects() };
  const id = await readyCase(svc, await makePdf(pages));
  const r = await runAnalysis(svc, id);
  return { svc, id, r, rec: (await svc.repo.get(sys, id))! };
}

// A thin report, modeled on a real one: moisture called "elevated" with no reading, removal recommended, a cause stated, two lab names, two dates.
const THIN: PageSpec[] = [
  lines(["LIVING ROOM", "Elevated water content was found along the NW corner.", "Mold growth was found behind the baseboard.", "It is recommended that the water damaged building materials be removed.", "The cause of the water damage was leaking ductwork in the attic."]),
  lines(["Samples are sent to a 3rd party laboratory (AEML Inc.) for analysis.", "Date of Inspection: July 25, 2025", "Laboratory: Sporelytics", "Sampled: 07-27-25"]),
];
const thinScript = [
  j({ evidence: [ev("a", "Elevated water content was found along the NW corner.", "LIVING ROOM"), ev("b", "Mold growth was found behind the baseboard.", "LIVING ROOM")], claims: [cl("c", "remediation", "It is recommended that the water damaged building materials be removed.", ["a"], "LIVING ROOM"), cl("d", "cause", "The cause of the water damage was leaking ductwork in the attic.", ["a"], "LIVING ROOM")] }),
  NOTHING, NO_PROPOSAL,
  j({ items: [], conditions: [{ condition: "called_wet", exact_text: "Elevated water content was found along the NW corner." }, { condition: "recommendation_made", exact_text: "It is recommended that the water damaged building materials be removed." }, { condition: "cause_stated", exact_text: "The cause of the water damage was leaking ductwork in the attic." }] }),
  j({ items: [], conditions: [{ condition: "samples_taken", exact_text: "Samples are sent to a 3rd party laboratory" }] }),
];

// A complete report: a reading, a sample, a cause, a recommendation, one lab, one date.
const COMPLETE: PageSpec[] = [lines(["LIVING ROOM", "Moisture meter reading 28% at the wall base, against a dry reading of 9%.", "An air sample was taken in the living room.", "It is recommended that the water damaged building materials be removed.", "The cause of the water damage was leaking ductwork in the attic.", "Date of Inspection: July 25, 2025", "Sampled: 07-25-25"])];
const completeScript = [
  j({ evidence: [ev("a", "Moisture meter reading 28% at the wall base, against a dry reading of 9%.", "LIVING ROOM"), ev("b", "An air sample was taken in the living room.", "LIVING ROOM")], claims: [cl("c", "remediation", "It is recommended that the water damaged building materials be removed.", ["a"], "LIVING ROOM"), cl("d", "cause", "The cause of the water damage was leaking ductwork in the attic.", ["a"], "LIVING ROOM")] }),
  NO_PROPOSAL,
  j({ items: [{ item_id: idOf("Dry standard"), exact_text: "against a dry reading of 9%", coverage: "full", states_not_done: false }], conditions: [{ condition: "called_wet", exact_text: "Moisture meter reading 28% at the wall base" }] }),
];

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
