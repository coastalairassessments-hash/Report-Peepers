import { spanBox, type ExtractedDocument, type Span } from "../ingest/extract.js";
import { wordingProblems } from "../integrity.js";
import type { Box, MarkupPlan } from "./plan.js";

export interface VerifyProblem { code: "page_count" | "page_size" | "source_text_changed" | "unplanned_text" | "note_text_mismatch" | "note_covers_text" | "tag_missing" | "summary_content_missing" | "banned_wording"; page?: number; detail: string }
export type VerifyResult = { ok: true } | { ok: false; problems: VerifyProblem[] };

/** Layout allowances: how far rendered text may sit from where the plan put it, and how closely repeated text must line up. Not scientific thresholds. */
const POSITION_TOLERANCE = 0.003;   // normalized; original text must come back where it was
const REGION_ALLOWANCE_PT = 6;      // rendered note and tag text may sit this far outside the planned box
const SIZE_TOLERANCE_PT = 1;

const strip = (s: string) => s.replace(/\s+/g, "");
const center = (b: Box): [number, number] => [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];
const inBox = (p: [number, number], b: Box) => p[0] >= b[0] && p[0] <= b[2] && p[1] >= b[1] && p[1] <= b[3];
const grow = (b: Box, pt: [number, number]): Box => [b[0] - pt[0], b[1] - pt[1], b[2] + pt[0], b[3] + pt[1]];
const overlaps = (a: Box, b: Box) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];

function allStrings(plan: MarkupPlan): string[] {
  const out: string[] = [];
  const walk = (v: unknown) => { if (typeof v === "string") out.push(v); else if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === "object") Object.values(v).forEach(walk); };
  walk(plan.summary); walk(plan.labels); plan.pages.forEach((p) => p.notes.forEach((n) => out.push(n.text))); plan.overflow.forEach((o) => out.push(o.text));
  return out;
}

/**
 * Reads the finished file back with our own extractor and checks it against the source and the plan. The renderer is never
 * trusted: the original text must be unchanged, the notes must be where the plan put them and say what the plan says,
 * nothing unplanned may appear on a report page, and the summary must hold everything the plan holds.
 */
