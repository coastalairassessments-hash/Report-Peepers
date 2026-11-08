import { describe, it, expect } from "vitest";
import { buildInspectionReview, loadGapWording, loadScopeEffects } from "../../src/inspection/gaps.js";
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
  it("when the homeowner already has the record, the ask is to upload it instead of asking the inspector", () => {
    const rec = list.items.find((i) => i.record_kind === "lab_report")!;
    const r = (received: string[] | null) => buildInspectionReview({ ...base, recordsReceived: received, review: review([{ item_id: rec.id, status: "not_shown", gap_kind: "not_explained", quotes: [] }]) }).questions[0]!;
    expect(r(["lab_report"])).toMatchObject({ have_record: true, request: wording.have_record });
    expect(r([])).toMatchObject({ have_record: false, request: rec.record_request });
    expect(r(null)).toMatchObject({ have_record: false, request: rec.record_request });
  });
  it("silence on a 'no bad thing' item is not a gap; only a specific check can raise it", () => {
    const quiet = list.items.find((i) => i.silence_is_ok)!;
    const r = buildInspectionReview({ ...base, review: review([{ item_id: quiet.id, status: "not_shown", gap_kind: "not_explained", quotes: [] }]) });
    expect(r.questions).toEqual([]);
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
  it("only the top few material questions go to page one, ranked: map gaps, then contradictions, then the biggest topics; the rest go to the notes", () => {
    const always = list.items.filter((i) => i.materiality === "always_material").slice(0, 8);
    const gap = { rule: "recommendation_without_measure_or_sample", area_id: "R1", topic: "Recommendation has support", material: true, evidence_ids: [], claim_ids: ["c1"], page: 22, detail: "" };
    const r = buildInspectionReview({ ...base, leadingMax: 3, map: [{ area_id: "R1", name: "Living Room", cells: {}, gaps: [gap] }], review: review(always.map((i) => ({ item_id: i.id, status: "not_shown", gap_kind: "not_explained", quotes: [] }))) });
    const pageOne = r.questions.filter((q) => q.placement === "page_one");
    expect(pageOne).toHaveLength(3);
    expect(pageOne[0]!.kind).toBe("map");
    expect(r.questions.filter((q) => q.placement === "notes").length).toBe(r.questions.length - 3);
    expect(r.questions.filter((q) => !q.material).every((q) => q.placement === "notes")).toBe(true);
  });
  it("within the same weight, bigger topics (conclusions, recommendations, moisture) come before paperwork", () => {
    const a = list.items.find((i) => i.group === "admin" && i.materiality === "always_material");
    const c = list.items.find((i) => i.group === "conclusions" && i.materiality === "always_material")!;
    if (!a) return;
    const r = buildInspectionReview({ ...base, review: review([{ item_id: a.id, status: "not_shown", gap_kind: "not_explained", quotes: [] }, { item_id: c.id, status: "not_shown", gap_kind: "not_explained", quotes: [] }]) });
    expect(r.questions[0]!.topic).toBe(c.topic);
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

describe("limits the client described change what is asked", () => {
  const effects = loadScopeEffects();
  const lim = (kind: string, status = "present") => ({ restrictions: [{ kind, status }] });
  const gap = (topic: string) => result(topic, "not_shown");
  const concluding = [{ claim_type: "remediation" }];

  it("a gap a present limit explains is not asked, and is listed as not expected", () => {
    const r = buildInspectionReview({ ...base, scope: lim("access"), scopeEffects: effects, review: review([gap("Hidden areas")]) });
    expect(r.questions.some((q) => q.topic === "Hidden areas")).toBe(false);
    expect(r.not_expected.join(" ")).toMatch(/Hidden areas.*access limit/);
  });
  it("the same gap is asked when no limit was reported", () => {
    const r = buildInspectionReview({ ...base, scope: { restrictions: [] }, scopeEffects: effects, review: review([gap("Hidden areas")]) });
    expect(r.questions.some((q) => q.topic === "Hidden areas")).toBe(true);
    expect(r.not_expected).toEqual([]);
  });
  it("unknown, conflicting or absent limits change nothing", () => {
    for (const s of ["unknown", "conflicting", "explicitly_none"]) {
      const r = buildInspectionReview({ ...base, scope: lim("access", s), scopeEffects: effects, review: review([gap("Hidden areas")]) });
      expect(r.questions.some((q) => q.topic === "Hidden areas")).toBe(true);
    }
    expect(buildInspectionReview({ ...base, review: review([gap("Hidden areas")]) }).questions.some((q) => q.topic === "Hidden areas")).toBe(true);
  });
  it("a topic the limit does not explain is still asked", () => {
    const r = buildInspectionReview({ ...base, scope: lim("access"), scopeEffects: effects, review: review([gap("Dry standard")]) });
    expect(r.questions.some((q) => q.topic === "Dry standard")).toBe(true);
  });
  it("when the report draws conclusions, one scoped question goes to the notes, in the warm voice", () => {
    const r = buildInspectionReview({ ...base, claims: concluding, scope: lim("access"), scopeEffects: effects, review: review([gap("Hidden areas"), gap("Beyond the visible spot")]) });
    const scoped = r.questions.filter((q) => q.kind === "scope");
    expect(scoped).toHaveLength(1);
    expect(scoped[0]).toMatchObject({ placement: "notes", material: false });
    expect(scoped[0]!.text).toContain("the access limit");
    expect(wordingProblems(scoped[0]!.text)).toEqual([]);
  });
  it("a time limit silences nothing (E10), so its gaps are asked in full and no scoped question is added", () => {
    const r = buildInspectionReview({ ...base, claims: concluding, scope: lim("time"), scopeEffects: effects, review: review([gap("Hidden areas")]) });
    expect(r.questions.filter((q) => q.kind === "scope")).toHaveLength(0);
    expect(r.questions.some((q) => q.topic === "Hidden areas")).toBe(true);
  });
  it("no conclusions, no scoped question", () => {
    const r = buildInspectionReview({ ...base, claims: [], scope: lim("time"), scopeEffects: effects, review: review([gap("Hidden areas")]) });
    expect(r.questions.filter((q) => q.kind === "scope")).toHaveLength(0);
  });
  it("the report's own contradictions are never softened by a limit", () => {
    const c = { check: "dates_disagree", item_topics: ["Numbers and units checked"], quotes: [{ page: 1, text: "a", role: "report_says" }, { page: 2, text: "b", role: "but_also_says" }], detail: "" };
    const r = buildInspectionReview({ ...base, scope: lim("time"), scopeEffects: effects, contradictions: [c], review: review([]) });
    expect(r.questions.some((q) => q.kind === "contradiction")).toBe(true);
  });
  it("every topic in the data exists in the checklist", () => {
    const topics = new Set(list.items.map((i) => i.topic));
    for (const [k, v] of Object.entries(effects.effects)) for (const t of v) expect(topics.has(t), `${k}: ${t}`).toBe(true);
    for (const k of Object.keys(effects.effects)) expect(effects.order).toContain(k);
  });
});

describe("what the report did well", () => {
  const q = (page: number, text: string, coverage = "full") => ({ page, anchor: { exact_text: text }, coverage });
  const ok = (topic: string, quotes = [q(4, "against a dry reading of 9%")]) => ({ item_id: item(topic).id, status: "supported", gap_kind: null, quotes }) as any;
  const done = (results: any[], extra: Record<string, unknown> = {}) => buildInspectionReview({ ...base, review: review(results), ...extra }).done_well;

  it("stars a fully shown item with its page and the report's own words", () => {
    const d = done([ok("Dry standard")]);
    expect(d).toHaveLength(1);
    expect(d[0]).toMatchObject({ topic: "Dry standard", page: 4, quote: "against a dry reading of 9%" });
    expect(d[0]!.text).toContain("page 4");
    expect(d[0]!.text).toContain("against a dry reading of 9%");
    expect(wordingProblems(d[0]!.text)).toEqual([]);
  });
  it("no quote, no star", () => {
    expect(done([ok("Dry standard", [])])).toEqual([]);
    expect(done([ok("Dry standard", [q(4, "")])])).toEqual([]);
  });
  it("a partly shown item gets no star", () => {
    expect(done([ok("Dry standard", [q(4, "a dry reading", "partial")])])).toEqual([]);
  });
  it("silence-is-fine items are never starred", () => {
    const quiet = list.items.find((i) => i.silence_is_ok)!;
    expect(done([{ item_id: quiet.id, status: "supported", gap_kind: null, quotes: [q(2, "none found")] }])).toEqual([]);
  });
  it("words read from an image get no star", () => {
    expect(done([ok("Dry standard")], { imagePages: new Set([4]) })).toEqual([]);
  });
  it("a topic the review also asks about gets no star", () => {
    const d = done([ok("Dry standard"), gap("Dry standard")]);
    expect(d).toEqual([]);
  });
  it("is capped, material topics first", () => {
    const topics = list.items.filter((i) => !i.silence_is_ok).slice(0, 30).map((i) => i.topic);
    const d = done(topics.map((t) => ok(t)), { doneWellMax: 5 });
    expect(d).toHaveLength(5);
    const rank = (t: string) => ({ always_material: 0, by_dependence: 1, always_minor: 2 } as Record<string, number>)[item(t).materiality]!;
    const ranks = d.map((x) => rank(x.topic));
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
  });
  function gap(topic: string) { return result(topic, "not_shown"); }
});

describe("done-well wording", () => {
  it("has a plain heading, no icons, and makes no standards or compliance claim", () => {
    expect(wording.done_well_heading).toBeTruthy();
    for (const s of [wording.done_well_heading, wording.done_well]) {
      expect(s).not.toMatch(/[\u2605\u2606\u2B50\u{1F31F}]/u);
      expect(s).not.toMatch(/complian|conform|meets? (the )?standard|ASTM|IICRC|ASHRAE/i);
    }
    expect(wordingProblems(wording.done_well_heading)).toEqual([]);
  });
});
