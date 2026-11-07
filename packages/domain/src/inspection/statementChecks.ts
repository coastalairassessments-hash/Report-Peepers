import type { ExtractedDocument } from "../ingest/extract.js";
import type { Contradiction, SelfConsistencyConfig } from "./selfConsistency.js";

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
/** Reads "July 25, 2025", "07-27-25" or "7/27/2025" into YYYY-MM-DD. Anything else is not a date we will compare. */
export function parseDate(raw: string): string | null {
  const t = raw.trim();
  let m = /^([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})/.exec(t);
  if (m) { const mi = MONTHS.indexOf(m[1]!.slice(0, 3).toLowerCase()); if (mi >= 0) return `${m[3]}-${String(mi + 1).padStart(2, "0")}-${m[2]!.padStart(2, "0")}`; }
  m = /^(\d{1,2})[-/](\d{1,2})[-/](\d{2}|\d{4})/.exec(t);
  if (m) { const y = m[3]!.length === 2 ? `20${m[3]}` : m[3]!; return `${y}-${m[1]!.padStart(2, "0")}-${m[2]!.padStart(2, "0")}`; }
  return null;
}
const labKey = (s: string): string => s.toLowerCase().replace(/[.,]/g, " ").replace(/\b(inc|llc|ltd|corp|co|laboratory|laboratories|labs?)\b/g, " ").replace(/[^a-z0-9]+/g, " ").trim();
const lineAt = (text: string, index: number): string => { const a = text.lastIndexOf("\n", index) + 1; const b = text.indexOf("\n", index); return text.slice(a, b < 0 ? undefined : b).trim(); };

/**
 * Checks that compare two statements inside the same report: a sampling date against the inspection date, two different lab names,
 * terms that are defined and never applied, and two different time spans for the same step. Each result quotes both sides with pages.
 * Silent whenever one side is missing. Nothing here judges the work; it only shows two statements that do not match.
 */
export function checkStatements(doc: ExtractedDocument, c: SelfConsistencyConfig): Contradiction[] {
  const out: Contradiction[] = [];

  // Dates.
  const first = (res: RegExp[]) => { for (const p of doc.pages) for (const re of res) { const m = re.exec(p.text); if (m) { const d = parseDate(m[1]!); if (d) return { d, page: p.index, text: lineAt(p.text, m.index) }; } } return null; };
  const insp = first(c.inspectionDates), samp = first(c.sampleDates);
  if (insp && samp && insp.d !== samp.d) out.push({ check: "dates_disagree", item_topics: ["Numbers and units checked"], quotes: [{ page: insp.page, text: insp.text, role: "report_says" }, { page: samp.page, text: samp.text, role: "but_also_says" }], detail: `The inspection date is ${insp.d} and the sampling date is ${samp.d}.` });

  // A pointer to an attached lab report when no page in the file looks like one. Silent if any page could not be read.
  const unread = doc.pages.some((p) => p.quality_flags.some((f) => f === "ocr_failed" || f === "ocr_skipped_page_limit" || f === "low_ocr_confidence" || f === "ocr_numbers_unconfirmed"));
  if (!unread && c.attachmentRefs.length && !doc.pages.some((p) => c.labMarkers.some((re) => re.test(p.text)))) {
    for (const p of doc.pages) {
      const re = c.attachmentRefs.find((r) => r.test(p.text));
      if (!re) continue;
      const m = re.exec(p.text)!;
      out.push({ check: "referenced_not_supplied", item_topics: ["Original lab report"], quotes: [{ page: p.index, text: lineAt(p.text, m.index), role: "report_says" }], detail: "The report points to an attached lab report, but no page in the file looks like one." });
      break;
    }
  }

  // Lab names.
  const labs = new Map<string, { page: number; text: string }>();
  for (const p of doc.pages) for (const re of c.labNames) { const g = new RegExp(re.source, "gi"); for (let m = g.exec(p.text); m; m = g.exec(p.text)) { const k = labKey(m[1]!); if (k && !labs.has(k)) labs.set(k, { page: p.index, text: lineAt(p.text, m.index) }); } }
  if (labs.size >= 2) { const [a, b] = [...labs.values()]; out.push({ check: "two_lab_names", item_topics: ["Lab accreditation"], quotes: [{ page: a!.page, text: a!.text, role: "report_says" }, { page: b!.page, text: b!.text, role: "but_also_says" }], detail: `The report names ${labs.size} different laboratories.` }); }

  // Defined and never applied.
  for (const t of c.definedTerms) {
    let defs = 0, uses = 0, firstDef: { page: number; text: string } | null = null;
    for (const p of doc.pages) {
      let pageDefs = 0, pageUses = 0;
      for (const line of p.text.split("\n")) {
        const n = (line.match(t.anyUse) ?? []).length;
        if (n === 0) continue;
        if (t.definition.test(line)) { pageDefs++; firstDef ??= { page: p.index, text: line.trim() }; }
        else if (n === 1) pageUses++; // a line listing several terms at once is an introduction, not an application
      }
      defs += pageDefs;
      if (pageDefs === 0) uses += pageUses; // wrapped lines of a definition sit on the definition's page and are not applications
    }
    if (defs >= 2 && uses === 0 && firstDef) out.push({ check: "defined_never_used", item_topics: ["Conclusion matches the data"], quotes: [{ page: firstDef.page, text: firstDef.text, role: "report_says" }], detail: `${t.name} are defined in the report and never applied to any area.` });
  }

  // Two time spans for the same step.
  for (const t of c.timeSpanTopics) {
    const spans = new Map<string, { page: number; text: string }>();
    for (const p of doc.pages) for (const s of p.text.replace(/\s+/g, " ").split(/(?<=\.)\s+/)) {
      if (!t.step.test(s) || !t.context.test(s)) continue;
      const m = c.timeSpan.exec(s); if (!m) continue;
      const k = `${m[1]}-${m[2]}`; if (!spans.has(k)) spans.set(k, { page: p.index, text: s.trim() });
    }
    if (spans.size >= 2) { const [a, b] = [...spans.entries()]; out.push({ check: "time_spans_differ", item_topics: ["Clearance criteria in advance"], quotes: [{ page: a![1].page, text: a![1].text, role: "report_says" }, { page: b![1].page, text: b![1].text, role: "but_also_says" }], detail: `Two different time spans (${a![0]} and ${b![0]} hours) are given for ${t.name}.` }); }
  }
  return out;
}
