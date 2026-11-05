import { describe, it, expect } from "vitest";
import { buildInspectionReview, loadGapWording } from "../../src/inspection/gaps.js";
import { loadChecklist } from "../../src/inspection/checklist.js";
import { wordingProblems } from "../../src/integrity.js";

const list = loadChecklist();
const wording = loadGapWording();
const item = (topic: string) => list.items.find((i) => i.topic === topic)!;
const result = (topic: string, status: string, extra: Record<string, unknown> = {}) => ({ item_id: item(topic).id, status, gap_kind: status === "not_shown" ? "not_explained" : null, quotes: [], ...extra }) as any;
const base = { checklist: list, flags: [], contradictions: [], map: [], claims: [], imagePages: new Set<number>(), wording } as any;
const review = (results: any[], page_issues: any[] = []) => ({ results, conditions: [], held_back: [], page_issues, audit: [] });

describe("gaps become questions in the warm voice", () => {
  it("a missing item becomes the checklist's own leading question, with its record request", () => {
    const r = buildInspectionReview({ ...base, review: review([result("Dry standard", "not_shown")]) });
    const q = r.questions.find((x) => x.topic === "Dry standard")!;
    expect(q.text).toBe(item("Dry standard").leading_question);
    expect(q.kind).toBe("checklist");
    expect(q.material).toBe(true);
  });
  it("supported items become the 'what the report covers' list, not questions", () => {
    const r = buildInspectionReview({ ...base, review: review([result("Dry standard", "supported", { quotes: [{ page: 5, anchor: {}, coverage: "full" }] })]) });
    expect(r.questions).toEqual([]);
    expect(r.covered.flatMap((g) => g.topics)).toContain("Dry standard");
  });
  it("a by-dependence item is material only when the report draws a conclusion or recommends work", () => {
    const t = list.items.find((i) => i.materiality === "by_dependence" && i.applies_when === "always")!;
    const none = buildInspectionReview({ ...base, review: review([{ item_id: t.id, status: "not_shown", gap_kind: "not_explained", quotes: [] }]) });
    expect(none.questions[0]!.material).toBe(false);
    const some = buildInspectionReview({ ...base, claims: [{ claim_type: "remediation" }], review: review([{ item_id: t.id, status: "not_shown", gap_kind: "not_explained", quotes: [] }]) });
    expect(some.questions[0]!.material).toBe(true);
  });
  it("an always-minor item is never material", () => {
    const t = list.items.find((i) => i.materiality === "always_minor")!;
    const r = buildInspectionReview({ ...base, claims: [{ claim_type: "remediation" }], review: review([{ item_id: t.id, status: "not_shown", gap_kind: "not_explained", quotes: [] }]) });
    expect(r.questions[0]!.material).toBe(false);
  });
  it("when the report says the work was not done, the question asks why", () => {
    const r = buildInspectionReview({ ...base, review: review([result("Dry standard", "not_shown", { gap_kind: "not_performed" })]) });
    expect(r.questions[0]!.text).toMatch(/wasn't done/);
  });
  it("items that could not be checked are listed as not checked, never as questions about the inspector", () => {
    const r = buildInspectionReview({ ...base, review: review([result("Dry standard", "not_verifiable")], [{ page: 3, issue: "no_text_layer", detail: "This page has no readable text; it was not reviewed." }]) });
    expect(r.questions).toEqual([]);
    expect(r.not_checked.join(" ")).toMatch(/page 3/i);
  });
  it("contradictions become questions with both quotes kept separate from the text", () => {
    const c = { check: "dates_disagree", item_topics: ["Numbers and units checked"], quotes: [{ page: 1, text: "Date of Inspection: July 25, 2025", role: "report_says" }, { page: 33, text: "Sampled: 07-27-25", role: "but_also_says" }], detail: "x" };
    const r = buildInspectionReview({ ...base, contradictions: [c], review: review([]) });
    expect(r.questions[0]).toMatchObject({ kind: "contradiction", material: false, page: 1 }); // numbers-and-units items are always minor
    const m = buildInspectionReview({ ...base, contradictions: [{ ...c, item_topics: ["Conclusion matches the data"] }], review: review([]) });
    expect(m.questions[0]!.material).toBe(true);
    expect(r.questions[0]!.quotes).toHaveLength(2);
    expect(r.questions[0]!.text).not.toContain("07-27-25");
  });
  it("a question that rests on words read from an image says so and asks for confirmation", () => {
    const c = { check: "dates_disagree", item_topics: ["Numbers and units checked"], quotes: [{ page: 1, text: "Date of Inspection: July 25, 2025", role: "report_says" }, { page: 33, text: "Sampled: 07-27-25", role: "but_also_says" }], detail: "x" };
    const r = buildInspectionReview({ ...base, contradictions: [c], imagePages: new Set([33]), review: review([]) });
    expect(r.questions[0]!.from_image).toBe(true);
    expect(r.questions[0]!.text).toMatch(/came from an image/);
  });
  it("evidence-map gaps name the room and follow the one materiality rule", () => {
    const gap = { rule: "recommendation_without_measure_or_sample", area_id: "R1", topic: "Recommendation has support", material: true, evidence_ids: [], claim_ids: ["c1"], page: 22, detail: "" };
    const r = buildInspectionReview({ ...base, map: [{ area_id: "R1", name: "Living Room", cells: {}, gaps: [gap] }], review: review([]) });
    expect(r.questions[0]).toMatchObject({ kind: "map", material: true, page: 22 });
    expect(r.questions[0]!.text).toContain("Living Room");
  });
  it("material questions come first", () => {
    const minor = list.items.find((i) => i.materiality === "always_minor")!;
    const r = buildInspectionReview({ ...base, review: review([{ item_id: minor.id, status: "not_shown", gap_kind: "not_explained", quotes: [] }, result("Dry standard", "not_shown")]) });
    expect(r.questions.map((q) => q.material)).toEqual([true, false]);
  });
  it("every question passes the wording rules, including every template and every checklist question", () => {
    for (const q of [...Object.values(wording.checks).map((c) => c.text), ...Object.values(wording.map).map((c) => c.text), ...list.items.map((i) => i.leading_question), ...list.items.map((i) => i.record_request)]) expect(wordingProblems(q), q).toEqual([]);
  });
  it("a question whose text breaks the wording rules is held back and listed, not shown", () => {
    const bad = { ...wording, checks: { ...wording.checks, dates_disagree: { text: "This is a violation.", why: "x" } } };
    const c = { check: "dates_disagree", item_topics: [], quotes: [{ page: 1, text: "a", role: "report_says" }], detail: "x" };
    const r = buildInspectionReview({ ...base, wording: bad, contradictions: [c], review: review([]) });
    expect(r.questions).toEqual([]);
    expect(r.held_back).toHaveLength(1);
  });
});
