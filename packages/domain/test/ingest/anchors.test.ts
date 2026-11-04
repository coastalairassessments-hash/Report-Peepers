import { describe, it, expect } from "vitest";
import { extractDocument, type ExtractedDocument } from "../../src/ingest/extract.js";
import { findAnchor, verifyAnchor, pageOnlyAnchor } from "../../src/ingest/anchors.js";
import { makePdf, type PageSpec } from "./fixtures.js";

const DOC = "DOC-001-v1";
const read = async (pages: PageSpec[], labels = false): Promise<ExtractedDocument> => extractDocument(await makePdf(pages, { labels }));
const long = "The assessor recorded one closet humidity reading during the limited visit";
const base = (): PageSpec[] => [
  { puts: [{ text: "Summary of the visit", x: 72, y: 720 }] },
  { puts: [{ text: long, x: 72, y: 700 }, { text: "Mold-like staining was noted near the vent.", x: 72, y: 680 }] },
];

describe("findAnchor", () => {
  it("finds a unique phrase with page, label, exact text, and a box where it sits", async () => {
    const d = await read(base(), true);
    const r = findAnchor(d, DOC, "closet humidity reading");
    expect(r.status).toBe("found");
    if (r.status !== "found") return;
    const a = r.anchor;
    expect(a).toMatchObject({ document_version_id: DOC, pdf_page_index_1based: 2, printed_page_label: "1", exact_text: "closet humidity reading", extraction_method: "native_text", quality_flags: [], paragraph_or_table_anchor: null });
    const [x0, y0, x1, y1] = a.bbox_normalized!;
    expect(x0).toBeGreaterThan(72 / 612); expect(x1).toBeLessThan(0.8);
    expect(y0).toBeGreaterThan((792 - 702 - 12) / 792 - 0.02); expect(y1).toBeLessThan((792 - 700) / 792 + 0.02);
  });

  it("the box covers only the phrase, not the whole run of text it sits in", async () => {
    const d = await read(base());
    const whole = findAnchor(d, DOC, long), part = findAnchor(d, DOC, "closet humidity");
    expect(whole.status === "found" && part.status === "found").toBe(true);
    if (whole.status !== "found" || part.status !== "found") return;
    const w = whole.anchor.bbox_normalized!, p = part.anchor.bbox_normalized!;
    expect(p[2] - p[0]).toBeLessThan((w[2] - w[0]) / 2);
    expect(p[0]).toBeGreaterThan(w[0]); expect(p[2]).toBeLessThan(w[2]);
  });

  it("a phrase that appears twice is reported as multiple matches, never silently the first", async () => {
    const d = await read([{ puts: [{ text: "Humidity was high. Humidity was high.", x: 72, y: 700 }] }, { puts: [{ text: "Humidity was high again", x: 72, y: 700 }] }]);
    const r = findAnchor(d, DOC, "Humidity was high");
    expect(r.status).toBe("multiple_matches");
    expect(r.status === "multiple_matches" && r.candidates.length).toBe(3);
    expect(r.status === "multiple_matches" && r.candidates.map((c) => c.pdf_page_index_1based)).toEqual([1, 1, 2]);
    const onTwo = findAnchor(d, DOC, "Humidity was high", { page: 2 });
    expect(onTwo.status).toBe("found");
  });

  it("not found for absent, empty, or blank phrases", async () => {
    const d = await read(base());
    for (const q of ["attic insulation", "", "   ", "\n"]) expect(findAnchor(d, DOC, q).status, JSON.stringify(q)).toBe("not_found");
  });

  it("matching is exact in case; a changed word is not found", async () => {
    const d = await read(base());
    expect(findAnchor(d, DOC, "Closet humidity").status).toBe("not_found");
    expect(findAnchor(d, DOC, "closet moisture").status).toBe("not_found");
  });

  it("finds a phrase split across two lines and flags it, with a box covering both lines", async () => {
    const d = await read([{ puts: [{ text: "the moisture", x: 72, y: 700 }, { text: "reading was high", x: 72, y: 686 }] }]);
    const r = findAnchor(d, DOC, "moisture reading");
    expect(r.status).toBe("found");
    if (r.status !== "found") return;
    expect(r.anchor.quality_flags).toContain("split_across_lines");
    expect(r.anchor.exact_text).toBe("moisture\nreading");
    const b = r.anchor.bbox_normalized!;
    expect(b[3] - b[1]).toBeGreaterThan(20 / 792);
  });

  it("finds a word hyphenated at a line end and flags both facts", async () => {
    const d = await read([{ puts: [{ text: "the hydro-", x: 72, y: 700 }, { text: "nic system leaked", x: 72, y: 686 }] }]);
    const r = findAnchor(d, DOC, "hydronic system");
    expect(r.status).toBe("found");
    if (r.status !== "found") return;
    expect(r.anchor.quality_flags).toEqual(expect.arrayContaining(["split_across_lines", "hyphenated_line_break"]));
    expect(r.anchor.exact_text).toBe("hydro-\nnic system");
  });

  it("curly quotes: matches a straight-quote query, stores the page's own exact text", async () => {
    const d = await read([{ puts: [{ text: "He said “yes” twice", x: 72, y: 700 }] }]);
    const r = findAnchor(d, DOC, 'He said "yes"');
    expect(r.status).toBe("found");
    expect(r.status === "found" && r.anchor.exact_text).toBe("He said “yes”");
  });

  it("on a rotated page the box lands on the displayed words", async () => {
    const d = await read([{ rotate: 90, puts: [{ text: "Closet humidity was high", x: 72, y: 700 }] }]);
    const r = findAnchor(d, DOC, "humidity");
    expect(r.status).toBe("found");
    if (r.status !== "found") return;
    expect(verifyAnchor(d, r.anchor)).toEqual({ ok: true });
    const [x0, , x1] = r.anchor.bbox_normalized!;
    expect((x0 + x1) / 2).toBeGreaterThan(0.8); // text near y=700 of a page shown sideways sits at the far right
  });
});

