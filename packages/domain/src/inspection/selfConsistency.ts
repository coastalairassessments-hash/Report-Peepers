import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ExtractedDocument } from "../ingest/extract.js";

interface Raw { threshold_statement_patterns: string[]; row_result_pattern: string; baseline_word: string; materials: Record<string, string>; narrative_markers: string[]; narrative_claim_pattern: string }
export interface SelfConsistencyConfig {
  thresholds: RegExp[]; rowResult: RegExp; baselineWord: string; materials: [string, RegExp][]; narrativeMarkers: string[]; narrativeClaim: RegExp;
}

export function loadSelfConsistencyConfig(path = resolve(import.meta.dirname, "../../../../data/rules/self_consistency.json")): SelfConsistencyConfig {
  const r = JSON.parse(readFileSync(path, "utf8")) as Raw;
  try {
    return {
      thresholds: r.threshold_statement_patterns.map((p) => new RegExp(p, "gi")), rowResult: new RegExp(r.row_result_pattern, "i"), baselineWord: r.baseline_word.toLowerCase(),
      materials: Object.entries(r.materials).map(([k, v]) => [k, new RegExp(v, "i")] as [string, RegExp]), narrativeMarkers: r.narrative_markers.map((m) => m.toLowerCase()), narrativeClaim: new RegExp(r.narrative_claim_pattern, "i"),
    };
  } catch (e) { throw new Error(`self_consistency.json: bad pattern: ${e instanceof Error ? e.message : e}`); }
}

/** A contradiction found inside the report itself. Both sides are quoted word for word, each with its page, so the reviewer can see and verify them. */
export interface Contradiction {
  check: "result_contradicts_threshold" | "baseline_labeled_elevated" | "narrative_material_without_reading";
  item_topics: string[];
  quotes: { page: number; text: string; role: "report_says" | "but_also_says" }[];
  detail: string;
}

