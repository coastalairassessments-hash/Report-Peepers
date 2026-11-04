import { describe, it, expect } from "vitest";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadPatterns, isKnownCode } from "../../src/analysis/patterns.js";
import { wordingProblems } from "../../src/integrity.js";

describe("flaw-pattern list", () => {
  const list = loadPatterns();
  it("has unique, well-formed codes and an 'other' code", () => {
    const codes = list.patterns.map((p) => p.code);
    expect(new Set(codes).size).toBe(codes.length);
    for (const c of codes) expect(c).toMatch(/^[a-z][a-z0-9_]*$/);
    expect(codes).toContain("other");
  });
  it("accepts listed codes and rejects anything else", () => {
    expect(isKnownCode(list, "cause_without_support")).toBe(true);
    for (const bad of ["Cause_Without_Support", "made_up", "", null, undefined, 3]) expect(isKnownCode(list, bad)).toBe(false);
  });
  it("every meaning passes the wording rules and holds no names or places", () => {
    for (const p of list.patterns) { expect(wordingProblems(p.meaning), p.code).toEqual([]); expect(p.meaning).not.toMatch(/@|https?:|\d{3}/); }
  });
  it("a list with a duplicate or missing 'other' is refused", () => {
    const dir = mkdtempSync(join(tmpdir(), "pat-"));
    const write = (patterns: unknown) => { const p = join(dir, `${Math.random()}.json`); writeFileSync(p, JSON.stringify({ version: 1, status: "draft", patterns })); return p; };
    expect(() => loadPatterns(write([{ code: "a", meaning: "x" }, { code: "a", meaning: "y" }, { code: "other", meaning: "z" }]))).toThrow(/duplicate/);
    expect(() => loadPatterns(write([{ code: "a", meaning: "x" }]))).toThrow(/other/);
  });
});
