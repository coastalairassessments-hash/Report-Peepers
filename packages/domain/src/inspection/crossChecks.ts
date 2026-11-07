import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ExtractedDocument } from "../ingest/extract.js";
import { materialsIn, type Contradiction, type SelfConsistencyConfig } from "./selfConsistency.js";

interface Raw {
  count_claims: { name: string; claim: string; counted: string }[]; confirmed: string; needs_lab: string; rating_word: string; rating_rule: string;
  equipment_header: string; instruments: Record<string, string>; instrument_use: string; limit_sentence: string; standards: string[]; edition_or_section: string;
}
export interface CrossChecksConfig {
  countClaims: { name: string; claim: RegExp; counted: RegExp }[]; confirmed: RegExp; needsLab: RegExp; ratingWord: RegExp; ratingRule: RegExp;
  equipmentHeader: RegExp; instruments: [string, RegExp][]; instrumentUse: RegExp; limitSentence: RegExp; standards: RegExp[]; editionOrSection: RegExp;
}

export function loadCrossChecksConfig(path = resolve(import.meta.dirname, "../../../../data/rules/cross_checks.json")): CrossChecksConfig {
  const r = JSON.parse(readFileSync(path, "utf8")) as Raw;
  try {
    return {
      countClaims: r.count_claims.map((c) => ({ name: c.name, claim: new RegExp(c.claim, "i"), counted: new RegExp(c.counted, "i") })),
      confirmed: new RegExp(r.confirmed, "i"), needsLab: new RegExp(r.needs_lab, "i"), ratingWord: new RegExp(r.rating_word, "i"), ratingRule: new RegExp(r.rating_rule, "i"),
      equipmentHeader: new RegExp(r.equipment_header, "i"), instruments: Object.entries(r.instruments).map(([k, v]) => [k, new RegExp(v, "i")] as [string, RegExp]),
      instrumentUse: new RegExp(r.instrument_use, "i"), limitSentence: new RegExp(r.limit_sentence, "i"), standards: r.standards.map((s) => new RegExp(s, "i")), editionOrSection: new RegExp(r.edition_or_section, "i"),
    };
  } catch (e) { throw new Error(`cross_checks.json: bad pattern: ${e instanceof Error ? e.message : e}`); }
}

