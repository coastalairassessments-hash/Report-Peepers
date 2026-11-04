import type { Anchor } from "@report-peepers/contracts";
import { normalizeText, quadBox, type ExtractedDocument, type ExtractedPage } from "./extract.js";

type Box = [number, number, number, number];

/**
 * Layout allowances for "is this box on those words". They absorb font-metric differences only.
 * They are not scientific thresholds (decision D07 does not apply).
 */
const MIN_OVERLAP_OF_WORDS = 0.5;   // at least this share of the words' box must lie inside the anchor box
const MAX_BOX_SIZE_RATIO = 2;       // the anchor box may not be more than this many times the words' box

/* ---------- matching ---------- */

/** A normalized copy of a page's text, with every normalized character mapped back to the raw text. */
function buildNorm(text: string, dehyphenate: boolean): { norm: string; start: number[]; end: number[] } {
  const out: string[] = [], start: number[] = [], end: number[] = [];
  let lastSpace = true;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    // a hyphen ending a line between two letters is dropped (and the line break with it)
    if (dehyphenate && c === "-" && text[i + 1] === "\n" && /[A-Za-z]/.test(text[i - 1] ?? "") && /[A-Za-z]/.test(text[i + 2] ?? "")) { i += 1; continue; }
    if (/\s/.test(c)) {
      if (!lastSpace) { out.push(" "); start.push(i); end.push(i + 1); lastSpace = true; }
      else if (end.length) end[end.length - 1] = i + 1;
      continue;
    }
    const folded = normalizeText(c);
    if (folded === "" ) continue; // soft hyphen
    for (const ch of folded) { out.push(ch); start.push(i); end.push(i + 1); }
    lastSpace = false;
  }
  return { norm: out.join(""), start, end };
}

interface Match { rawStart: number; rawEnd: number; hyphenated: boolean }

/** Every place the (already normalized) phrase occurs on a page. Case-sensitive: the words must be the page's own. */
function locate(page: ExtractedPage, q: string): Match[] {
  if (!q || page.quality_flags.includes("no_text_layer")) return [];
  const found = new Map<number, Match>();
  for (const dehyphenate of [false, true]) {
    const { norm, start, end } = buildNorm(page.text, dehyphenate);
    let from = 0;
    for (;;) {
      const at = norm.indexOf(q, from);
      if (at < 0) break;
      const rawStart = start[at]!, rawEnd = end[at + q.length - 1]!;
      const slice = page.text.slice(rawStart, rawEnd);
      if (!found.has(rawStart)) found.set(rawStart, { rawStart, rawEnd, hyphenated: dehyphenate && /-\n/.test(slice) });
      from = at + q.length;
    }
  }
  return [...found.values()].sort((a, b) => a.rawStart - b.rawStart);
}

/** Box around a match: the part of each text run the match covers, joined. */
function matchBox(page: ExtractedPage, m: Match): Box {
  let box: Box | null = null;
  for (const s of page.spans) {
    if (s.end <= m.rawStart || s.start >= m.rawEnd) continue;
    const len = s.end - s.start;
    const a = (Math.max(s.start, m.rawStart) - s.start) / len, b = (Math.min(s.end, m.rawEnd) - s.start) / len;
    const q = quadBox(s.origin, s.along, s.up, a, b);
    box = box ? [Math.min(box[0], q[0]), Math.min(box[1], q[1]), Math.max(box[2], q[2]), Math.max(box[3], q[3])] : q;
  }
  return box ?? [0, 0, 0, 0];
}

const area = (b: readonly number[]) => Math.max(0, b[2]! - b[0]!) * Math.max(0, b[3]! - b[1]!);
function boxFits(anchor: readonly number[], words: Box): boolean {
  const ix = Math.max(0, Math.min(anchor[2]!, words[2]) - Math.max(anchor[0]!, words[0]));
  const iy = Math.max(0, Math.min(anchor[3]!, words[3]) - Math.max(anchor[1]!, words[1]));
  const w = area(words);
  return w > 0 && (ix * iy) / w >= MIN_OVERLAP_OF_WORDS && area(anchor) <= w * MAX_BOX_SIZE_RATIO;
}

