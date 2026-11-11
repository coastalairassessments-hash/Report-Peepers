import { describe, it, expect } from "vitest";
import { extractDocument, spanBox, type ExtractedDocument } from "../../src/ingest/extract.js";
import { findAnchor, pageOnlyAnchor } from "../../src/ingest/anchors.js";
import { planMarkup, loadMarkupConfig, type Box, type MarkupPlan } from "../../src/render/plan.js";
import { wordingProblems } from "../../src/integrity.js";
import type { ApprovedView } from "../../src/release.js";
import { makePdf, type PageSpec } from "../ingest/fixtures.js";

const DOC = "DOC-001-v1";
const cfg = loadMarkupConfig();
type F = ApprovedView["findings"][number];

const finding = (over: Partial<F> = {}): F => ({
  id: "F-1", title: "Basis for the duration statement", finding_type: "clarification_needed", explanation: "The report states a duration without showing what it rests on.",
  evidence_strength: "limited", decision_relevance: "material", uncertainty: "Other records may exist.", questions: ["What was the duration based on?"],
  possible_next_steps: ["Ask for the supporting history."], resolution_condition: "The basis is supplied.", resolution_status: "open", sources: [], ...over,
});
const viewOf = (findings: F[], leading: string[] = ["What was the duration based on?"]): ApprovedView => ({
  release_id: "REL-1", case_revision_id: "REV-1", status: "published", overview: "Overview.", human_review: { status: "approved", reviewer_id: "REV-1", reviewer_scope: "Residential" },
  leading_questions: leading, findings, coverage_limitations: ["This is a document review within the supplied evidence."], changes: [],
  method: { statement: "Document review within the supplied evidence. This is not an inspection of the building and not an expert opinion.", rule_pack_version: "x", reference_snapshot_id: "x", model_version: "x", prompt_version: "x", input_snapshot_sha256: "x", run_id: "x" },
});
const read = async (pages: PageSpec[]): Promise<ExtractedDocument> => extractDocument(await makePdf(pages));
const src = (d: ExtractedDocument, phrase: string, page?: number, role: "support" | "counter" = "support") => {
  const r = findAnchor(d, DOC, phrase, page ? { page } : {});
  if (r.status !== "found") throw new Error(`setup: ${phrase} ${r.status}`);
  return { role, anchor: r.anchor };
};
/** A dense page: lines of text across a 72pt margin on both sides. */
const dense = (n: number, label = "Line"): PageSpec => ({ puts: Array.from({ length: n }, (_, i) => ({ text: `${label} ${i + 1} of the assessment text runs across most of this line of the page body`, x: 72, y: 740 - i * (n > 50 ? 11.5 : 14), size: 10 })) });
const inter = (a: Box, b: Box) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
const notesOf = (p: MarkupPlan) => p.pages.flatMap((pg) => pg.notes.filter((n) => n.number !== null).map((n) => ({ ...n, page: pg.index })));