interface Line { page: number; text: string }
const clip = (s: string): string => (s.length > 300 ? `${s.slice(0, 297)}...` : s);
const ROOM = /^\s*([A-Z][A-Z'’ ]{3,}?)\s*(?:\([^)]*\))?\s+-\s+/;
const roomOf = (t: string): string | null => { const m = ROOM.exec(t); return m ? m[1]!.replace(/\s+/g, " ").trim() : null; };
const HEADING = /^[A-Z][A-Z &/]{5,}$/;

/**
 * More ways the report can disagree with itself. Each check needs two located passages that fit together
 * (same room or material, or one sentence); otherwise it stays silent. Nothing here judges the work: it only pairs quotes.
 */
export function checkCrossChecks(doc: ExtractedDocument, c: CrossChecksConfig, mat: SelfConsistencyConfig): Contradiction[] {
  const out: Contradiction[] = [];
  const lines: Line[] = doc.pages.flatMap((p) => p.text.split("\n").map((t) => ({ page: p.index, text: t.trim() })).filter((l) => l.text));
  const q = (l: Line, role: "report_says" | "but_also_says") => ({ page: l.page, text: clip(l.text), role });

  // 1. A count stated in the report against the sections actually found.
  for (const cc of c.countClaims) {
    const counted = lines.filter((l) => cc.counted.test(l.text));
    const claim = lines.find((l) => !cc.counted.test(l.text) && cc.claim.test(l.text));
    if (!claim || counted.length === 0) continue;
    const n = Number(cc.claim.exec(claim.text)![1]);
    if (n !== counted.length) out.push({ check: "cover_count_vs_sections", item_topics: ["Summary matches the body"], quotes: [q(claim, "report_says"), q(counted[0]!, "but_also_says")], detail: `The report states ${n} ${cc.name}; ${counted.length} sections were found.` });
  }

  // 2. "Confirmed" and "needs a lab" for the same spot.
  const conf = lines.filter((l) => c.confirmed.test(l.text) && !c.needsLab.test(l.text)), need = lines.filter((l) => c.needsLab.test(l.text));
  const seen2 = new Set<string>();
  for (const a of conf) for (const b of need) {
    const ma = materialsIn(a.text, mat), mb = materialsIn(b.text, mat), shared = ma.some((x) => mb.includes(x));
    const ra = roomOf(a.text), rb = roomOf(b.text);
    const fits = shared || (ra !== null && ra === rb && (ma.length === 0 || mb.length === 0));
    const key = `${a.text}|${b.text}`;
    if (fits && !seen2.has(key)) { seen2.add(key); out.push({ check: "confirmed_vs_needs_lab", item_topics: ["Conclusion matches the data"], quotes: [q(a, "report_says"), q(b, "but_also_says")], detail: "One line says confirmed; another line about the same place says a laboratory result is still needed." }); }
  }

  // 3. A rating whose rule needs a number, on a row with no number.
  const rule = lines.find((l) => c.ratingRule.test(l.text));
  if (rule) {
    for (const l of lines) {
      if (l === rule || !ROOM.test(l.text) || /\d/.test(l.text) || !new RegExp(`${c.ratingWord.source}(?:\\s+Levels?)?\\s*$`, "i").test(l.text)) continue;
      if (materialsIn(l.text, mat).length === 0 || mat.narrativeMarkers.some((m) => l.text.toLowerCase().includes(m))) continue;
      out.push({ check: "rating_without_reading", item_topics: ["Numbers and units checked"], quotes: [q(rule, "report_says"), q(l, "but_also_says")], detail: "The report's rule for the rating is a number, and this row shows a rating without one." });
    }
  }

  // 4. Instrument used but absent from the report's own equipment list (needs a list to compare against).
  const h = lines.findIndex((l) => c.equipmentHeader.test(l.text));
  if (h >= 0) {
    let end = h + 1; while (end < lines.length && end - h <= 15 && lines[end]!.page === lines[h]!.page && !HEADING.test(lines[end]!.text) && !c.instrumentUse.test(lines[end]!.text) && !ROOM.test(lines[end]!.text)) end++;
    const listed = lines.slice(h + 1, end).map((l) => l.text).join("\n");
    for (const [name, re] of c.instruments) {
      if (re.test(listed)) continue;
      const use = lines.find((l, i) => (i < h || i >= end) && re.test(l.text) && c.instrumentUse.test(l.text));
      if (use) out.push({ check: "instrument_not_listed", item_topics: ["Instruments identified"], quotes: [q(lines[h]!, "report_says"), q(use, "but_also_says")], detail: `The ${name} is used in the findings and is not in the report's equipment list.` });
    }
  }

  // 5. A number set against its own stated limit in one sentence.
  for (const l of lines) {
    const m = c.limitSentence.exec(l.text); if (!m) continue;
    const a = Number(m[1]), rel = m[2]!.toLowerCase(), b = Number(m[3]);
    const wantsLower = /^(below|under|less than|within)$/.test(rel);
    if (wantsLower ? a > b : a <= b) out.push({ check: "number_vs_standard", item_topics: ["Numbers and units checked"], quotes: [q(l, "report_says")], detail: `The sentence puts ${a}% ${rel} ${b}%.` });
  }

  // 6. A named standard with no edition or section anywhere in the report.
  const doneStd = new Set<string>();
  for (const re of c.standards) {
    const hits = lines.filter((l) => re.test(l.text));
    if (hits.length === 0 || hits.some((l) => c.editionOrSection.test(l.text))) continue;
    const key = re.exec(hits[0]!.text)![0]!.toLowerCase(); if (doneStd.has(key)) continue; doneStd.add(key);
    out.push({ check: "citation_without_edition", item_topics: ["Standards cited"], quotes: [q(hits[0]!, "report_says")], detail: `${re.exec(hits[0]!.text)![0]} is named without an edition or section.` });
  }
  return out;
}
