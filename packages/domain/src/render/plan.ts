import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Anchor } from "@report-peepers/contracts";
import { spanBox, type ExtractedDocument } from "../ingest/extract.js";
import { verifyAnchor } from "../ingest/anchors.js";
import type { ApprovedView } from "../release.js";

/** [x0, y0, x1, y1], 0 to 1 against the page as displayed, origin top left. */
export type Box = [number, number, number, number];
export type MarkKind = "circle" | "underline" | "bracket";

export interface MarkupConfig {
  note_font_pt: number; note_char_width_em: number; note_line_height_em: number; note_width_pt: number; min_note_width_pt: number;
  note_max_chars: number; note_pad_pt: number; edge_inset_pt: number; obstacle_pad_pt: number; tag_diameter_pt: number;
  mark_pad_pt: number; mark_pad_step_pt: number; search_step_pt: number; max_shift_pt: number; leading_questions_max: number; review_questions_max: number;
  default_mark: MarkKind; mark_by_finding_type: Record<string, MarkKind>;
  labels: Record<"summary_title" | "questions_heading" | "material_heading" | "contextual_heading" | "supported_heading" | "limits_heading" | "nothing_to_clarify" | "notes_sheet_title" | "page_one_pointer" | "page_level_suffix" | "column_number" | "column_item" | "column_page" | "column_strength" | "column_next" | "done_well_heading" | "review_questions_heading" | "not_expected_heading" | "not_checked_heading" | "questions_left_out", string>;
}

/** Layout and wording defaults live in data/rules/markup.json, never in logic. */
export function loadMarkupConfig(path = resolve(import.meta.dirname, "../../../../data/rules/markup.json")): MarkupConfig {
  const raw = JSON.parse(readFileSync(path, "utf8")) as MarkupConfig;
  for (const k of ["note_font_pt", "note_char_width_em", "note_line_height_em", "note_width_pt", "min_note_width_pt", "note_max_chars", "note_pad_pt", "edge_inset_pt", "obstacle_pad_pt", "mark_pad_pt", "mark_pad_step_pt", "search_step_pt", "max_shift_pt", "leading_questions_max", "review_questions_max"] as const) {
    if (typeof raw[k] !== "number" || !(raw[k] >= 0)) throw new Error(`markup.json: ${k} must be a number of zero or more.`);
  }
  if (raw.search_step_pt <= 0) throw new Error("markup.json: search_step_pt must be above zero.");
  for (const m of [raw.default_mark, ...Object.values(raw.mark_by_finding_type)]) if (!["circle", "underline", "bracket"].includes(m)) throw new Error(`markup.json: unknown mark "${m}".`);
  return raw;
}

/** What the report does well, more questions to ask, what the stated limits explain, and what could not be checked. Plain strings. */
export interface ReviewPages { done_well: string[]; questions: string[]; not_expected: string[]; not_checked: string[]; questions_note?: string }

export interface PlanMark { number: number; finding_id: string; kind: MarkKind; box: Box }
/** `number` is null for the page-one pointer. `page_level` marks a note about a whole page (no words to mark). */
export interface PlanNote { number: number | null; finding_id: string | null; text: string; box: Box; page_level?: true }
export interface PlanPage { index: number; width_pt: number; height_pt: number; marks: PlanMark[]; notes: PlanNote[] }
export interface PlanOverflow { finding_id: string; number: number; page: number | null; text: string }
export interface PlanIssue { finding_id: string; code: "page_level_only" | "anchor_not_verified" | "anchor_other_document" | "no_location" | "note_overflow" | "pointer_not_placed"; detail: string }
export interface SummaryItem { number: number; title: string; page: number | null; label: string | null; strength: string; next_step: string | null }
export interface MarkupPlan {
  document_version_id: string;
  pages: PlanPage[];
  overflow: PlanOverflow[];
  issues: PlanIssue[];
  summary_page_number: number;
  /** What the drawing step needs, carried in the plan so the template holds no numbers of its own. */
  style: { note_font_pt: number; note_line_height_em: number; note_pad_pt: number; tag_diameter_pt: number };
  labels: MarkupConfig["labels"];
  summary: {
    title: string; leading_questions: string[];
    groups: { heading: string; items: SummaryItem[] }[];
    limits: string[]; items_to_clarify_statement: string | null; method_statement: string;
    /** ADR-006: the review pages. Absent when no inspection review ran. */
    review?: ReviewPages;
  };
}

