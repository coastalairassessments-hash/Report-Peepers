import { describe, it, expect } from "vitest";
import { loadInterviewRules, type Gap } from "../../src/interview/gaps.js";
import { emptyState, nextStep, answerGap, skipGap, resumeSkipped, stopInterview, summaryOf, InMemoryInterviewStore } from "../../src/interview/flow.js";

const rules = loadInterviewRules();
const g = (id: string, over: Partial<Gap> = {}): Gap => ({ key: id, gap_id: id.split(":")[0]!, area_id: null, question: "Q " + id, select: "one", options: ["A", "B", "I am not sure"], ...over });
const gaps = [g("g1"), g("g2", { select: "multi" }), g("g3")];
const NOW = "2026-11-07T10:00:00.000Z";
const must = <T>(r: { ok: true } & T | { ok: false; reason: string }): T => { if (!r.ok) throw new Error("unexpected " + r.reason); return r as never; };

describe("interview flow", () => {
  it("asks the first open question, one at a time, with its position", () => {
    const s = nextStep(gaps, emptyState());
    expect(s).toMatchObject({ kind: "question", position: 1, total: 3, gap: { key: "g1" } });
  });
  it("an answer moves on to the next question and is stored with its tag and time", () => {
    const r = must(answerGap(gaps, emptyState(), "g1", ["A"], "saw", NOW));
    expect(r.state.answers).toEqual([{ key: "g1", gap_id: "g1", area_id: null, choices: ["A"], tag: "saw", answered_at: NOW }]);
    expect(nextStep(gaps, r.state)).toMatchObject({ kind: "question", position: 2, gap: { key: "g2" } });
  });
  it("finishes when every question is answered", () => {
    let st = emptyState();
    for (const [k, c] of [["g1", ["A"]], ["g2", ["A", "B"]], ["g3", ["B"]]] as const) st = must(answerGap(gaps, st, k, [...c], "told", NOW)).state;
    expect(nextStep(gaps, st)).toEqual({ kind: "done", answered: 3, unknown: 0 });
  });
  it("'I don't know' needs no choice, and is counted as unknown", () => {
    const st = must(answerGap(gaps, emptyState(), "g1", [], "unknown", NOW)).state;
    expect(st.answers[0]!.choices).toEqual([]);
    expect(summaryOf(gaps, st).find((x) => x.key === "g1")!.status).toBe("unknown");
  });
  it("a saw or told answer needs at least one choice; one-choice questions take exactly one", () => {
    expect(answerGap(gaps, emptyState(), "g1", [], "saw", NOW)).toMatchObject({ ok: false });
    expect(answerGap(gaps, emptyState(), "g1", ["A", "B"], "saw", NOW)).toMatchObject({ ok: false });
    expect(answerGap(gaps, emptyState(), "g2", ["A", "B"], "saw", NOW)).toMatchObject({ ok: true });
  });
  it("refuses a choice that is not an option, a repeated choice, an unknown tag, an unknown question, or a bad time", () => {
    expect(answerGap(gaps, emptyState(), "g1", ["Z"], "saw", NOW)).toMatchObject({ ok: false });
    expect(answerGap(gaps, emptyState(), "g2", ["A", "A"], "saw", NOW)).toMatchObject({ ok: false });
    expect(answerGap(gaps, emptyState(), "g1", ["A"], "guess" as never, NOW)).toMatchObject({ ok: false });
    expect(answerGap(gaps, emptyState(), "nope", ["A"], "saw", NOW)).toMatchObject({ ok: false });
    expect(answerGap(gaps, emptyState(), "g1", ["A"], "saw", "yesterday")).toMatchObject({ ok: false });
  });
  it("skipping moves on; skipped questions come back only when the client asks to resume", () => {
    let st = must(skipGap(gaps, emptyState(), "g1")).state;
    expect(nextStep(gaps, st)).toMatchObject({ kind: "question", gap: { key: "g2" } });
    st = must(answerGap(gaps, st, "g2", ["A"], "saw", NOW)).state;
    st = must(answerGap(gaps, st, "g3", ["A"], "saw", NOW)).state;
    expect(nextStep(gaps, st)).toEqual({ kind: "paused", skipped: 1, answered: 2 });
    st = resumeSkipped(st);
    expect(nextStep(gaps, st)).toMatchObject({ kind: "question", gap: { key: "g1" } });
  });
  it("answering a skipped question removes the skip; a later answer replaces an earlier one", () => {
    let st = must(skipGap(gaps, emptyState(), "g1")).state;
    st = must(answerGap(gaps, st, "g1", ["A"], "saw", NOW)).state;
    expect(st.skipped).toEqual([]);
    st = must(answerGap(gaps, st, "g1", ["B"], "told", NOW)).state;
    expect(st.answers).toHaveLength(1);
    expect(st.answers[0]).toMatchObject({ choices: ["B"], tag: "told" });
  });
  it("stopping ends the interview; unanswered questions stay open, never guessed", () => {
    let st = must(answerGap(gaps, emptyState(), "g1", ["A"], "saw", NOW)).state;
    st = stopInterview(st);
    expect(nextStep(gaps, st)).toEqual({ kind: "done", answered: 1, unknown: 0 });
    expect(summaryOf(gaps, st).map((x) => x.status)).toEqual(["answered", "open", "open"]);
    expect(answerGap(gaps, st, "g2", ["A"], "saw", NOW)).toMatchObject({ ok: false });
  });
  it("no gaps means done at once", () => { expect(nextStep([], emptyState())).toEqual({ kind: "done", answered: 0, unknown: 0 }); });
  it("the state never changes in place", () => {
    const st = emptyState(); const before = JSON.stringify(st);
    answerGap(gaps, st, "g1", ["A"], "saw", NOW); skipGap(gaps, st, "g1"); stopInterview(st);
    expect(JSON.stringify(st)).toBe(before);
  });
  it("works with the real gap rules", () => {
    const real: Gap[] = rules.gaps.map((r) => ({ key: r.id, gap_id: r.id, area_id: null, question: r.question, select: r.select, options: r.options }));
    const first = real[0]!;
    expect(answerGap(real, emptyState(), first.key, [first.options[0]!], "saw", NOW)).toMatchObject({ ok: true });
  });
});

describe("interview store", () => {
  const rec = { key: "g1", gap_id: "g1", area_id: null, choices: ["A"], tag: "saw" as const, answered_at: NOW };
  it("keeps state per case and returns copies", async () => {
    const store = new InMemoryInterviewStore();
    await store.save("C1", { answers: [rec], skipped: ["g2"], stopped: false });
    const a = (await store.get("C1"))!; a.answers.pop();
    expect((await store.get("C1"))!.answers).toHaveLength(1);
    expect(await store.get("C2")).toBeNull();
  });
  it("refuses a record with a field or value that is not allowed", async () => {
    const store = new InMemoryInterviewStore();
    await expect(store.save("C1", { answers: [{ ...rec, note: "free text" } as never], skipped: [], stopped: false })).rejects.toThrow(/not allowed/);
    await expect(store.save("C1", { answers: [{ ...rec, tag: "maybe" } as never], skipped: [], stopped: false })).rejects.toThrow(/not allowed/);
    await expect(store.save("C1", { answers: [], skipped: ["x"], stopped: false, extra: 1 } as never)).rejects.toThrow(/not allowed/);
  });
  it("deletes a case's interview", async () => {
    const store = new InMemoryInterviewStore();
    await store.save("C1", emptyState()); await store.delete("C1");
    expect(await store.get("C1")).toBeNull();
  });
});
