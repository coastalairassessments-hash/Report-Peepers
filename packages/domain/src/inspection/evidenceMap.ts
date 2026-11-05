import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { CaseSnapshot } from "@report-peepers/contracts";

type Cell = "seen" | "measured" | "sampled" | "concluded" | "recommended" | "cause";
interface RawRule { id: string; has: Cell[]; lacks: Cell[]; topic: string; material?: boolean; material_if_has?: Cell }
export interface EvidenceMapConfig { measured: RegExp[]; sampled: RegExp[]; rules: RawRule[] }

export function loadEvidenceMapConfig(path = resolve(import.meta.dirname, "../../../../data/rules/evidence_map.json")): EvidenceMapConfig {
  const r = JSON.parse(readFileSync(path, "utf8")) as { measured_patterns: string[]; sample_patterns: string[]; rules: RawRule[] };
  try { return { measured: r.measured_patterns.map((p) => new RegExp(p, "i")), sampled: r.sample_patterns.map((p) => new RegExp(p, "i")), rules: r.rules }; }
  catch (e) { throw new Error(`evidence_map.json: bad pattern: ${e instanceof Error ? e.message : e}`); }
}

/** A gap in one room's chain: a later link (a conclusion or recommendation) with nothing the report shows behind it. Wording is added later. */
export interface MapGap { rule: string; area_id: string; topic: string; material: boolean; evidence_ids: string[]; claim_ids: string[]; page: number | null; detail: string }
export interface AreaMap { area_id: string; name: string; cells: Record<Cell, string[]>; gaps: MapGap[] }

const EMPTY = (): Record<Cell, string[]> => ({ seen: [], measured: [], sampled: [], concluded: [], recommended: [], cause: [] });

/**
 * One row per area: what was seen, measured, sampled, concluded and recommended, each as the ids of the report's own statements.
 * Plain code sorts the statements; the model's word never decides a cell. A gap is flagged only for a named room, only where a later
 * link leans on an earlier one that is empty. A claim of type observation counts as something seen. The whole-report area is listed without gaps,
 * because its conclusions draw on the rooms.
 */
export function buildEvidenceMap(snap: Pick<CaseSnapshot, "areas" | "evidence" | "claims">, c: EvidenceMapConfig): AreaMap[] {
  return snap.areas.map((area) => {
    const cells = EMPTY();
    for (const e of snap.evidence) {
      if (!e.area_ids.includes(area.id)) continue;
      if (e.origin === "laboratory" || c.sampled.some((re) => re.test(e.statement))) cells.sampled.push(e.id);
      else if (c.measured.some((re) => re.test(e.statement))) cells.measured.push(e.id);
      else cells.seen.push(e.id);
    }
    for (const cl of snap.claims) {
      if (!cl.area_ids.includes(area.id)) continue;
      if (cl.claim_type === "observation") cells.seen.push(cl.id);
      else if (cl.claim_type === "remediation" || cl.claim_type === "verification") cells.recommended.push(cl.id);
      else { cells.concluded.push(cl.id); if (cl.claim_type === "cause") cells.cause.push(cl.id); }
    }
    const gaps: MapGap[] = [];
    if (area.parent_id !== null) {
      for (const r of c.rules) {
        if (!r.has.every((k) => cells[k].length > 0) || !r.lacks.every((k) => cells[k].length === 0)) continue;
        const claim_ids = [...new Set(r.has.flatMap((k) => cells[k]))];
        const first = snap.claims.find((cl) => claim_ids.includes(cl.id));
        gaps.push({ rule: r.id, area_id: area.id, topic: r.topic, material: r.material ?? (r.material_if_has ? cells[r.material_if_has].length > 0 : false), evidence_ids: [], claim_ids, page: first?.source_anchor.pdf_page_index_1based ?? null, detail: `${area.name}: ${r.id.replace(/_/g, " ")}.` });
      }
    }
    return { area_id: area.id, name: area.name, cells, gaps };
  });
}
