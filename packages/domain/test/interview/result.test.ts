import { describe, it, expect } from "vitest";
import { loadInterviewRules, type Gap } from "../../src/interview/gaps.js";
import { parseInterviewOutcomes, loadInterviewOutcomes, interviewResult } from "../../src/interview/result.js";
import { emptyState, answerGap, type InterviewState } from "../../src/interview/flow.js";

const rules = loadInterviewRules();
const NOW = "2026-11-07T10:00:00.000Z";
const one = rules.gaps.find((r) => r.id === "readings_without_reference")!;
const multi = rules.gaps.find((r) => r.id === "sampling_only")!;
const gapOf = (r: typeof one, key = r.id): Gap => ({ key, gap_id: r.id, area_id: null, question: r.question, select: r.select, options: r.options });
const entry = (needs: string, text: string) => ({ needs, text });
const outcomesFor = (r: typeof one, status = "approved") => ({
  told_text: "You were told this rather than shown it, so a record would help.",
  gaps: [{ gap_id: r.id, status, open: entry("attachment", "Not answered yet."), unknown: entry("attachment", "Ask the inspector."), choices: Object.fromEntries(r.options.map((o, i) => [o, entry(["attachment", "narrower_conclusion", "amendment", "nothing_further"][i % 4]!, `Note for ${o}.`)])) }],
});
const parse = (raw: unknown) => parseInterviewOutcomes(raw, rules);
const ans = (gaps: Gap[], st: InterviewState, key: string, choices: string[], tag: "saw" | "told" | "unknown") => { const r = answerGap(gaps, st, key, choices, tag, NOW); if (!r.ok) throw new Error(r.reason); return r.state; };

describe("interview result", () => {
  const gaps = [gapOf(one)];
  const out = parse(outcomesFor(one));
  it("shows the note for the chosen answer and what the report may need", () => {
    const st = ans(gaps, emptyState(), one.id, [one.options[0]!], "saw");
    const r = interviewResult(gaps, st, out);
    expect(r.gaps[0]).toMatchObject({ key: one.id, status: "answered", needs: ["attachment"], notes: [`Note for ${one.options[0]}.`], pending_wording: false });
    expect(r.needs).toEqual(["attachment"]);
  });
  it("an open question says it is still open and keeps the gap standing", () => {
    const r = interviewResult(gaps, emptyState(), out);
    expect(r.gaps[0]).toMatchObject({ status: "open", needs: ["attachment"], notes: ["Not answered yet."] });
  });
  it("an 'I don't know' answer uses the unknown note", () => {
    const r = interviewResult(gaps, ans(gaps, emptyState(), one.id, [], "unknown"), out);
    expect(r.gaps[0]).toMatchObject({ status: "unknown", notes: ["Ask the inspector."] });
  });
  it("an answer told to the client adds the recollection note; an answer the client saw does not", () => {
    const told = interviewResult(gaps, ans(gaps, emptyState(), one.id, [one.options[0]!], "told"), out).gaps[0]!;
    expect(told.notes).toContain("You were told this rather than shown it, so a record would help.");
    const saw = interviewResult(gaps, ans(gaps, emptyState(), one.id, [one.options[0]!], "saw"), out).gaps[0]!;
    expect(saw.notes).not.toContain("You were told this rather than shown it, so a record would help.");
  });
  it("an answer never settles a gap: a 'nothing further' note still reports the gap as answered, not closed in the report", () => {
    const g = gapOf(one);
    const idx = one.options.findIndex((_, i) => i % 4 === 3);
    if (idx < 0) return;
    const r = interviewResult([g], ans([g], emptyState(), one.id, [one.options[idx]!], "saw"), out);
    expect(r.gaps[0]!.status).toBe("answered");
    expect(r.gaps[0]!.report_changed).toBe(false);
    expect(r.needs).toEqual([]);
  });
  it("combines several choices on a multi-choice question", () => {
    const g = [gapOf(multi)];
    const o = parse(outcomesFor(multi));
    const r = interviewResult(g, ans(g, emptyState(), multi.id, [multi.options[0]!, multi.options[1]!], "saw"), o);
    expect(r.gaps[0]!.notes).toEqual([`Note for ${multi.options[0]}.`, `Note for ${multi.options[1]}.`]);
    expect(r.gaps[0]!.needs).toEqual(["attachment", "narrower_conclusion"]);
  });
  it("wording that is not approved is never shown; the gap is counted as pending", () => {
    const r = interviewResult(gaps, ans(gaps, emptyState(), one.id, [one.options[0]!], "saw"), parse(outcomesFor(one, "ai_draft")));
    expect(r.gaps[0]).toMatchObject({ status: "answered", notes: [], needs: [], pending_wording: true });
    expect(r.pending_wording).toBe(1);
  });
  it("the same rule applies to each room of a per-room gap", () => {
    const room = rules.gaps.find((x) => x.id === "excluded_room")!;
    const gs = [gapOf(room, "excluded_room:A1"), gapOf(room, "excluded_room:A2")];
    const o = parse(outcomesFor(room));
    const st = ans(gs, emptyState(), "excluded_room:A1", [room.options[0]!], "saw");
    const r = interviewResult(gs, st, o);
    expect(r.gaps.map((g) => g.status)).toEqual(["answered", "open"]);
  });
  it("the result carries ids, fixed notes and counts only", () => {
    const st = ans(gaps, emptyState(), one.id, [one.options[0]!], "saw");
    expect(Object.keys(interviewResult(gaps, st, out)).sort()).toEqual(["gaps", "needs", "pending_wording"]);
  });
});