describe("planMarkup: marks and numbers", () => {
  it("marks the exact words with the kind from the rules file, and numbers the finding", async () => {
    const d = await read([dense(10)]);
    const plan = planMarkup(viewOf([finding({ sources: [src(d, "Line 3 of the assessment")] })]), d, DOC, cfg);
    const pg = plan.pages[0]!;
    expect(pg.marks).toHaveLength(1);
    expect(pg.marks[0]).toMatchObject({ number: 1, kind: "circle" });
    const a = src(d, "Line 3 of the assessment").anchor.bbox_normalized!;
    for (let i = 0; i < 4; i++) expect(Math.abs(pg.marks[0]!.box[i]! - a[i]!)).toBeLessThan(0.02);
    expect(plan.issues).toEqual([]);
  });

  it("numbers by page, then top to bottom, whatever order the findings arrive in", async () => {
    const d = await read([dense(10, "Alpha"), dense(10, "Beta")]);
    const f1 = finding({ id: "F-A", sources: [src(d, "Beta 2 of the assessment")] }), f2 = finding({ id: "F-B", sources: [src(d, "Alpha 8 of the assessment")] }), f3 = finding({ id: "F-C", sources: [src(d, "Alpha 2 of the assessment")] });
    const a = planMarkup(viewOf([f1, f2, f3]), d, DOC, cfg), b = planMarkup(viewOf([f3, f1, f2]), d, DOC, cfg);
    const order = (p: MarkupPlan) => p.pages.flatMap((pg) => pg.marks.map((m) => [pg.index, m.number]));
    expect(order(a)).toEqual([[1, 1], [1, 2], [2, 3]]);
    expect(order(a)).toEqual(order(b));
    expect(a.summary.groups.flatMap((g) => g.items).map((i) => [i.number, i.page])).toEqual(expect.arrayContaining([[1, 1], [2, 1], [3, 2]]));
  });

  it("two findings on the same words get different marks that do not coincide, and different numbers", async () => {
    const d = await read([dense(10)]);
    const s = src(d, "Line 4 of the assessment");
    const plan = planMarkup(viewOf([finding({ id: "F-1", sources: [s] }), finding({ id: "F-2", sources: [s] })]), d, DOC, cfg);
    const [m1, m2] = plan.pages[0]!.marks;
    expect(m1!.number).not.toBe(m2!.number);
    expect(m1!.box).not.toEqual(m2!.box);
  });

  it("a finding with anchors on two pages: one number, a mark on each page, one note", async () => {
    const d = await read([dense(8, "Alpha"), dense(8, "Beta")]);
    const f = finding({ finding_type: "internal_inconsistency", sources: [src(d, "Alpha 2 of the assessment"), src(d, "Beta 5 of the assessment")] });
    const plan = planMarkup(viewOf([f]), d, DOC, cfg);
    expect(plan.pages.map((p) => p.marks.map((m) => m.number))).toEqual([[1], [1]]);
    expect(notesOf(plan).filter((n) => n.number === 1)).toHaveLength(1);
  });

  it("only the fixed mark vocabulary is ever used", async () => {
    const d = await read([dense(12)]);
    const types = ["clarification_needed", "supported_reasoning", "documentation_limitation", "insufficiently_supported_recommendation", "internal_inconsistency"];
    const fs = types.map((t, i) => finding({ id: `F-${i}`, finding_type: t, sources: [src(d, `Line ${i + 2} of the assessment`)] }));
    const kinds = new Set(planMarkup(viewOf(fs), d, DOC, cfg).pages.flatMap((p) => p.marks.map((m) => m.kind)));
    for (const k of kinds) expect(["circle", "underline", "bracket"]).toContain(k);
  });
});

describe("planMarkup: notes never cover the report's text", () => {
  it("a margin note sits clear of every run of text, inside the page", async () => {
    const d = await read([dense(10)]);
    const plan = planMarkup(viewOf([finding({ sources: [src(d, "Line 5 of the assessment")] })]), d, DOC, cfg);
    const n = notesOf(plan).find((x) => x.number === 1)!;
    expect(n).toBeDefined();
    for (const s of d.pages[0]!.spans) expect(inter(n.box, spanBox(s)), s.text).toBe(false);
    expect(n.box.every((v) => v >= 0 && v <= 1)).toBe(true);
  });

  it("many findings on one page: no note overlaps text or another note; what does not fit goes to the notes sheet with its full text", async () => {
    const d = await read([dense(40)]);
    const fs = Array.from({ length: 30 }, (_, i) => finding({ id: `F-${i}`, title: `Item ${i}`, questions: [`Question number ${i} about this passage?`], sources: [src(d, `Line ${i + 1} of the assessment`)] }));
    const plan = planMarkup(viewOf(fs), d, DOC, cfg);
    const notes = notesOf(plan);
    for (const [i, a] of notes.entries()) {
      for (const s of d.pages[0]!.spans) expect(inter(a.box, spanBox(s))).toBe(false);
      for (const b of notes.slice(i + 1)) expect(inter(a.box, b.box), `${a.number} vs ${b.number}`).toBe(false);
    }
    expect(notes.length + plan.overflow.length).toBe(30);
    for (const o of plan.overflow) { expect(o.text).toContain("The report states a duration"); expect(plan.issues.some((x) => x.code === "note_overflow" && x.finding_id === o.finding_id)).toBe(true); }
  });

  it("a note that is too long stays off the margin; its number stays on the mark and the full text goes to the notes sheet", async () => {
    const d = await read([dense(8)]);
    const long = "Why ".repeat(60) + "?";
    const plan = planMarkup(viewOf([finding({ questions: [long], sources: [src(d, "Line 2 of the assessment")] })]), d, DOC, cfg);
    expect(notesOf(plan)).toEqual([]);
    expect(plan.pages[0]!.marks[0]!.number).toBe(1);
    expect(plan.overflow[0]).toMatchObject({ number: 1, page: 1 });
    expect(plan.overflow[0]!.text).toContain(long);
  });

  it("a page filled edge to edge leaves no margin: marks stay, notes go to the notes sheet", async () => {
    const full: PageSpec = { puts: Array.from({ length: 64 }, (_, i) => ({ text: `Edge to edge line ${i + 1} fills the entire width of the page with assessment words and more words to widen it further and further still until nothing is left`, x: 4, y: 780 - i * 12, size: 9.2 })) };
    const d = await read([full]);
    expect(Math.max(...d.pages[0]!.spans.map((x) => spanBox(x)[2]))).toBeGreaterThan(0.96); // the setup really does leave no right margin
    const plan = planMarkup(viewOf([finding({ sources: [src(d, "Edge to edge line 4 fills")] })]), d, DOC, cfg);
    expect(plan.pages[0]!.marks).toHaveLength(1);
    expect(notesOf(plan)).toEqual([]);
    expect(plan.overflow).toHaveLength(1);
  });
});