export function verifyMarkup(source: ExtractedDocument, output: ExtractedDocument, plan: MarkupPlan): VerifyResult {
  const problems: VerifyProblem[] = [];
  const add = (code: VerifyProblem["code"], detail: string, page?: number) => problems.push({ code, detail, ...(page !== undefined ? { page } : {}) });

  if (source.page_count !== plan.pages.length) add("page_count", `The plan has ${plan.pages.length} pages; the source has ${source.page_count}.`);
  if (output.page_count < plan.pages.length + 1) add("page_count", `The output has ${output.page_count} pages; expected the report pages plus a summary.`);

  for (const pp of plan.pages) {
    const sp = source.pages[pp.index - 1], op = output.pages[pp.index - 1];
    if (!sp || !op) { add("page_count", `Page ${pp.index} is missing.`, pp.index); continue; }
    if (Math.abs(op.width - pp.width_pt) > SIZE_TOLERANCE_PT || Math.abs(op.height - pp.height_pt) > SIZE_TOLERANCE_PT) add("page_size", `Page ${pp.index} is ${op.width}x${op.height}; expected ${pp.width_pt}x${pp.height_pt}.`, pp.index);

    // 1. Every original run of text comes back, same words, same place.
    const left: Span[] = [...op.spans];
    const matched: Span[] = [];
    let missing = 0;
    for (const s of sp.spans) {
      const i = left.findIndex((o) => o.text === s.text && Math.abs(o.origin[0] - s.origin[0]) <= POSITION_TOLERANCE && Math.abs(o.origin[1] - s.origin[1]) <= POSITION_TOLERANCE);
      if (i < 0) missing++; else matched.push(left.splice(i, 1)[0]!);
    }
    if (missing) add("source_text_changed", `${missing} run(s) of the original text are missing or moved on page ${pp.index}.`, pp.index);

    // 2. Whatever is left must be ours: inside a planned note or tag region.
    const d = plan.style.tag_diameter_pt;
    const allow: [number, number] = [REGION_ALLOWANCE_PT / pp.width_pt, REGION_ALLOWANCE_PT / pp.height_pt];
    const noteRegions = pp.notes.map((n) => ({ n, box: grow(n.box, allow) }));
    const tagRegions = pp.marks.map((m) => {
      const x0 = m.box[0] - (d * 0.8) / pp.width_pt, y0 = m.box[1] - (d * 0.8) / pp.height_pt;
      return { m, box: grow([x0, y0, x0 + d / pp.width_pt, y0 + d / pp.height_pt] as Box, allow) };
    });
    const noteSpans = new Map<number, Span[]>(), tagSpans = new Map<number, Span[]>();
    let stray = 0;
    for (const s of left) {
      const c = center(spanBox(s));
      const ni = noteRegions.findIndex((r) => inBox(c, r.box)), ti = tagRegions.findIndex((r) => inBox(c, r.box));
      if (ni >= 0) noteSpans.set(ni, [...(noteSpans.get(ni) ?? []), s]);
      else if (ti >= 0) tagSpans.set(ti, [...(tagSpans.get(ti) ?? []), s]);
      else stray++;
    }
    if (stray) add("unplanned_text", `${stray} run(s) of text on page ${pp.index} are not part of the original or the plan.`, pp.index);

    // 3. Notes say what the plan says, and do not touch the report's words.
    noteRegions.forEach(({ n }, i) => {
      const spans = (noteSpans.get(i) ?? []).sort((a, b) => spanBox(a)[1] - spanBox(b)[1] || spanBox(a)[0] - spanBox(b)[0]);
      const expected = strip(`${n.number === null ? "" : `${n.number}.`}${n.text}`);
      if (!strip(spans.map((s) => s.text).join("")).includes(expected)) add("note_text_mismatch", `The note${n.number === null ? "" : ` ${n.number}`} on page ${pp.index} does not read as planned.`, pp.index);
      for (const s of spans) if (matched.some((m) => overlaps(spanBox(s), spanBox(m)))) { add("note_covers_text", `A note on page ${pp.index} touches the report's text.`, pp.index); break; }
    });
    tagRegions.forEach(({ m }, i) => { if (!(tagSpans.get(i) ?? []).some((s) => s.text.trim() === String(m.number))) add("tag_missing", `The number ${m.number} is not drawn at its mark on page ${pp.index}.`, pp.index); });
  }

  // 4. The closing pages hold everything the plan holds (checked as words: table cells wrap and interleave when read back).
  const bag = new Map<string, number>();
  const pagesAfter = output.pages.slice(plan.pages.length);
  for (const w of pagesAfter.flatMap((p) => p.text.split(/\s+/)).filter(Boolean)) bag.set(w, (bag.get(w) ?? 0) + 1);
  const need = (s: string) => {
    const t = new Map(bag);
    for (const w of s.split(/\s+/).filter(Boolean)) { const n = t.get(w) ?? 0; if (n <= 0) return false; t.set(w, n - 1); }
    return true;
  };
  const sm = plan.summary;
  const expected = [sm.title, ...sm.leading_questions, ...sm.groups.flatMap((g) => [g.heading, ...g.items.map((i) => i.title)]), ...sm.limits, sm.method_statement, ...plan.overflow.map((o) => o.text), ...(sm.items_to_clarify_statement ? [sm.items_to_clarify_statement] : [])];
  for (const e of expected) if (!need(e)) add("summary_content_missing", `The closing pages do not contain: ${e.slice(0, 60)}`);

  // 5. The same wording rules as the findings, on every string the plan wrote.
  for (const s of allStrings(plan)) { const w = wordingProblems(s); if (w.length) add("banned_wording", `${w.join(", ")} in: ${s.slice(0, 60)}`); }

  return problems.length ? { ok: false, problems } : { ok: true };
}
