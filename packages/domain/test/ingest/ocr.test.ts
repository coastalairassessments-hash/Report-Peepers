import { describe, it, expect } from "vitest";
import { ocrDocument, type OcrPort, type OcrLine, type PageRenderer } from "../../src/ingest/ocr.js";
import { findAnchor, verifyAnchor } from "../../src/ingest/anchors.js";
import { read } from "../render/helpers.js";
import type { PageSpec } from "./fixtures.js";

const page = (ls: string[]): PageSpec => ({ puts: ls.map((text, i) => ({ text, x: 40, y: 740 - i * 13, size: 9 })) });
const line = (text: string, y: number, confidence = 90): OcrLine => ({ text, confidence, box: [0.1, y, 0.9, y + 0.02] });
const renderer: PageRenderer = { async render() { return new Uint8Array([1]); } };
const portOf = (byCall: OcrLine[][]): OcrPort & { calls: number } => { const p = { calls: 0, async recognize() { return byCall[p.calls++] ?? []; } }; return p; };
const TABLE = [line("Spore Types Raw Count Count/m3", 0.2), line("Aspergillus/Penicillium-Like 85 1,267", 0.25), line("Chaetomium 9 120", 0.3), line("Total Spores 97 1,293", 0.35)];

describe("reading text that sits in images", () => {
  it("adds readable text from an image page, marked as read from an image", async () => {
    const { bytes, doc } = await read([page(["LAB RESULTS:", "Air Samples"])]);
    const out = await ocrDocument(doc, bytes, portOf([TABLE]), renderer);
    const p = out.pages[0]!;
    expect(p.text).toContain("LAB RESULTS:");
    expect(p.text).toContain("Chaetomium 9 120");
    expect(p.quality_flags).toContain("read_from_image");
  });

  it("an anchor on image-read words says so and still verifies", async () => {
    const { bytes, doc } = await read([page(["LAB RESULTS:"])]);
    const out = await ocrDocument(doc, bytes, portOf([TABLE]), renderer);
    const r = findAnchor(out, "DOC-001-v1", "Chaetomium 9 120");
    expect(r.status).toBe("found");
    if (r.status !== "found") return;
    expect(r.anchor.extraction_method).toBe("ocr");
    expect(r.anchor.quality_flags).toContain("read_from_image");
    expect(verifyAnchor(out, r.anchor)).toEqual({ ok: true });
  });

  it("an anchor on the page's own text stays native", async () => {
    const { bytes, doc } = await read([page(["LAB RESULTS:"])]);
    const out = await ocrDocument(doc, bytes, portOf([TABLE]), renderer);
    const r = findAnchor(out, "DOC-001-v1", "LAB RESULTS:");
    expect(r.status === "found" && r.anchor.extraction_method).toBe("native_text");
  });

  it("throws away low-confidence junk, such as a photo of a room", async () => {
    const { bytes, doc } = await read([page(["Dining Room", "Mold growth was found behind the baseboard."])]);
    const junk = [line("xk qp", 0.2, 20), line("lll 7 ,,", 0.3, 15), line("aa bb cc dd ee ff gg hh ii jj kk ll mm nn oo pp", 0.4, 30)];
    const out = await ocrDocument(doc, bytes, portOf([junk]), renderer);
    expect(out.pages[0]!.text).not.toContain("xk qp");
    expect(out.pages[0]!.quality_flags).not.toContain("read_from_image");
  });

  it("a page with no text that OCR cannot read stays flagged as unreadable, and the document stays partial", async () => {
    const { bytes, doc } = await read([{ puts: [] }]);
    const out = await ocrDocument(doc, bytes, portOf([[]]), renderer);
    expect(out.pages[0]!.quality_flags).toContain("no_text_layer");
    expect(out.status).toBe("partially_readable");
  });

  it("a page with no text that OCR reads becomes readable", async () => {
    const { bytes, doc } = await read([{ puts: [] }]);
    const out = await ocrDocument(doc, bytes, portOf([TABLE]), renderer);
    expect(out.pages[0]!.quality_flags).not.toContain("no_text_layer");
    expect(out.status).toBe("readable");
  });

  it("does not spend OCR on pages that already have plenty of text", async () => {
    const full: PageSpec = { puts: Array.from({ length: 30 }, (_, i) => ({ text: `Line ${i} of ordinary report text with enough words on it`, x: 40, y: 760 - i * 12, size: 9 })) };
    const { bytes, doc } = await read([full]);
    const port = portOf([TABLE]);
    await ocrDocument(doc, bytes, port, renderer);
    expect(port.calls).toBe(0);
  });

  it("stops at the page cap and says which pages were skipped", async () => {
    const { bytes, doc } = await read([{ puts: [] }, { puts: [] }, { puts: [] }]);
    const port = portOf([TABLE, TABLE, TABLE]);
    const out = await ocrDocument(doc, bytes, port, renderer, { maxPages: 2 });
    expect(port.calls).toBe(2);
    expect(out.pages[2]!.quality_flags).toContain("ocr_skipped_page_limit");
    expect(out.status).toBe("partially_readable");
  });

  it("an OCR error on one page does not stop the others and leaves that page flagged", async () => {
    const { bytes, doc } = await read([{ puts: [] }, { puts: [] }]);
    let n = 0;
    const port: OcrPort = { async recognize() { if (n++ === 0) throw new Error("boom"); return TABLE; } };
    const out = await ocrDocument(doc, bytes, port, renderer);
    expect(out.pages[0]!.quality_flags).toEqual(expect.arrayContaining(["no_text_layer", "ocr_failed"]));
    expect(out.pages[1]!.text).toContain("Chaetomium");
  });

  it("never changes the original document object", async () => {
    const { bytes, doc } = await read([page(["LAB RESULTS:"])]);
    const before = JSON.stringify(doc);
    await ocrDocument(doc, bytes, portOf([TABLE]), renderer);
    expect(JSON.stringify(doc)).toBe(before);
  });
});