describe("planMarkup: anchors that cannot be marked", () => {
  it("a scanned page gets a page-level note and no mark, and the plan says why", async () => {
    const d = await read([dense(6), {}]);
    const plan = planMarkup(viewOf([finding({ sources: [{ role: "support", anchor: pageOnlyAnchor(d, DOC, 2) }] })]), d, DOC, cfg);
    expect(plan.pages[1]!.marks).toEqual([]);
    expect(notesOf(plan).concat(plan.pages[1]!.notes as any).some((n) => n.page_level === true && n.number === 1) || plan.overflow.length === 1).toBe(true);
    expect(plan.issues).toContainEqual(expect.objectContaining({ finding_id: "F-1", code: "page_level_only" }));
  });

  it("an anchor that fails verification is never drawn on, and the finding is not placed on a guessed page", async () => {
    const d = await read([dense(6)]);
    const good = src(d, "Line 2 of the assessment");
    const bad = { role: "support" as const, anchor: { ...good.anchor, exact_text: "words that are not on the page" } };
    const plan = planMarkup(viewOf([finding({ sources: [bad] })]), d, DOC, cfg);
    expect(plan.pages[0]!.marks).toEqual([]);
    expect(plan.issues).toContainEqual(expect.objectContaining({ finding_id: "F-1", code: "anchor_not_verified" }));
    expect(plan.issues).toContainEqual(expect.objectContaining({ finding_id: "F-1", code: "no_location" }));
    expect(plan.summary.groups.flatMap((g) => g.items)[0]).toMatchObject({ number: 1, page: null });
  });

  it("an anchor in another document is not marked on this one", async () => {
    const d = await read([dense(6)]);
    const s = src(d, "Line 2 of the assessment");
    const plan = planMarkup(viewOf([finding({ sources: [{ role: "support", anchor: { ...s.anchor, document_version_id: "DOC-999-v1" } }] })]), d, DOC, cfg);
    expect(plan.pages[0]!.marks).toEqual([]);
    expect(plan.issues.map((i) => i.code)).toContain("anchor_other_document");
  });
});

