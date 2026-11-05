import { getDocument, Util } from "pdfjs-dist/legacy/build/pdf.mjs";

/**
 * One run of text on a page. Positions are normalized 0 to 1 against the page as displayed (after rotation),
 * origin at the top left, y pointing down. `origin` is where the baseline starts, `along` is the full baseline
 * vector, `up` is the full height vector. This describes the text correctly on a rotated page too.
 */
export interface Span {
  /** Exact text as extracted. Never altered. */
  text: string;
  /** Matching copy: compatibility-folded, straight quotes, collapsed spaces. Kept apart from the exact text. */
  normalized_text: string;
  /** Offsets of `text` inside the page's `text`. */
  start: number;
  end: number;
  origin: [number, number];
  along: [number, number];
  up: [number, number];
  /** Set only on text read from an image. Native text has neither. */
  source?: "ocr";
  /** 0 to 100, from the reader. Only on text read from an image. */
  confidence?: number;
}

export interface ExtractedPage {
  /** 1-based PDF page index. */
  index: number;
  /** The page label the PDF itself defines (for example "iv" or "12"); null when it defines none. Never guessed from the text. */
  label: string | null;
  /** Page size in points as displayed. */
  width: number;
  height: number;
  rotation: number;
  text: string;
  spans: Span[];
  quality_flags: string[];
}

export interface ExtractedDocument {
  page_count: number;
  /** `partially_readable` when any page has no text layer. Never silently complete. */
  status: "readable" | "partially_readable";
  pages: ExtractedPage[];
}

/** Fold a string for matching only. The exact text is always stored separately. */
export function normalizeText(s: string): string {
  return s.normalize("NFKC")
    .replace(/[‘’‚‛]/g, "'").replace(/[“”„‟]/g, '"')
    .replace(/[‐-―−]/g, "-").replace(/­/g, "")
    .replace(/\s+/g, " ").trim();
}

/** Axis-aligned box [x0, y0, x1, y1] covering a span, normalized, clamped to the page. */
export function spanBox(s: Pick<Span, "origin" | "along" | "up">): [number, number, number, number] {
  return quadBox(s.origin, s.along, s.up, 0, 1);
}

/** Box for the part of a span between two fractions of its length (0 to 1) along the baseline. */
export function quadBox(origin: readonly [number, number], along: readonly [number, number], up: readonly [number, number], from: number, to: number): [number, number, number, number] {
  const pts: [number, number][] = [];
  for (const t of [from, to]) for (const u of [0, 1]) pts.push([origin[0] + along[0] * t + up[0] * u, origin[1] + along[1] * t + up[1] * u]);
  const c = (v: number) => Math.min(1, Math.max(0, v));
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  return [c(Math.min(...xs)), c(Math.min(...ys)), c(Math.max(...xs)), c(Math.max(...ys))];
}

interface Item { str: string; transform: number[]; width: number; height: number; hasEOL?: boolean }

/**
 * Reads every page of an already-preflighted PDF. Text only: a page with no text layer is flagged, not read.
 * Nothing in the file is executed. Throws if the file cannot be read (preflight should have caught it).
 */
export async function extractDocument(bytes: Uint8Array): Promise<ExtractedDocument> {
  const task = getDocument({ data: new Uint8Array(bytes), enableXfa: false, useWorkerFetch: false, disableFontFace: true, verbosity: 0 });
  const doc = await task.promise;
  try {
    const labels: string[] | null = await doc.getPageLabels();
    const pages: ExtractedPage[] = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const vp = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      const spans: Span[] = [];
      let text = "";

      // geometry for every non-blank run
      interface G { str: string; origin: [number, number]; along: [number, number]; up: [number, number]; h: number }
      const runs: G[] = [];
      for (const raw of content.items as unknown as Item[]) {
        if (typeof raw.str !== "string" || raw.str.trim() === "") continue;
        const m = Util.transform(vp.transform, raw.transform);
        const w = raw.width * vp.scale, h = raw.height * vp.scale;
        const dirLen = Math.hypot(m[0]!, m[1]!) || 1, upLen = Math.hypot(m[2]!, m[3]!) || 1;
        runs.push({
          str: raw.str, h,
          along: [(m[0]! / dirLen) * w / vp.width, (m[1]! / dirLen) * w / vp.height],
          up: [(m[2]! / upLen) * h / vp.width, (m[3]! / upLen) * h / vp.height],
          origin: [m[4]! / vp.width, m[5]! / vp.height],
        });
      }

      // reading order: group runs into lines by baseline height, lines top to bottom, runs left to right
      runs.sort((a, b) => a.origin[1] - b.origin[1]);
      const lines: G[][] = [];
      for (const r of runs) {
        const line = lines[lines.length - 1];
        if (line && Math.abs(r.origin[1] - line[0]!.origin[1]) * vp.height <= Math.max(line[0]!.h, r.h) * 0.5) line.push(r);
        else lines.push([r]);
      }
      for (const [li, line] of lines.entries()) {
        line.sort((a, b) => a.origin[0] - b.origin[0]);
        if (li > 0) text += "\n";
        let prevEnd = -Infinity;
        for (const r of line) {
          const gap = (r.origin[0] - prevEnd) * vp.width;
          if (prevEnd !== -Infinity && gap > r.h * 0.15 && !text.endsWith(" ") && !r.str.startsWith(" ")) text += " ";
          const start = text.length;
          text += r.str;
          spans.push({ text: r.str, normalized_text: normalizeText(r.str), start, end: text.length, origin: r.origin, along: r.along, up: r.up });
          prevEnd = r.origin[0] + r.along[0];
        }
      }

      const hasText = text.trim().length > 0;
      pages.push({
        index: n, label: labels?.[n - 1] ?? null, width: vp.width, height: vp.height, rotation: ((vp.rotation % 360) + 360) % 360,
        text, spans, quality_flags: hasText ? [] : ["no_text_layer"],
      });
      page.cleanup();
    }
    return { page_count: doc.numPages, status: pages.some((p) => p.quality_flags.includes("no_text_layer")) ? "partially_readable" : "readable", pages };
  } finally {
    await task.destroy();
  }
}
