import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Decided by Cory (2026-11-06, confirmed 2026-11-07): the software never asks who made a repair or when.
const ROOT = resolve(import.meta.dirname, "../../../data");
const strings = (v: unknown): string[] => (typeof v === "string" ? [v] : Array.isArray(v) ? v.flatMap(strings) : v && typeof v === "object" ? Object.values(v).flatMap(strings) : []);
const ASKS = /\bwho\b[^.?]{0,40}\b(repair|fix|made|did|performed|completed)|\bwhen (?:was|were|did)\b[^.?]{0,40}\b(?:repair|fix)|\bwhat date\b[^.?]{0,40}\brepair|\brepair\w*\b[^.?]{0,30}\b(by whom|on what date)\b/i;

describe("no customer-facing question asks who made a repair or when", () => {
  for (const f of ["rules/gap_wording.json", "rules/inspection_checklist.json", "rules/interview_gaps.json", "knowledge/seed_v2.1.json"]) {
    it(f, () => {
      const hits = strings(JSON.parse(readFileSync(resolve(ROOT, f), "utf8"))).filter((t) => ASKS.test(t));
      expect(hits).toEqual([]);
    });
  }
});
