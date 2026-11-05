import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { loadChecklist } from "../../src/inspection/checklist.js";
import { wordingProblems } from "../../src/integrity.js";

const list = loadChecklist();
const FILE = resolve(import.meta.dirname, "../../../../data/rules/inspection_checklist.json");
const tweak = (fn: (c: any) => void) => { const c = JSON.parse(readFileSync(FILE, "utf8")); fn(c); const p = join(mkdtempSync(join(tmpdir(), "ck-")), "c.json"); writeFileSync(p, JSON.stringify(c)); return p; };

describe("inspection checklist", () => {
  it("loads, every group is used, and both kinds of item exist", () => {
    expect(list.items.length).toBeGreaterThan(50);
    for (const g of list.groups) expect(list.items.some((i) => i.group === g), g).toBe(true);
    expect(list.items.some((i) => i.needs === "record")).toBe(true);
    expect(list.items.some((i) => i.needs === "report")).toBe(true);
  });

  it("voice rule: every question passes the wording rules and avoids blame words", () => {
    for (const i of list.items) {
      const text = `${i.leading_question} ${i.record_request}`;
      expect(wordingProblems(text), i.id).toEqual([]);
      expect(text, i.id).not.toMatch(/\b(fail(ed|ure|s)?|missing|wrong|careless|negligent|incompetent|error|mistake|violat\w+|fraud\w*|lied?)\b/i);
    }
  });

  it("voice rule: every question invites an answer", () => {
    for (const i of list.items) expect(i.leading_question, i.id).toMatch(/\?|worth asking|ask /i);
  });

  it("the questions that matter most are marked material", () => {
    const mat = (topic: string) => list.items.find((i) => i.topic === topic)!.materiality;
    expect(mat("Dry standard")).toBe("always_material");
    expect(mat("Control for surface samples")).toBe("always_material");
    expect(mat("Recommendation has support")).toBe("always_material");
  });

  it("a record item without a record request is refused", () => {
    expect(() => loadChecklist(tweak((c) => { c.items.find((i: any) => i.needs === "record").record_request = ""; }))).toThrow(/record request/);
  });
  it("duplicate ids, unknown groups, unknown conditions and unknown materiality are refused", () => {
    expect(() => loadChecklist(tweak((c) => { c.items[1].id = c.items[0].id; }))).toThrow(/duplicate/);
    expect(() => loadChecklist(tweak((c) => { c.items[0].group = "nope"; }))).toThrow(/group/);
    expect(() => loadChecklist(tweak((c) => { c.items[0].applies_when = "nope"; }))).toThrow(/condition/);
    expect(() => loadChecklist(tweak((c) => { c.items[0].materiality = "nope"; }))).toThrow(/materiality/);
  });
  it("licensing and conflict-of-interest items are not part of the checklist, and their ids are retired", () => {
    expect(list.items.some((i) => /licen[sc]e|credential|conflict|independen/i.test(`${i.topic} ${i.looks_for}`))).toBe(false);
    expect(list.retired_ids!.length).toBe(3);
    expect(() => loadChecklist(tweak((c) => { c.items[0].id = c.retired_ids[0]; }))).toThrow(/retired/);
  });
  it("adding a question later is adding one entry, no code change", () => {
    const p = tweak((c) => { c.items.push({ id: "CK-999", group: "visual", topic: "Extra", looks_for: "x", needs: "report", applies_when: "always", materiality: "always_minor", leading_question: "Ask: was this looked at?", record_request: "" }); });
    expect(loadChecklist(p).items.at(-1)!.id).toBe("CK-999");
  });
});
