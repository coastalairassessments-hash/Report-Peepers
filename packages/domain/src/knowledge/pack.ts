import type { Reference } from "@report-peepers/contracts";
import { sha256Hex } from "../pipeline/hash.js";
import { wordingProblems } from "../integrity.js";
import { sourceRightsProblems } from "../references/rights.js";
import { NAMES_STANDARD, NUMERIC_LIMIT, type Entry } from "./library.js";
import { contentHash, isLiveBound, type BoundResult } from "./fixtureRunner.js";
import type { ReviewerRegistry } from "./reviewers.js";
import type { Decision, Edit } from "./status.js";
import { currentEntry } from "./status.js";

/** What one approved check does on a report: when text matches `trigger` and no text matches `support`, ask the question. Patterns are data. */
export interface Detect { trigger: string; support: string | null }
export interface PackItem { id: string; content_hash: string; claim_ids: string[]; source_ids: string[]; topic: string; question: string; why: string; detect: Detect }
export interface Pack { pack_version: string; engine_version: string; rule_hash: string; sources: Reference[]; items: PackItem[]; hash: string }
export interface Candidate {
  entry: Entry; edits: Edit[]; decisions: Decision[]; results: BoundResult[];
  item: Omit<PackItem, "id" | "content_hash">;
}
export interface Excluded { id: string; reason: "not_live" | "unknown_source" | "source_not_usable" | "wording" | "bad_pattern" | "changed_since_approval" }

const canon = (p: Omit<Pack, "hash">): string => JSON.stringify({ pack_version: p.pack_version, engine_version: p.engine_version, rule_hash: p.rule_hash, sources: p.sources, items: p.items });
export const packHash = (p: Omit<Pack, "hash">): string => sha256Hex(canon(p));

const wordingBad = (t: string): boolean => NAMES_STANDARD.test(t) || NUMERIC_LIMIT.test(t) || wordingProblems(t).length > 0;
const patternBad = (d: Detect): boolean => { try { new RegExp(d.trigger, "i"); if (d.support) new RegExp(d.support, "i"); return false; } catch { return true; } };

/** Builds a pack from approved, live entries only. Everything left out is listed with a reason; nothing is silently dropped. */
export function buildPack(input: { candidates: Candidate[]; sources: Reference[]; registry: ReviewerRegistry; now: { rule_hash: string; engine_version: string }; pack_version: string }): { pack: Pack; excluded: Excluded[] } {
  const excluded: Excluded[] = [], items: PackItem[] = [], used = new Set<string>();
  const byId = new Map(input.sources.map((s) => [s.id, s]));
  for (const c of input.candidates) {
    const id = c.entry.id, add = (reason: Excluded["reason"]) => excluded.push({ id, reason });
    if (!isLiveBound(c.entry, c.edits, c.decisions, c.results, input.now, input.registry)) { add("not_live"); continue; }
    if (c.item.source_ids.some((s) => !byId.has(s))) { add("unknown_source"); continue; }
    const srcs = c.item.source_ids.map((s) => byId.get(s)!);
    if (srcs.some((s) => s.ai_use_status !== "authorized" || sourceRightsProblems([s]).length > 0)) { add("source_not_usable"); continue; }
    if (wordingBad(c.item.question) || wordingBad(c.item.why)) { add("wording"); continue; }
    if (patternBad(c.item.detect)) { add("bad_pattern"); continue; }
    items.push({ id, content_hash: contentHash(currentEntry(c.entry, c.edits)), ...c.item });
    for (const s of c.item.source_ids) used.add(s);
  }
  const base = { pack_version: input.pack_version, engine_version: input.now.engine_version, rule_hash: input.now.rule_hash, sources: input.sources.filter((s) => used.has(s.id)), items };
  return { pack: { ...base, hash: packHash(base) }, excluded };
}

/** Everything a pack must satisfy to be used. Problems name ids and rules only. */
export function validatePack(p: Pack): string[] {
  const out: string[] = [];
  if (p.hash !== packHash(p)) out.push("hash_mismatch");
  for (const r of sourceRightsProblems(p.sources)) out.push(`rights:${r.reference_id}:${r.code}`);
  const ids = new Set(p.sources.map((s) => s.id)), seen = new Set<string>();
  for (const i of p.items) {
    if (seen.has(i.id)) out.push(`duplicate_item:${i.id}`); seen.add(i.id);
    if (!i.content_hash) out.push(`no_content_hash:${i.id}`);
    for (const s of i.source_ids) { if (!ids.has(s)) out.push(`unknown_source:${i.id}`); else if (p.sources.find((x) => x.id === s)!.ai_use_status !== "authorized") out.push(`source_not_usable:${i.id}`); }
    if (wordingBad(i.question) || wordingBad(i.why)) out.push(`wording:${i.id}`);
    if (patternBad(i.detect)) out.push(`bad_pattern:${i.id}`);
  }
  return out;
}

/** Reads a pack from text. Anything wrong refuses the whole pack: no partial use. */
export function loadPack(json: string): Pack {
  let p: Pack;
  try { p = JSON.parse(json) as Pack; } catch { throw new Error("pack: not valid JSON"); }
  if (!p || !Array.isArray(p.items) || !Array.isArray(p.sources) || typeof p.hash !== "string") throw new Error("pack: wrong shape");
  const problems = validatePack(p);
  if (problems.length) throw new Error(`pack refused: ${problems.join(", ")}`);
  return p;
}
