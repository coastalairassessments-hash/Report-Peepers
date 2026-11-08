import { describe, it, expect } from "vitest";
import { buildOutline, loadOutlineRules, parseOutlineRules } from "../../src/ingest/outline.js";
import { loadChecklist } from "../../src/inspection/checklist.js";
import { wordingProblems } from "../../src/integrity.js";
import { citationProblems } from "../../src/inspection/noCitations.js";
import { readFileSync } from "node:fs";

const raw = JSON.parse(readFileSync(new URL("../../../../data/rules/outline.json", import.meta.url), "utf8"));
const checklist = loadChecklist();
const approved = parseOutlineRules({ ...raw, approved: true });

describe("outline: what a full report commonly covers", () => {
  it("the committed wording is in use (E07), and switching it off produces nothing", () => {
    expect(buildOutline(loadOutlineRules(), checklist)).not.toBeNull();
    expect(buildOutline({ ...loadOutlineRules(), approved: false }, checklist)).toBeNull();
  });
  it("once approved it lists the topics that apply to every report, grouped", () => {
    const o = buildOutline(approved, checklist)!;
    expect(o.sections.length).toBeGreaterThan(5);
    expect(o.sections.flatMap((s) => s.points).length).toBe(checklist.items.filter((i) => i.applies_when === "always" && !(checklist.retired_ids ?? []).includes(i.id)).length);
  });
  it("leaves out topics that only apply in some situations", () => {
    const o = buildOutline(approved, checklist)!;
    const some = checklist.items.filter((i) => i.applies_when !== "always").map((i) => i.looks_for);
    expect(o.sections.flatMap((s) => s.points).filter((p) => some.includes(p) && !checklist.items.some((i) => i.applies_when === "always" && i.looks_for === p))).toEqual([]);
  });
  it("every line passes the customer-wording rules and names no standard", () => {
    const o = buildOutline(approved, checklist)!;
    for (const t of [o.title, o.intro, o.footer, ...o.sections.flatMap((s) => [s.heading, ...s.points])]) expect([...wordingProblems(t), ...citationProblems(t)]).toEqual([]);
  });
  it("says nothing about the customer's own document", () => {
    const o = buildOutline(approved, checklist)!;
    expect(JSON.stringify(o)).not.toMatch(/(your report is|is missing|was missed|failed)/i);
    expect(o.intro).toMatch(/not about your/i);
  });
  it("a bad fee share or wording is refused", () => {
    expect(() => parseOutlineRules({ ...raw, fee_share: 0 })).toThrow(/fee_share/);
    expect(() => parseOutlineRules({ ...raw, fee_share: 1.5 })).toThrow(/fee_share/);
    expect(() => parseOutlineRules({ ...raw, intro: "The inspector was negligent, so ask about these topics." })).toThrow(/wording/);
    expect(() => parseOutlineRules({ ...raw, approved: undefined })).toThrow(/approved/);
  });
});