/* ---------- building anchors ---------- */

function toAnchor(page: ExtractedPage, documentVersionId: string, m: Match): Anchor {
  const exact = page.text.slice(m.rawStart, m.rawEnd);
  const flags: string[] = [];
  if (exact.includes("\n")) flags.push("split_across_lines");
  if (m.hyphenated) flags.push("hyphenated_line_break");
  return {
    document_version_id: documentVersionId, pdf_page_index_1based: page.index, printed_page_label: page.label, paragraph_or_table_anchor: null,
    bbox_normalized: matchBox(page, m), exact_text: exact, extraction_method: "native_text", quality_flags: flags,
  };
}

export type FindResult =
  | { status: "found"; anchor: Anchor }
  | { status: "multiple_matches"; candidates: Anchor[] }
  | { status: "not_found" };

/**
 * Finds a phrase on the page text and builds its anchor. More than one place is reported as such and never resolved
 * by taking the first. Nothing is found on a page with no text layer, and nothing is invented there.
 */
export function findAnchor(doc: ExtractedDocument, documentVersionId: string, phrase: string, opts: { page?: number } = {}): FindResult {
  const q = normalizeText(phrase);
  if (!q) return { status: "not_found" };
  const pages = opts.page === undefined ? doc.pages : doc.pages.filter((p) => p.index === opts.page);
  const candidates = pages.flatMap((p) => locate(p, q).map((m) => toAnchor(p, documentVersionId, m)));
  if (candidates.length === 0) return { status: "not_found" };
  return candidates.length === 1 ? { status: "found", anchor: candidates[0]! } : { status: "multiple_matches", candidates };
}

/** Points at a page without claiming any words on it. The right anchor for a scanned page. */
export function pageOnlyAnchor(doc: ExtractedDocument, documentVersionId: string, pageIndex: number): Anchor {
  const page = doc.pages[pageIndex - 1];
  if (!page) throw new Error(`The document has no page ${pageIndex}.`);
  return {
    document_version_id: documentVersionId, pdf_page_index_1based: page.index, printed_page_label: page.label, paragraph_or_table_anchor: null,
    bbox_normalized: null, exact_text: null, extraction_method: "native_text", quality_flags: [...page.quality_flags],
  };
}

/* ---------- proving an anchor ---------- */

export type VerifyResult =
  | { ok: true }
  | { ok: false; reason: "no_such_page" | "wrong_page" | "text_not_on_page" | "text_not_exact" | "text_not_in_box" | "box_missing" | "page_has_no_text" };

/**
 * Proves an anchor against the document it names, whoever proposed it. The words must be the page's own exact words,
 * on that page, inside that box. A failed anchor is never repaired by guessing.
 */
export function verifyAnchor(doc: ExtractedDocument, a: Anchor, opts: { requireBox?: boolean } = {}): VerifyResult {
  const requireBox = opts.requireBox ?? true;
  const idx = a.pdf_page_index_1based;
  const page = idx === null ? undefined : doc.pages[idx - 1];
  if (!page) return { ok: false, reason: "no_such_page" };
  const noText = page.quality_flags.includes("no_text_layer");

  if (a.exact_text === null) return a.bbox_normalized !== null && noText ? { ok: false, reason: "page_has_no_text" } : { ok: true }; // page-only
  if (noText) return { ok: false, reason: "page_has_no_text" };
  if (a.bbox_normalized === null && requireBox) return { ok: false, reason: "box_missing" };

  const q = normalizeText(a.exact_text);
  const matches = locate(page, q);
  if (matches.length === 0) return { ok: false, reason: doc.pages.some((p) => p !== page && locate(p, q).length > 0) ? "wrong_page" : "text_not_on_page" };
  const exact = matches.filter((m) => page.text.slice(m.rawStart, m.rawEnd) === a.exact_text);
  if (exact.length === 0) return { ok: false, reason: "text_not_exact" };
  if (a.bbox_normalized === null) return { ok: true }; // words proven; a box was not required
  return exact.some((m) => boxFits(a.bbox_normalized!, matchBox(page, m))) ? { ok: true } : { ok: false, reason: "text_not_in_box" };
}