describe("the outcomes file is checked when loaded", () => {
  it("accepts a good file", () => { expect(parse(outcomesFor(one)).gaps.size).toBe(1); });
  it("refuses a gap that does not exist, a duplicate, a missing choice, an extra choice, a bad status or a bad 'needs'", () => {
    const a = outcomesFor(one); a.gaps[0]!.gap_id = "nope"; expect(() => parse(a)).toThrow(/gap/);
    const b = outcomesFor(one); b.gaps.push(structuredClone(b.gaps[0]!)); expect(() => parse(b)).toThrow(/once/);
    const c = outcomesFor(one); delete (c.gaps[0]!.choices as Record<string, unknown>)[one.options[0]!]; expect(() => parse(c)).toThrow(/choice/);
    const d = outcomesFor(one); (d.gaps[0]!.choices as Record<string, unknown>)["Made up"] = entry("attachment", "x note here"); expect(() => parse(d)).toThrow(/choice/);
    const e = outcomesFor(one, "live"); expect(() => parse(e)).toThrow(/status/);
    const f = outcomesFor(one); f.gaps[0]!.open.needs = "fire_them"; expect(() => parse(f)).toThrow(/needs/);
  });
  it("refuses notes that accuse, name a standard, say compliant, or lead", () => {
    for (const bad of ["The inspector was negligent.", "This does not meet ASTM D7338.", "The report is not compliant.", "They should have tested, obviously."]) {
      const x = outcomesFor(one); x.gaps[0]!.open.text = bad; expect(() => parse(x), bad).toThrow();
    }
  });
  it("the real file loads, and every real gap has notes (in use as written, E07)", () => {
    const real = loadInterviewOutcomes(rules);
    for (const r of rules.gaps) expect(real.gaps.get(r.id)?.status, r.id).toBe("approved");
  });
});

describe("the homeowner's own answer is shown next to the question", () => {
  const gaps = [gapOf(one)];
  it("carries the question and the answer, labeled as the homeowner's, even while notes are still draft", () => {
    const out = parse(outcomesFor(one, "ai_draft"));
    const st = ans(gaps, emptyState(), one.id, [one.options[0]!], "told");
    const g = interviewResult(gaps, st, out).gaps[0]!;
    expect(g.question).toBe(one.question);
    expect(g.your_answer).toEqual({ choices: [one.options[0]], how_known: "told" });
    expect(g.notes).toEqual([]);
    expect(g.report_changed).toBe(false);
  });
  it("an open question has no answer and an unknown one says so", () => {
    const out = parse(outcomesFor(one));
    expect(interviewResult(gaps, emptyState(), out).gaps[0]!.your_answer).toBeNull();
    const st = ans(gaps, emptyState(), one.id, [], "unknown");
    expect(interviewResult(gaps, st, out).gaps[0]!.your_answer).toEqual({ choices: [], how_known: "unknown" });
  });
});

