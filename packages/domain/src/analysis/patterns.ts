import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export interface FlawPattern { code: string; meaning: string }
export interface PatternList { version: number; status: string; patterns: FlawPattern[] }

/** The controlled list of flaw-pattern codes. A tag outside the list is never accepted (ADR-005). */
export function loadPatterns(path = resolve(import.meta.dirname, "../../../../data/flaw-patterns/patterns.json")): PatternList {
  const raw = JSON.parse(readFileSync(path, "utf8")) as PatternList;
  const seen = new Set<string>();
  for (const p of raw.patterns) {
    if (!/^[a-z][a-z0-9_]*$/.test(p.code)) throw new Error(`patterns.json: bad code "${p.code}".`);
    if (seen.has(p.code)) throw new Error(`patterns.json: duplicate code "${p.code}".`);
    seen.add(p.code);
  }
  if (!seen.has("other")) throw new Error('patterns.json: the "other" code is required.');
  return raw;
}

export const isKnownCode = (list: PatternList, code: unknown): code is string => typeof code === "string" && list.patterns.some((p) => p.code === code);