const lineOf = (text: string, index: number): string => { const s = text.lastIndexOf("\n", index) + 1; const e = text.indexOf("\n", index); return text.slice(s, e < 0 ? undefined : e).trim(); };
/** "Ceiling wallboard" is a ceiling, not a wall. Everything else is matched by the lexicon. */
const materialsIn = (text: string, c: SelfConsistencyConfig): string[] => { const t = text.replace(/ceiling\s*wall\s*board/gi, "ceiling"); return c.materials.filter(([, re]) => re.test(t)).map(([n]) => n); };
const norm = (room: string): string => room.replace(/\([^)]*\)/g, " ").replace(/[’']/g, "'").replace(/\s+/g, " ").trim().toUpperCase().replace(/^THE /, "");
const ROOM_PREFIX = /(?:^|\n)\s*([A-Z][A-Z'’ ]{3,}?)\s*(?:\([^)]*\))?\s+-\s+/g;

/**
 * Looks for places where the report disagrees with itself, using only its own text:
 * a result word that contradicts the report's stated line, a reference reading labeled elevated,
 * and moisture described in the narrative for a material that the room's measurement table has no reading for.
 * Silent when the report has no such table or statement. Nothing here is a judgement about the work, only a pair of quotes that do not agree.
 */
export function checkSelfConsistency(doc: ExtractedDocument, c: SelfConsistencyConfig): Contradiction[] {
  const out: Contradiction[] = [];

  // 1. Result word against the report's own threshold.
  const stated: { value: number; page: number; text: string }[] = [];
  for (const p of doc.pages) for (const re of c.thresholds) { const g = new RegExp(re.source, "gi"); for (let m = g.exec(p.text); m; m = g.exec(p.text)) stated.push({ value: Number(m[1]), page: p.index, text: lineOf(p.text, m.index) }); }
  const distinct = [...new Set(stated.map((s) => s.value))];
  const T = distinct.length === 1 ? distinct[0]! : null;
  for (const p of doc.pages) {
    const g = new RegExp(c.rowResult.source, "gi");
    for (let m = g.exec(p.text); m; m = g.exec(p.text)) {
      const value = Number(m[1]), label = m[2]!.toLowerCase();
      const elevated = !label.startsWith("not");
      const row = lineOf(p.text, m.index);
      const startsWithValue = /^\d/.test(row);
      const prev = startsWithValue ? p.text.slice(0, m.index).split("\n").slice(-2, -1).join(" ") : "";
      const isBaseline = `${prev} ${row}`.toLowerCase().includes(c.baselineWord);
      if (isBaseline && elevated) out.push({ check: "baseline_labeled_elevated", item_topics: ["Dry standard", "Numbers and units checked"], quotes: [{ page: p.index, text: row, role: "report_says" }], detail: `A reference ("baseline") reading of ${value}% is labeled elevated.` });
      else if (T !== null && ((elevated && value < T) || (!elevated && value >= T))) out.push({ check: "result_contradicts_threshold", item_topics: ["Numbers and units checked"], quotes: [{ page: p.index, text: row, role: "report_says" }, { page: stated[0]!.page, text: stated[0]!.text, role: "but_also_says" }], detail: `A reading of ${value}% is labeled "${m[2]}", but the report's own line is ${T}%.` });
    }
  }

  // 2. Narrative moisture on a material that the room's table has no reading for.
  const tableMaterials = new Map<string, Set<string>>();
  const narrative: { room: string; page: number; sentence: string }[] = [];
  for (const p of doc.pages) {
    const marks = [...p.text.matchAll(ROOM_PREFIX)];
    marks.forEach((m, k) => {
      const start = m.index! + m[0].length, end = k + 1 < marks.length ? marks[k + 1]!.index! : p.text.length;
      const body = p.text.slice(start, end).replace(/\s+/g, " ").trim(), room = norm(m[1]!);
      const isNarrative = c.narrativeMarkers.some((w) => body.toLowerCase().includes(w));
      if (isNarrative) { for (const s of body.split(/(?<=\.)\s+/)) narrative.push({ room, page: p.index, sentence: s }); }
      else { const set = tableMaterials.get(room) ?? new Set<string>(); for (const name of materialsIn(body, c)) set.add(name); tableMaterials.set(room, set); }
    });
  }
  const seen = new Set<string>();
  for (const n of narrative) {
    const claim = c.narrativeClaim.exec(n.sentence);
    const have = tableMaterials.get(n.room);
    if (!claim || !have || have.size === 0) continue;
    for (const name of materialsIn(claim[1]!, c)) {
      if (have.has(name)) continue;
      const key = `${n.room}|${name}`; if (seen.has(key)) continue; seen.add(key);
      out.push({ check: "narrative_material_without_reading", item_topics: ["Conclusion matches the data", "Summary matches the body"], quotes: [{ page: n.page, text: n.sentence, role: "report_says" }], detail: `The narrative describes moisture on ${name} in ${n.room.toLowerCase()}, and the measurement table for that room has no reading for it.` });
    }
  }
  // Summary-style sentences that list materials "in the <room>".
  const rooms = [...tableMaterials.keys()];
  for (const p of doc.pages) {
    for (const s of p.text.replace(/\s+/g, " ").split(/(?<=\.)\s+/)) {
      if (s.length > 400) continue;
      const clean = s.replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ");
      for (const room of rooms) {
        const idx = clean.toUpperCase().replace(/[’']/g, "'").search(new RegExp(`\\bIN (?:THE )?${room.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`));
        if (idx < 0) continue;
        const have = tableMaterials.get(room)!;
        const before = clean.slice(0, idx);
        const hits = materialsIn(before, c);
        if (hits.length < 2) continue;
        for (const name of hits) { const key = `${room}|${name}`; if (have.has(name) || seen.has(key)) continue; seen.add(key); out.push({ check: "narrative_material_without_reading", item_topics: ["Conclusion matches the data", "Summary matches the body"], quotes: [{ page: p.index, text: s.trim(), role: "report_says" }], detail: `The summary lists ${name} for ${room.toLowerCase()}, and the measurement table for that room has no reading for it.` }); }
      }
    }
  }
  return out;
}
