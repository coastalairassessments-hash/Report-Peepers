import { describe, it, expect } from "vitest";
import { extractDocument, spanBox, type Span } from "../../src/ingest/extract.js";
import { makePdf } from "./fixtures.js";

const W = 612, H = 792, SIZE = 12;
// a small tolerance for font metrics; this is a layout allowance, not a scientific threshold
const TOL = 0.02;
const near = (a: number, b: number, tol = TOL) => expect(Math.abs(a - b), `${a} vs ${b}`).toBeLessThanOrEqual(tol);
const one = async (rotate: 0 | 90 | 180 | 270 = 0) =>
  (await extractDocument(await makePdf([{ rotate, puts: [{ text: "Closet humidity was high", x: 72, y: 700, size: SIZE }] }]))).pages[0]!;
const center = (s: Span) => { const b = spanBox(s); return [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2] as const; };

describe("extractDocument: text, boxes, labels", () => {
  it("puts text inside the expected normalized box on an unrotated page", async () => {
    const p = await one(0), s = p.spans[0]!, b = spanBox(s);
    near(b[0], 72 / W); near(b[1], (H - 700 - SIZE) / H); near(b[3], (H - 700) / H);
    expect(b[2]).toBeGreaterThan(b[0] + 0.1);
    expect(b.every((v) => v >= 0 && v <= 1)).toBe(true);
    expect(b[0]).toBeLessThan(b[2]); expect(b[1]).toBeLessThan(b[3]);
  });

  it("boxes land on the displayed words after the page is rotated", async () => {
    // phrase centre in page points: about 64 across from x=72, about 6 up from the baseline at y=700
    const cx = 136, cy = 706;
    const expected: [90 | 180 | 270, number, number][] = [
      [90, cy / H, cx / W],             // displayed sideways: width is H, height is W
      [180, (W - cx) / W, cy / H],      // upside down
      [270, (H - cy) / H, (W - cx) / W],
    ];
    for (const [rot, ex, ey] of expected) {
      const p = await one(rot);
      expect(p.rotation).toBe(rot);
      const [x, y] = center(p.spans[0]!);
      near(x, ex, 0.04); near(y, ey, 0.04);
    }
  });

  it("a page with no text layer is flagged and the document is partially readable", async () => {
    const d = await extractDocument(await makePdf([{ puts: [{ text: "Page one", x: 72, y: 700 }] }, {}, {}]));
    expect(d.pages.map((p) => p.quality_flags)).toEqual([[], ["no_text_layer"], ["no_text_layer"]]);
    expect(d.status).toBe("partially_readable");
    expect(d.pages[1]!.spans).toEqual([]);
    const ok = await extractDocument(await makePdf([{ puts: [{ text: "Only page", x: 72, y: 700 }] }]));
    expect(ok.status).toBe("readable");
  });

  it("keeps the PDF page index and the printed page label separate", async () => {
    const pages = [{ puts: [{ text: "Cover", x: 72, y: 700 }] }, { puts: [{ text: "First", x: 72, y: 700 }] }, { puts: [{ text: "Second", x: 72, y: 700 }] }];
    const labeled = await extractDocument(await makePdf(pages, { labels: true }));
    expect(labeled.pages.map((p) => [p.index, p.label])).toEqual([[1, "i"], [2, "1"], [3, "2"]]);
    const plain = await extractDocument(await makePdf(pages));
    expect(plain.pages.map((p) => p.label)).toEqual([null, null, null]);
  });

  it("page text reads top to bottom, and every span points at its own text", async () => {
    const d = await extractDocument(await makePdf([{ puts: [{ text: "Lower line", x: 72, y: 600 }, { text: "Upper line", x: 72, y: 700 }, { text: "Second part", x: 300, y: 700 }] }]));
    const p = d.pages[0]!;
    expect(p.text.indexOf("Upper line")).toBeLessThan(p.text.indexOf("Lower line"));
    expect(p.text).toContain("Upper line Second part");
    for (const s of p.spans) expect(p.text.slice(s.start, s.end)).toBe(s.text);
  });

  it("keeps exact text and a normalized copy apart", async () => {
    const p = (await extractDocument(await makePdf([{ puts: [{ text: "He said “yes”", x: 72, y: 700 }] }]))).pages[0]!;
    expect(p.spans[0]!.text).toContain("“");
    expect(p.spans[0]!.normalized_text).toBe('He said "yes"');
  });

  it("a document with many pages keeps its page count and order", async () => {
    const d = await extractDocument(await makePdf(Array.from({ length: 5 }, (_, i) => ({ puts: [{ text: `Page ${i + 1} text`, x: 72, y: 700 }] }))));
    expect(d.page_count).toBe(5);
    expect(d.pages.map((p) => p.index)).toEqual([1, 2, 3, 4, 5]);
    expect(d.pages[3]!.text).toContain("Page 4 text");
  });
});
