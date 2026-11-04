import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { SummaryRecord } from "./record.js";

export interface AnalysisConfig { min_group_size: number }

/** The minimum group size is decided by Cory and the attorney (L18). Until it is set, counting refuses to run. */
export function loadAnalysisConfig(path = resolve(import.meta.dirname, "../../../../data/rules/analysis.json")): AnalysisConfig {
  const raw = JSON.parse(readFileSync(path, "utf8")) as { min_group_size: unknown };
  if (!Number.isInteger(raw.min_group_size) || (raw.min_group_size as number) < 2) throw new Error("analysis.json: min_group_size is not set. Counting stays off until Cory and the attorney decide it (L18).");
  return { min_group_size: raw.min_group_size as number };
}

export interface PatternCount { code: string; /** Number of records with this pattern, or null when fewer than the minimum. */ records: number | null }
export interface PatternReport { min_group_size: number; patterns: PatternCount[] }

/**
 * Counts how many records show each flaw pattern. A pattern seen in fewer records than the minimum is reported as hidden, never as a number.
 * No total is returned, so a hidden group cannot be worked out by subtraction. Show one cut at a time: overlapping cuts of the same data can still reveal a small group.
 */
export function countPatterns(records: readonly SummaryRecord[], minGroupSize: number, filter: { service_type?: string } = {}): PatternReport {
  if (!Number.isInteger(minGroupSize) || minGroupSize < 2) throw new Error("A minimum group size of 2 or more is required.");
  const per = new Map<string, number>();
  for (const r of records) {
    if (filter.service_type !== undefined && r.service_type !== filter.service_type) continue;
    for (const code of new Set(r.items.flatMap((i) => (i.pattern_code ? [i.pattern_code] : [])))) per.set(code, (per.get(code) ?? 0) + 1);
  }
  const patterns = [...per.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([code, n]) => ({ code, records: n >= minGroupSize ? n : null }));
  return { min_group_size: minGroupSize, patterns };
}