type F = ApprovedView["findings"][number];
type Pt = [number, number, number, number];
const inter = (a: Pt, b: Pt) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];

interface Located { f: F; marked: { anchor: Anchor; box: Box }[]; pageLevel: Anchor[]; primaryPage: number | null; sortY: number; sortX: number; label: string | null }

/** Lines needed for the text at this width, with whole words only. Infinity when one word is wider than the line. */
function lineCount(text: string, widthPt: number, c: MarkupConfig): number {
  const per = c.note_font_pt * c.note_char_width_em, cap = Math.floor((widthPt - 2 * c.note_pad_pt) / per);
  let lines = 1, used = 0;
  for (const w of text.split(/\s+/).filter(Boolean)) {
    if (w.length > cap) return Infinity;
    if (used === 0) used = w.length;
    else if (used + 1 + w.length <= cap) used += 1 + w.length;
    else { lines++; used = w.length; }
  }
  return lines;
}

/** Where a note can go: next to its target, clear of all text and of notes already placed. Deterministic. Null when nothing fits. */
function placeNote(text: string, targetCx: number, targetCy: number, W: number, H: number, obstacles: Pt[], c: MarkupConfig): Pt | null {
  const widths: number[] = [];
  for (let w = c.note_width_pt; w > c.min_note_width_pt; w -= 16) widths.push(w);
  widths.push(c.min_note_width_pt);
  const shifts = [0];
  for (let s = c.search_step_pt; s <= c.max_shift_pt; s += c.search_step_pt) shifts.push(s, -s);
  const sides: ("left" | "right")[] = targetCx < W / 2 ? ["left", "right"] : ["right", "left"];
  for (const shift of shifts) for (const side of sides) for (const w of widths) {
    const lines = lineCount(text, w, c);
    if (!isFinite(lines)) continue;
    const h = lines * c.note_font_pt * c.note_line_height_em + 2 * c.note_pad_pt;
    const x0 = side === "right" ? W - c.edge_inset_pt - w : c.edge_inset_pt;
    const y0 = targetCy - h / 2 + shift;
    const box: Pt = [x0, y0, x0 + w, y0 + h];
    if (y0 < c.edge_inset_pt || box[3] > H - c.edge_inset_pt) continue;
    if (obstacles.some((o) => inter(box, o))) continue;
    return box;
  }
  return null;
}

/**
 * Turns the approved view and the extracted report into a plan for drawing. Pure and deterministic: the same inputs give the same plan.
 * Only anchors that verify against the document are marked. Notes never cover the report's text. What cannot be placed
 * is listed (overflow, issues), never forced.
 */
/** Keeps the first N questions (the caller orders them, most important first) and says how many were left out. */
function capQuestions(review: ReviewPages, cfg: MarkupConfig): ReviewPages {
  const r = structuredClone(review); const max = cfg.review_questions_max;
  if (r.questions.length > max) { const n = r.questions.length - max; r.questions = r.questions.slice(0, max); r.questions_note = cfg.labels.questions_left_out.replace("{shown}", String(max)).replace("{n}", String(n)); }
  return r;
}

