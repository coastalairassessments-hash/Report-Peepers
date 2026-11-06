import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { BANNED } from "../src/inspection/noCitations.js";

// Decision 2026-11-05: customer-facing words say "common practice". No standards, publishers, editions or clauses are named, and nothing says "compliant".
const rules = (f: string) => JSON.parse(readFileSync(resolve(import.meta.dirname, "../../../data/rules", f), "utf8")) as unknown;
const strings = (v: unknown, out: string[] = []): string[] => { if (typeof v === "string") out.push(v); else if (Array.isArray(v)) v.forEach((x) => strings(x, out)); else if (v && typeof v === "object") Object.entries(v).forEach(([k, x]) => { if (!k.startsWith("_")) strings(x, out); }); return out; };

describe("customer-facing words name no standard and claim no compliance", () => {
  const customerFiles = ["gap_wording.json", "context_questions.json", "context_expectations.json", "scope_effects.json", "markup.json"];
  for (const f of customerFiles) it(f, () => { for (const s of strings(rules(f))) expect(s, s).not.toMatch(BANNED); });
  it("inspection_checklist.json: the questions, reasons and record requests shown to the homeowner", () => {
    const c = rules("inspection_checklist.json") as { items: Record<string, unknown>[] };
    for (const it of c.items) for (const k of ["leading_question", "looks_for", "record_request"]) if (typeof it[k] === "string") expect(it[k] as string, `${it.id} ${k}`).not.toMatch(BANNED);
  });
});
