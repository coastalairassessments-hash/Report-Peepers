import { describe, it, expect } from "vitest";
import { loadContextBank, loadExpectations, validateContextAnswer, cleanNote, nextContextQuestion, contextExpectations, NOTE_MAX, type ContextState } from "../src/context.js";
import { wordingProblems } from "../src/integrity.js";

const bank = loadContextBank();
const exp = loadExpectations();
const state = (answers: ContextState["answers"] = {}, skipped_sections: string[] = []): ContextState => ({ answers, skipped_sections });
const q = (id: string) => bank.questions.find((x) => x.id === id)!;

describe("context bank (data)", () => {
  it("has unique ids, known sections, and at least two options each", () => {
    const ids = bank.questions.map((x) => x.id);
    expect(new Set(ids).size).toBe(ids.length);
    const secs = new Set(bank.sections.map((s) => s.id));
    for (const x of bank.questions) { expect(secs.has(x.section)).toBe(true); expect(x.options.length).toBeGreaterThanOrEqual(2); }
  });
  it("is in the past tense: no question opens with a present-tense helper", () => {
    for (const x of bank.questions) expect(x.text).not.toMatch(/^(Do|Does|Are|Is|Can|Will|Have)\b/);
  });
  it("passes the wording rule", () => {
    for (const x of bank.questions) expect(wordingProblems(x.text)).toEqual([]);
    for (const r of exp.rows) { expect(wordingProblems(r.text)).toEqual([]); expect(wordingProblems(r.why)).toEqual([]); }
  });
  it("every skip rule and expectation row points at a real question and real options", () => {
    for (const x of bank.questions) if (x.skip_if) { const t = q(x.skip_if.q); expect(t).toBeTruthy(); for (const o of x.skip_if.only) expect(t.options).toContain(o); }
    for (const r of exp.rows) for (const w of r.when) { const t = q(w.q); expect(t, r.id).toBeTruthy(); for (const o of w.any) expect(t.options, `${r.id} ${o}`).toContain(o); }
  });
  it("no expectation row depends on the health answers", () => {
    for (const r of exp.rows) for (const w of r.when) expect(w.any.join(" ")).not.toMatch(/health/i);
  });
});

describe("answers", () => {
  it("accepts several picks on a multi question and a note", () => {
    expect(validateContextAnswer(q("CX10"), { picks: ["Stains", "A musty odor"], note: "Mostly the hall." })).toEqual([]);
  });
  it("rejects a pick that is not an option", () => {
    expect(validateContextAnswer(q("CX10"), { picks: ["Invented"] })).toContain("unknown_option:Invented");
  });
  it("rejects two picks on a single question", () => {
    expect(validateContextAnswer(q("CX18"), { picks: ["Yes", "No"] })).toContain("single_choice_only");
  });
  it("keeps Not sure and None exclusive", () => {
    expect(validateContextAnswer(q("CX16"), { picks: ["Roof leak", "Not sure"] })).toContain("exclusive_pick");
    expect(validateContextAnswer(q("CX16"), { picks: ["Roof leak", "None known"] })).toContain("exclusive_pick");
  });
  it("allows a note alone", () => {
    expect(validateContextAnswer(q("CX10"), { picks: [], note: "Hard to say." })).toEqual([]);
  });
  it("requires a pick or a note", () => {
    expect(validateContextAnswer(q("CX10"), { picks: [] })).toContain("empty_answer");
  });
  it("caps and cleans notes", () => {
    expect(cleanNote("a\u0000b\u0007c")).toBe("abc");
    expect(cleanNote("x".repeat(NOTE_MAX + 50)).length).toBe(NOTE_MAX);
    expect(validateContextAnswer(q("CX10"), { picks: ["Stains"], note: "y".repeat(NOTE_MAX + 1) })).toContain("note_too_long");
  });
});

describe("walking the bank", () => {
  it("asks one at a time, in order, skipping answered ones", () => {
    expect(nextContextQuestion(bank, state())!.id).toBe("CX01");
    expect(nextContextQuestion(bank, state({ CX01: { picks: ["Something else"] } }))!.id).toBe("CX02");
  });
  it("skips water follow-ups when no water event is known", () => {
    const s = state({ CX16: { picks: ["None known"] } });
    const asked: string[] = [];
    for (let n = nextContextQuestion(bank, s); n; n = nextContextQuestion(bank, s)) { asked.push(n.id); s.answers[n.id] = { picks: [n.options[0]!] }; if (n.id === "CX16") s.answers.CX16 = { picks: ["None known"] }; }
    for (const id of ["CX17", "CX18", "CX19", "CX21"]) expect(asked).not.toContain(id);
    expect(asked).toContain("CX20");
  });
  it("asks the follow-ups when a water event was reported", () => {
    const s = state({ CX16: { picks: ["Roof leak"] } });
    const ids: string[] = [];
    for (let n = nextContextQuestion(bank, s); n; n = nextContextQuestion(bank, s)) { ids.push(n.id); s.answers[n.id] = { picks: [n.options[0]!] }; }
    expect(ids).toContain("CX18");
  });
  it("skips a whole section when the client skipped it", () => {
    const s = state({}, ["goal", "home", "noticed"]);
    expect(nextContextQuestion(bank, s)!.section).toBe("water");
  });
  it("returns null when everything is answered or skipped", () => {
    expect(nextContextQuestion(bank, state({}, bank.sections.map((x) => x.id)))).toBeNull();
  });
});

describe("expectations", () => {
  const report = "The air samples were collected. Results are listed in the table.";
  it("asks when the client said X and the report is silent on the topic", () => {
    const out = contextExpectations(exp, state({ CX16: { picks: ["Roof leak"] }, CX18: { picks: ["No"] } }), report, true);
    expect(out.map((o) => o.id)).toEqual(expect.arrayContaining(["EX02", "EX03"]));
  });
  it("stays quiet when the report addresses the topic", () => {
    const out = contextExpectations(exp, state({ CX16: { picks: ["Roof leak"] } }), "The water history shows a roof leak in 2023.", true);
    expect(out.map((o) => o.id)).not.toContain("EX02");
  });
  it("stays quiet when the client did not say it", () => {
    expect(contextExpectations(exp, state({ CX16: { picks: ["None known"] } }), report, true)).toEqual([]);
  });
  it("stays silent when any page was not read", () => {
    expect(contextExpectations(exp, state({ CX16: { picks: ["Roof leak"] } }), report, false)).toEqual([]);
  });
  it("never uses the health answers", () => {
    const withHealth = contextExpectations(exp, state({ CX03: { picks: ["A health concern"] }, CX15: { picks: ["A health concern"], note: "Asthma" } }), report, true);
    expect(withHealth).toEqual([]);
  });
  it("matches patterns without regard to case", () => {
    const out = contextExpectations(exp, state({ CX22: { picks: ["Central AC"] }, CX25: { picks: ["Dirty coils"] } }), "The HVAC system was reviewed.", true);
    expect(out.map((o) => o.id)).not.toContain("EX06");
  });
});
