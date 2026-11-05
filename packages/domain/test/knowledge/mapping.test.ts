import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadLibrary, PARKED_FAMILIES } from "../../src/knowledge/library.js";

const root = resolve(import.meta.dirname, "../../../..");
const mapping = JSON.parse(readFileSync(resolve(root, "data/knowledge/mapping.json"), "utf8")) as { rows: { entry: string; coverage: string; checklist: string[]; code_rules: string; note: string }[] };
const checklist = (JSON.parse(readFileSync(resolve(root, "data/rules/inspection_checklist.json"), "utf8")) as { items: { id: string }[] }).items.map((i) => i.id);
const lib = loadLibrary();

describe("library to checklist mapping", () => {
  it("every library entry has exactly one mapping row", () => {
    expect(mapping.rows.map((r) => r.entry).sort()).toEqual(lib.entries.map((e) => e.id).sort());
  });
  it("every checklist id named exists", () => { for (const r of mapping.rows) for (const c of r.checklist) expect(checklist, `${r.entry} ${c}`).toContain(c); });
  it("coverage is one of covered, partial, new or parked", () => { for (const r of mapping.rows) expect(["covered", "partial", "new", "parked"]).toContain(r.coverage); });
  it("parked means a parked family, and the reverse", () => {
    for (const r of mapping.rows) expect(r.coverage === "parked").toBe(PARKED_FAMILIES.includes(lib.entries.find((e) => e.id === r.entry)!.family));
  });
  it("covered and partial rows point at something we built", () => { for (const r of mapping.rows.filter((x) => x.coverage === "covered" || x.coverage === "partial")) expect(r.checklist.length > 0 || r.code_rules.length > 0, r.entry).toBe(true); });
  it("a conflict with a decision of Cory is written down", () => { expect(mapping.rows.find((r) => r.entry === "IEP-K-030")!.note).toMatch(/CONFLICT/); });
});