export function planMarkup(view: ApprovedView, doc: ExtractedDocument, documentVersionId: string, cfg: MarkupConfig, review?: ReviewPages): MarkupPlan {
  const issues: PlanIssue[] = [];
  const pageOf = (i: number) => doc.pages[i - 1]!;

  // 1. Decide, for each finding, which anchors can be drawn on.
  const located: Located[] = view.findings.map((f) => {
    const marked: Located["marked"] = [], pageLevel: Anchor[] = [];
    for (const s of f.sources) {
      const a = s.anchor;
      if (a.document_version_id !== documentVersionId) { issues.push({ finding_id: f.id, code: "anchor_other_document", detail: `Source points at ${a.document_version_id}, not this report.` }); continue; }
      if (a.exact_text === null) {
        const v = verifyAnchor(doc, a, { requireBox: false });
        if (v.ok) pageLevel.push(a); else issues.push({ finding_id: f.id, code: "anchor_not_verified", detail: v.reason });
        continue;
      }
      const v = verifyAnchor(doc, a);
      if (v.ok && a.bbox_normalized) marked.push({ anchor: a, box: [...a.bbox_normalized] as Box });
      else issues.push({ finding_id: f.id, code: "anchor_not_verified", detail: v.ok ? "box_missing" : v.reason });
    }
    marked.sort((p, q) => p.anchor.pdf_page_index_1based! - q.anchor.pdf_page_index_1based! || p.box[1] - q.box[1] || p.box[0] - q.box[0]);
    const first = marked[0], pl = pageLevel[0];
    if (!first && !pl) issues.push({ finding_id: f.id, code: "no_location", detail: "No part of the report could be marked for this item; it appears on the summary page only." });
    if (!first && pl) issues.push({ finding_id: f.id, code: "page_level_only", detail: `Page ${pl.pdf_page_index_1based} has no readable words to mark.` });
    const primary = first?.anchor ?? pl ?? null;
    return { f, marked, pageLevel, primaryPage: primary?.pdf_page_index_1based ?? null, sortY: first ? first.box[1] : 0, sortX: first ? first.box[0] : 0, label: primary?.printed_page_label ?? null };
  });

  // 2. Number by page, then position, then id. Items with no location come last.
  const order = [...located].sort((a, b) => (a.primaryPage === null ? 1 : 0) - (b.primaryPage === null ? 1 : 0)
    || (a.primaryPage ?? 0) - (b.primaryPage ?? 0) || a.sortY - b.sortY || a.sortX - b.sortX || (a.f.id < b.f.id ? -1 : a.f.id > b.f.id ? 1 : 0));
  const numberOf = new Map(order.map((l, i) => [l.f.id, i + 1]));

  // 3. Pages and marks. Findings on the same words get different padding so their marks stay apart.
  const pages: PlanPage[] = doc.pages.map((p) => ({ index: p.index, width_pt: p.width, height_pt: p.height, marks: [], notes: [] }));
  const seen = new Map<string, number>();
  for (const l of order) {
    const n = numberOf.get(l.f.id)!;
    const kind = cfg.mark_by_finding_type[l.f.finding_type] ?? cfg.default_mark;
    for (const m of l.marked) {
      const pg = pageOf(m.anchor.pdf_page_index_1based!), key = `${pg.index}:${m.box.map((v) => v.toFixed(3)).join(",")}`;
      const k = seen.get(key) ?? 0; seen.set(key, k + 1);
      const pad = cfg.mark_pad_pt + k * cfg.mark_pad_step_pt, px = pad / pg.width, py = pad / pg.height;
      const clamp = (v: number) => Math.min(1, Math.max(0, v));
      pages[pg.index - 1]!.marks.push({ number: n, finding_id: l.f.id, kind, box: [clamp(m.box[0] - px), clamp(m.box[1] - py), clamp(m.box[2] + px), clamp(m.box[3] + py)] });
    }
  }

  // 4. Notes. Text is the first question, else the title. Long text, or no free margin, goes to the notes sheet in full.
  const obstacles = new Map<number, Pt[]>();
  for (const p of doc.pages) obstacles.set(p.index, p.spans.map((s) => { const b = spanBox(s), d = cfg.obstacle_pad_pt; return [b[0] * p.width - d, b[1] * p.height - d, b[2] * p.width + d, b[3] * p.height + d] as Pt; }));
  const toNorm = (b: Pt, p: { width: number; height: number }): Box => [b[0] / p.width, b[1] / p.height, b[2] / p.width, b[3] / p.height];
  const overflow: PlanOverflow[] = [];

  const summaryPageNumber = doc.page_count + 1;
  const hasQuestions = view.leading_questions.length > 0 || view.findings.some((f) => f.questions.length > 0);
  if (hasQuestions && doc.pages[0]) {
    const p = doc.pages[0], text = cfg.labels.page_one_pointer.replace("{n}", String(summaryPageNumber));
    const box = placeNote(text, p.width / 2, cfg.edge_inset_pt, p.width, p.height, obstacles.get(1)!, cfg);
    if (box) { pages[0]!.notes.push({ number: null, finding_id: null, text, box: toNorm(box, p) }); obstacles.get(1)!.push(box); }
    else issues.push({ finding_id: "", code: "pointer_not_placed", detail: "Page 1 has no free margin for the pointer to the summary page." });
  }

  for (const l of order) {
    const n = numberOf.get(l.f.id)!, shortText = l.f.questions[0] ?? l.f.title;
    const full = [l.f.title, l.f.explanation, ...l.f.questions].join(" ");
    const spill = (why: string) => { overflow.push({ finding_id: l.f.id, number: n, page: l.primaryPage, text: full }); issues.push({ finding_id: l.f.id, code: "note_overflow", detail: why }); };
    if (l.primaryPage === null) { overflow.push({ finding_id: l.f.id, number: n, page: null, text: full }); continue; }
    const pg = pageOf(l.primaryPage), pageLevel = l.marked.length === 0;
    const text = pageLevel ? `${shortText} ${cfg.labels.page_level_suffix}` : shortText;
    if (text.length > cfg.note_max_chars) { spill("The note is too long for the margin."); continue; }
    const target = l.marked[0]?.box;
    const cx = target ? ((target[0] + target[2]) / 2) * pg.width : pg.width / 2, cy = target ? ((target[1] + target[3]) / 2) * pg.height : cfg.edge_inset_pt;
    const box = placeNote(`${n}. ${text}`, cx, cy, pg.width, pg.height, obstacles.get(pg.index)!, cfg);
    if (!box) { spill("No free margin near the marked words."); continue; }
    obstacles.get(pg.index)!.push(box);
    pages[pg.index - 1]!.notes.push({ number: n, finding_id: l.f.id, text, box: toNorm(box, pg), ...(pageLevel ? { page_level: true as const } : {}) });
  }

  // 5. The summary page.
  const item = (l: Located): SummaryItem => ({ number: numberOf.get(l.f.id)!, title: l.f.title, page: l.primaryPage, label: l.label, strength: l.f.evidence_strength, next_step: l.f.possible_next_steps[0] ?? null });
  const byNumber = (a: Located, b: Located) => numberOf.get(a.f.id)! - numberOf.get(b.f.id)!;
  const supported = located.filter((l) => l.f.finding_type === "supported_reasoning").sort(byNumber);
  const material = located.filter((l) => l.f.finding_type !== "supported_reasoning" && l.f.decision_relevance === "material").sort(byNumber);
  const contextual = located.filter((l) => l.f.finding_type !== "supported_reasoning" && l.f.decision_relevance !== "material").sort(byNumber);
  const groups = [[cfg.labels.material_heading, material], [cfg.labels.contextual_heading, contextual], [cfg.labels.supported_heading, supported]] as const;

  return {
    document_version_id: documentVersionId, pages, overflow, issues, summary_page_number: summaryPageNumber,
    style: { note_font_pt: cfg.note_font_pt, note_line_height_em: cfg.note_line_height_em, note_pad_pt: cfg.note_pad_pt, tag_diameter_pt: cfg.tag_diameter_pt },
    labels: cfg.labels,
    summary: {
      title: cfg.labels.summary_title,
      leading_questions: view.leading_questions.slice(0, cfg.leading_questions_max),
      groups: groups.filter(([, ls]) => ls.length > 0).map(([heading, ls]) => ({ heading, items: ls.map(item) })),
      limits: [...view.coverage_limitations],
      items_to_clarify_statement: view.findings.length === 0 && !(review && review.questions.length > 0) ? cfg.labels.nothing_to_clarify : null,
      method_statement: view.method.statement,
      ...(review && (review.done_well.length || review.questions.length || review.not_expected.length || review.not_checked.length) ? { review: capQuestions(review, cfg) } : {}),
    },
  };
}
