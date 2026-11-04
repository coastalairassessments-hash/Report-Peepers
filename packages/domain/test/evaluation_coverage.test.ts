import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import cases from "../../../docs/spec/evaluation_cases.json" with { type: "json" };
import coverage from "../../../tests/evaluations/coverage.json" with { type: "json" };

const root = resolve(import.meta.dirname, "../../..");
type Entry = { status: string; note: string; evidence: { file: string; test: string }[] };
const map = coverage as Record<string, Entry>;
const STATUSES = ["covered", "partial", "needs_logic", "needs_engine", "later"];

describe("evaluation scenario coverage map", () => {
  it("maps every one of the 60 scenarios exactly once, and nothing extra", () => {
    const ids = cases.cases.map((c) => c.id).sort();
    expect(Object.keys(map).sort()).toEqual(ids);
    expect(ids.length).toBe(60);
  });

  it("uses only known statuses", () => {
    for (const [id, e] of Object.entries(map)) expect(STATUSES, id).toContain(e.status);
  });

  it("every 'covered' or 'partial' claim names a test that really exists", () => {
    for (const [id, e] of Object.entries(map)) {
      if (e.status !== "covered" && e.status !== "partial") continue;
      expect(e.evidence.length, `${id} needs evidence`).toBeGreaterThan(0);
      for (const ref of e.evidence) {
        const path = resolve(root, ref.file);
        expect(existsSync(path), `${id}: ${ref.file}`).toBe(true);
        expect(readFileSync(path, "utf8").includes(ref.test), `${id}: test "${ref.test}" not found in ${ref.file}`).toBe(true);
      }
    }
  });

  it("scenarios not yet covered carry no test claims", () => {
    for (const [id, e] of Object.entries(map))
      if (!["covered", "partial"].includes(e.status)) expect(e.evidence, id).toEqual([]);
  });
});