describe("verifyAnchor", () => {
  const good = async () => {
    const d = await read(base(), true);
    const r = findAnchor(d, DOC, "closet humidity reading");
    if (r.status !== "found") throw new Error("setup");
    return { d, a: r.anchor };
  };

  it("accepts an anchor built from the page", async () => {
    const { d, a } = await good();
    expect(verifyAnchor(d, a)).toEqual({ ok: true });
  });

  it("one changed character fails", async () => {
    const { d, a } = await good();
    expect(verifyAnchor(d, { ...a, exact_text: "closet humidity readinq" })).toEqual({ ok: false, reason: "text_not_on_page" });
  });

  it("the right words on the wrong page fail; words found nowhere fail differently", async () => {
    const { d, a } = await good();
    expect(verifyAnchor(d, { ...a, pdf_page_index_1based: 1 })).toEqual({ ok: false, reason: "wrong_page" });
    expect(verifyAnchor(d, { ...a, exact_text: "something never written" })).toEqual({ ok: false, reason: "text_not_on_page" });
  });

  it("a page that does not exist fails", async () => {
    const { d, a } = await good();
    expect(verifyAnchor(d, { ...a, pdf_page_index_1based: 9 })).toEqual({ ok: false, reason: "no_such_page" });
    expect(verifyAnchor(d, { ...a, pdf_page_index_1based: null })).toEqual({ ok: false, reason: "no_such_page" });
  });

  it("a box somewhere else on the page, or the whole page, fails", async () => {
    const { d, a } = await good();
    expect(verifyAnchor(d, { ...a, bbox_normalized: [0.1, 0.8, 0.3, 0.85] })).toEqual({ ok: false, reason: "text_not_in_box" });
    expect(verifyAnchor(d, { ...a, bbox_normalized: [0, 0, 1, 1] })).toEqual({ ok: false, reason: "text_not_in_box" });
  });

  it("exact text with a quote or space changed is not the page's exact text", async () => {
    const d = await read([{ puts: [{ text: "He said “yes” twice", x: 72, y: 700 }] }]);
    const r = findAnchor(d, DOC, "He said “yes”");
    if (r.status !== "found") throw new Error("setup");
    expect(verifyAnchor(d, r.anchor)).toEqual({ ok: true });
    expect(verifyAnchor(d, { ...r.anchor, exact_text: 'He said "yes"' })).toEqual({ ok: false, reason: "text_not_exact" });
  });

  it("text without a box is refused on a page that has text", async () => {
    const { d, a } = await good();
    expect(verifyAnchor(d, { ...a, bbox_normalized: null })).toEqual({ ok: false, reason: "box_missing" });
  });
});

describe("scanned pages: page-only anchors, never a guessed box", () => {
  it("a page with no text layer gets a page-only anchor that verifies", async () => {
    const d = await read([{ puts: [{ text: "Typed page", x: 72, y: 700 }] }, {}], true);
    const a = pageOnlyAnchor(d, DOC, 2);
    expect(a).toMatchObject({ pdf_page_index_1based: 2, printed_page_label: "1", bbox_normalized: null, exact_text: null, quality_flags: ["no_text_layer"] });
    expect(verifyAnchor(d, a)).toEqual({ ok: true });
  });

  it("claiming exact text on a scanned page fails", async () => {
    const d = await read([{}]);
    const a = { ...pageOnlyAnchor(d, DOC, 1), exact_text: "Closet humidity", bbox_normalized: [0.1, 0.1, 0.3, 0.2] as [number, number, number, number] };
    expect(verifyAnchor(d, a)).toEqual({ ok: false, reason: "page_has_no_text" });
  });

  it("findAnchor does not invent a location on a scanned page", async () => {
    const d = await read([{}]);
    expect(findAnchor(d, DOC, "anything").status).toBe("not_found");
  });

  it("a page-only anchor for a page that does not exist is refused", async () => {
    const d = await read([{}]);
    expect(() => pageOnlyAnchor(d, DOC, 5)).toThrow(/page/i);
  });
});
