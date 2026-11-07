import { sha256Hex } from "../pipeline/hash.js";
import type { Entry, Fixture } from "./library.js";
import { currentEntry, statusOf, type Decision, type Edit } from "./status.js";
import type { ReviewerRegistry } from "./reviewers.js";

/** What a result is tied to. A result for different text, different rules or a different engine does not count. */
export interface Binding { content_hash: string; rule_hash: string; engine_version: string }
export interface BoundResult extends Binding { fixture_id: string; executed: boolean; passed: boolean }
/** Runs one fixture against the real check code. Supplied by the caller; the runner never decides pass or fail itself. */
export type Executor = (fixture: Fixture, entry: Entry) => Promise<boolean> | boolean;

/** The text a reviewer approved: every field except bookkeeping, in a fixed order. */
export const contentHash = (e: Entry): string => {
  const { status: _s, production_enabled: _p, version: _v, fixtures, ...rest } = e;
  const body = { ...rest, fixtures: fixtures.map((f) => ({ id: f.id, type: f.type, given: f.given, expect: f.expect })) };
  return sha256Hex(JSON.stringify(body, Object.keys(body).sort()) + JSON.stringify(body.fixtures));
};

export async function runFixtures(entry: Entry, bind: Pick<Binding, "rule_hash" | "engine_version">, exec: Executor): Promise<BoundResult[]> {
  const content_hash = contentHash(entry);
  const out: BoundResult[] = [];
  for (const f of entry.fixtures) {
    let passed = false, executed = true;
    try { passed = (await exec(f, entry)) === true; } catch { executed = true; passed = false; }
    out.push({ fixture_id: f.id, content_hash, rule_hash: bind.rule_hash, engine_version: bind.engine_version, executed, passed });
  }
  return out;
}

/** Live only when approved by registered reviewers on this version, and every fixture result was produced for exactly this text, rule file and engine. */
export function isLiveBound(base: Entry, edits: Edit[], decisions: Decision[], results: BoundResult[], now: Pick<Binding, "rule_hash" | "engine_version">, registry?: ReviewerRegistry): boolean {
  if (statusOf(base, edits, decisions, registry) !== "approved") return false;
  const cur = currentEntry(base, edits), hash = contentHash(cur);
  return cur.fixtures.every((f) => results.some((r) => r.fixture_id === f.id && r.executed && r.passed && r.content_hash === hash && r.rule_hash === now.rule_hash && r.engine_version === now.engine_version));
}
