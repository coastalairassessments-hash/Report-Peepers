import { describe, it, expect } from "vitest";
import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { recordDecision, recordEdit, readDecisions, readEdits } from "../../src/knowledge/log.js";

const dir = () => mkdtempSync(join(tmpdir(), "kl-"));
const dec = { entry_id: "IEP-K-001", version: "0.2.1", reviewer: "Cory", role: "iep" as const, decision: "accept" as const, reason_code: null, comment: "", answer: "Yes.", seconds: 40, at: "2026-11-05T12:00:00Z" };

describe("the decision log", () => {
  it("appends decisions in order, one file per entry, and never rewrites history", () => {
    const d = dir();
    recordDecision(d, dec);
    recordDecision(d, { ...dec, reviewer: "Second", at: "2026-11-05T13:00:00Z" });
    expect(readDecisions(d, "IEP-K-001").map((x) => x.reviewer)).toEqual(["Cory", "Second"]);
    expect(existsSync(join(d, "decisions", "IEP-K-001.json"))).toBe(true);
  });
  it("refuses a reason code that is not on the list", () => {
    expect(() => recordDecision(dir(), { ...dec, decision: "reject", reason_code: "made_up" })).toThrow(/reason/);
  });
  it("requires a reason code for reject", () => {
    expect(() => recordDecision(dir(), { ...dec, decision: "reject", reason_code: null })).toThrow(/reason/);
  });
  it("requires a reviewer name", () => { expect(() => recordDecision(dir(), { ...dec, reviewer: " " })).toThrow(/reviewer/); });
  it("caps and cleans free text", () => {
    const d = dir();
    recordDecision(d, { ...dec, comment: "x".repeat(5000) + "\u0000", answer: "ok\u0007" });
    const r = readDecisions(d, "IEP-K-001")[0]!;
    expect(r.comment.length).toBe(2000);
    expect(r.answer).toBe("ok");
  });
  it("records edits as new versions and keeps them in order", () => {
    const d = dir();
    recordEdit(d, { entry_id: "IEP-K-001", author: "Cory", at: "2026-11-05T15:00:00Z", note: "n", fields: { principle: "A" } });
    recordEdit(d, { entry_id: "IEP-K-001", author: "Cory", at: "2026-11-05T16:00:00Z", note: "n2", fields: { principle: "B" } });
    expect(readEdits(d, "IEP-K-001").map((e) => e.fields.principle)).toEqual(["A", "B"]);
    expect(JSON.parse(readFileSync(join(d, "edits", "IEP-K-001.json"), "utf8"))).toHaveLength(2);
  });
  it("only known content fields may be edited", () => {
    expect(() => recordEdit(dir(), { entry_id: "IEP-K-001", author: "Cory", at: "x", note: "", fields: { production_enabled: true } as never })).toThrow(/field/);
  });
});
