import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { normalizeText, type ExtractedDocument, type ExtractedPage, type Span } from "./extract.js";

/** One line of text read from an image. `box` is [x0, y0, x1, y1], normalized 0 to 1, origin top left. */
export interface OcrLine { text: string; confidence: number; box: [number, number, number, number] }
/** Turns a page image into lines of text. The real one runs on our own machine; tests use a scripted one. */
export interface OcrPort { recognize(png: Uint8Array): Promise<OcrLine[]> }
/** Draws one page of a PDF as an image. */
export interface PageRenderer { render(pdf: Uint8Array, pageIndex1: number, dpi: number): Promise<Uint8Array> }

export interface OcrConfig { ocr_when_native_words_below: number; min_line_confidence: number; min_accepted_words_per_page: number; max_pages: number; render_dpi: number; low_confidence_below: number }
export function loadOcrConfig(path = resolve(import.meta.dirname, "../../../../data/rules/ocr.json")): OcrConfig {
  const c = JSON.parse(readFileSync(path, "utf8")) as OcrConfig;
  for (const k of ["ocr_when_native_words_below", "min_line_confidence", "min_accepted_words_per_page", "max_pages", "render_dpi", "low_confidence_below"] as const) if (typeof c[k] !== "number") throw new Error(`ocr.json: ${k} must be a number`);
  return c;
}

const wordsIn = (s: string): number => s.split(/\s+/).filter(Boolean).length;
const usable = (l: OcrLine, minConf: number): boolean => l.confidence >= minConf && /[A-Za-z0-9]{2,}/.test(l.text) && l.text.trim().length > 0;

/**
 * Adds text read from images to pages that have little or no text of their own (lab sheets, tables saved as pictures).
 * The page's own text is never changed. Added lines come after it, carry their confidence, and anchors on them say they were read
 * from an image. Low-confidence reads (a photo of a room, say) are thrown away. A page that has no text and gives nothing readable
 * stays flagged as unreadable, so the review still says so. Returns a new document; the original is untouched.
 */
export async function ocrDocument(doc: ExtractedDocument, pdf: Uint8Array, port: OcrPort, renderer: PageRenderer, opts: { maxPages?: number; config?: OcrConfig } = {}): Promise<ExtractedDocument> {
  const cfg = opts.config ?? loadOcrConfig();
  const cap = opts.maxPages ?? cfg.max_pages;
  let used = 0;
  const pages: ExtractedPage[] = [];
  for (const p of doc.pages) {
    if (wordsIn(p.text) >= cfg.ocr_when_native_words_below) { pages.push(p); continue; }
    if (used >= cap) { pages.push({ ...p, quality_flags: [...p.quality_flags, "ocr_skipped_page_limit"] }); continue; }
    used++;
    let lines: OcrLine[];
    try { lines = await port.recognize(await renderer.render(pdf, p.index, cfg.render_dpi)); }
    catch { pages.push({ ...p, quality_flags: [...p.quality_flags, "ocr_failed"] }); continue; }
    const good = lines.filter((l) => usable(l, cfg.min_line_confidence));
    if (good.reduce((n, l) => n + wordsIn(l.text), 0) < cfg.min_accepted_words_per_page) { pages.push(p); continue; }
    let text = p.text;
    const spans: Span[] = [...p.spans];
    for (const l of good) {
      if (text.length > 0) text += "\n";
      const start = text.length;
      text += l.text.trim();
      const [x0, y0, x1, y1] = l.box;
      spans.push({ text: l.text.trim(), normalized_text: normalizeText(l.text), start, end: text.length, origin: [x0, y1], along: [x1 - x0, 0], up: [0, -(y1 - y0)], source: "ocr", confidence: l.confidence });
    }
    const flags = p.quality_flags.filter((f) => f !== "no_text_layer");
    flags.push("read_from_image");
    if (good.some((l) => l.confidence < cfg.low_confidence_below)) flags.push("low_ocr_confidence");
    pages.push({ ...p, text, spans, quality_flags: flags });
  }
  const partial = pages.some((p) => p.quality_flags.includes("no_text_layer") || p.quality_flags.includes("ocr_skipped_page_limit"));
  return { ...doc, pages, status: partial ? "partially_readable" : "readable" };
}