describe("planMarkup: the summary page", () => {
  it("is titled, grouped by decision relevance, and keeps what the report supports apart", async () => {
    const d = await read([dense(12)]);
    const fs = [
      finding({ id: "F-1", decision_relevance: "material", sources: [src(d, "Line 2 of the assessment")] }),
      finding({ id: "F-2", decision_relevance: "contextual", sources: [src(d, "Line 5 of the assessment")] }),
      finding({ id: "F-3", finding_type: "supported_reasoning", decision_relevance: "material", title: "Reading is documented", sources: [src(d, "Line 8 of the assessment")] }),
    ];
    const s = planMarkup(viewOf(fs, ["Q one?", "Q two?"]), d, DOC, cfg).summary;
    expect(s.title).toBe("Summary of items to clarify");
    expect(s.leading_questions).toEqual(["Q one?", "Q two?"]);
    expect(s.groups.map((g) => g.heading)).toEqual(["Items that bear on your decision", "Other items worth knowing", "Where the report explains its reasoning"]);
    expect(s.groups[0]!.items.map((i) => i.number)).toEqual([1]);
    expect(s.groups[2]!.items[0]!.title).toBe("Reading is documented");
    expect(s.limits).toEqual(["This is a document review within the supplied evidence."]);
    expect(s.items_to_clarify_statement).toBeNull();
  });

  it("each line carries number, title, report page, evidence strength, and next step, and nothing counts or ranks", async () => {
    const d = await read([dense(8)]);
    const s = planMarkup(viewOf([finding({ sources: [src(d, "Line 2 of the assessment")] })]), d, DOC, cfg).summary;
    expect(s.groups[0]!.items[0]).toEqual({ number: 1, title: "Basis for the duration statement", page: 1, label: null, strength: "limited", next_step: "Ask for the supporting history." });
    const text = JSON.stringify(s).toLowerCase();
    for (const bad of ["total", "deficien", "fail", "pass", "score", "rank", "grade", "problems found"]) expect(text, bad).not.toContain(bad);
  });

  it("at most the configured number of leading questions are shown", async () => {
    const d = await read([dense(4)]);
    const qs = Array.from({ length: 9 }, (_, i) => `Question ${i}?`);
    expect(planMarkup(viewOf([], qs), d, DOC, cfg).summary.leading_questions).toHaveLength(cfg.leading_questions_max);
  });

  it("zero findings is a valid plan with a plain statement, never an empty or crashing document", async () => {
    const d = await read([dense(4), dense(4)]);
    const plan = planMarkup(viewOf([], []), d, DOC, cfg);
    expect(plan.pages).toHaveLength(2);
    expect(plan.pages.every((p) => p.marks.length === 0 && p.notes.length === 0)).toBe(true);
    expect(plan.summary.groups).toEqual([]);
    expect(plan.summary.items_to_clarify_statement).toBe(cfg.labels.nothing_to_clarify);
    expect(plan.summary.limits.length).toBeGreaterThan(0);
  });
});

describe("planMarkup: pages, rotation, page one, scale", () => {
  it("pages keep their own displayed size, and rotated pages mark the displayed words", async () => {
    const d = await read([dense(6), { rotate: 90, width: 595, height: 842, puts: [{ text: "Closet humidity was persistently elevated", x: 72, y: 700 }] }, { width: 400, height: 300, puts: [{ text: "Small page text", x: 40, y: 250 }] }]);
    const plan = planMarkup(viewOf([finding({ sources: [src(d, "humidity was persistently")] })]), d, DOC, cfg);
    expect(plan.pages.map((p) => [p.width_pt, p.height_pt])).toEqual([[612, 792], [842, 595], [400, 300]]);
    const m = plan.pages[1]!.marks[0]!;
    expect((m.box[0] + m.box[2]) / 2).toBeGreaterThan(0.8);
  });

  it("page one carries a pointer to the summary page when there is something to ask, and not otherwise", async () => {
    const d = await read([dense(8), dense(8)]);
    const withF = planMarkup(viewOf([finding({ sources: [src(d, "Line 2 of the assessment", 2)] })]), d, DOC, cfg);
    expect(withF.summary_page_number).toBe(3);
    expect(withF.pages[0]!.notes.some((n) => n.number === null && n.text === "Questions to ask the inspector: see page 3")).toBe(true);
    const none = planMarkup(viewOf([], []), d, DOC, cfg);
    expect(none.pages[0]!.notes).toEqual([]);
  });

  it("sixty findings: numbers are unique and stable, and the same inputs give the same plan", async () => {
    const d = await read([dense(60)]);
    const fs = Array.from({ length: 60 }, (_, i) => finding({ id: `F-${i}`, title: `Item ${i}`, sources: [src(d, `Line ${i + 1} of the assessment`)] }));
    const a = planMarkup(viewOf(fs), d, DOC, cfg), b = planMarkup(viewOf(fs), d, DOC, cfg);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    const nums = a.pages.flatMap((p) => p.marks.map((m) => m.number)).sort((x, y) => x - y);
    expect(nums).toEqual(Array.from({ length: 60 }, (_, i) => i + 1));
    expect(a.summary.groups.flatMap((g) => g.items)).toHaveLength(60);
  });

  it("every string the plan writes passes the same wording rules as findings", async () => {
    const d = await read([dense(10)]);
    const plan = planMarkup(viewOf([finding({ sources: [src(d, "Line 2 of the assessment")] })]), d, DOC, cfg);
    const strings: string[] = [];
    const walk = (v: unknown) => { if (typeof v === "string") strings.push(v); else if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === "object") Object.values(v).forEach(walk); };
    walk(plan.summary); plan.pages.forEach((p) => p.notes.forEach((n) => strings.push(n.text))); plan.overflow.forEach((o) => strings.push(o.text));
    walk(cfg.labels);
    for (const s of strings) expect(wordingProblems(s), s).toEqual([]);
  });
});
