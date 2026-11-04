import { describe, it, expect } from "vitest";
import { extractDocument } from "../../src/ingest/extract.js";
import { planMarkup, loadMarkupConfig } from "../../src/render/plan.js";
import { renderMarkup } from "../../src/render/renderMarkup.js";
import { DOC, finding, viewOf, read, src, dense } from "./helpers.js";

const cfg = loadMarkupConfig();
const text = (d: Awaited<ReturnType<typeof extractDocument>>) => d.pages.map((p) => p.text).join("\n");

describe("renderMarkup", () => {
  it("keeps every original page first, at its own size, then adds the typed summary", async () => {
    const { bytes, doc } = await read([dense(8), { rotate: 90, width: 595, height: 842, puts: [{ text: "Closet humidity was persistently elevated", x: 72, y: 700 }] }, { width: 400, height: 300, puts: [{ text: "Small page text", x: 40, y: 250 }] }]);
    const plan = planMarkup(viewOf([finding({ sources: [src(doc, "Line 2 of the assessment"), src(doc, "humidity was persistently")] })]), doc, DOC, cfg);
    const r = await renderMarkup(bytes, plan);
    expect(r.ok, r.ok ? "" : r.diagnostics).toBe(true);
    if (!r.ok) return;
    const out = await extractDocument(r.pdf);
    expect(out.page_count).toBe(4); // 3 pages + 1 summary page
    expect(out.pages.slice(0, 3).map((p) => [Math.round(p.width), Math.round(p.height)])).toEqual([[612, 792], [842, 595], [400, 300]]);
    expect(out.pages[0]!.text).toContain("Line 2 of the assessment");
    expect(out.pages[1]!.text).toContain("Closet humidity was persistently elevated");
    expect(out.pages[3]!.text).toContain(plan.summary.title);
  });

  it("writes each margin note as real, extractable text, and Typst control characters stay literal", async () => {
    const { bytes, doc } = await read([dense(8)]);
    const tricky = "Is #set page(width: 1pt) *bold* $x$ @ref \\ _it_ ok?";
    const plan = planMarkup(viewOf([finding({ questions: [tricky], sources: [src(doc, "Line 2 of the assessment")] })], [tricky]), doc, DOC, cfg);
    expect(plan.pages[0]!.notes.some((n) => n.number === 1)).toBe(true);
    const r = await renderMarkup(bytes, plan);
    expect(r.ok, r.ok ? "" : r.diagnostics).toBe(true);
    if (!r.ok) return;
    const out = await extractDocument(r.pdf);
    const flat = text(out).replace(/\s+/g, " ");
    expect(flat).toContain("#set page(width: 1pt)");
    expect(flat).toContain("*bold*");
    expect(flat).toContain("$x$");
    expect(out.page_count).toBe(2); // the control characters did not change the page structure
    for (const n of plan.pages[0]!.notes) expect(flat).toContain(n.text.split(" ")[0]!);
  });

  it("an empty plan still renders: the report and a plain statement", async () => {
    const { bytes, doc } = await read([dense(4), dense(4)]);
    const r = await renderMarkup(bytes, planMarkup(viewOf([], []), doc, DOC, cfg));
    expect(r.ok, r.ok ? "" : r.diagnostics).toBe(true);
    if (!r.ok) return;
    const out = await extractDocument(r.pdf);
    expect(out.page_count).toBe(3);
    expect(out.pages[2]!.text).toContain(cfg.labels.nothing_to_clarify);
  });

  it("overflow text goes on a notes sheet in full", async () => {
    const { bytes, doc } = await read([dense(8)]);
    const long = "Why ".repeat(60) + "?";
    const plan = planMarkup(viewOf([finding({ questions: [long], sources: [src(doc, "Line 2 of the assessment")] })]), doc, DOC, cfg);
    const r = await renderMarkup(bytes, plan);
    expect(r.ok, r.ok ? "" : r.diagnostics).toBe(true);
    if (!r.ok) return;
    const out = await extractDocument(r.pdf);
    expect(out.page_count).toBe(3);
    expect(out.pages[2]!.text).toContain(cfg.labels.notes_sheet_title);
    expect(out.pages[2]!.text.replace(/\s+/g, " ")).toContain("Why Why Why");
  });

  it("fails and returns no file when the plan names a page the source does not have", async () => {
    const { bytes, doc } = await read([dense(4)]);
    const plan = planMarkup(viewOf([], []), doc, DOC, cfg);
    const bad = { ...plan, pages: [...plan.pages, { ...plan.pages[0]!, index: 2 }] };
    const r = await renderMarkup(bytes, bad);
    expect(r.ok).toBe(false);
  });

  it("gives the same bytes for the same inputs", async () => {
    const { bytes, doc } = await read([dense(8)]);
    const plan = planMarkup(viewOf([finding({ sources: [src(doc, "Line 3 of the assessment")] })]), doc, DOC, cfg);
    const a = await renderMarkup(bytes, plan), b = await renderMarkup(bytes, plan);
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) expect(Buffer.from(a.pdf).equals(Buffer.from(b.pdf))).toBe(true);
  });
});
