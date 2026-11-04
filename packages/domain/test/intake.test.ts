import { describe, it, expect } from "vitest";
import { QUESTION_BANK, nextQuestion, buildScope, confirmScope, summarizeScope, type Answers } from "../src/intake.js";
import { validateCaseSnapshot } from "../../contracts/src/validate.js";
import example from "../../../docs/spec/example_case.json" with { type: "json" };

const walk = (answers: Answers, fill: (id: string) => Answers[string]) => {
  const asked: string[] = [];
  for (let q = nextQuestion(answers); q; q = nextQuestion(answers)) { asked.push(q.id); answers[q.id] = fill(q.id); }
  return asked;
};

describe("scope intake", () => {
  it("has Q01-Q12 and the first questions are about goal, then limits", () => {
    expect(QUESTION_BANK.map((q) => q.id)).toEqual(["Q01","Q02","Q03","Q04","Q05","Q06","Q07","Q08","Q09","Q10","Q11","Q12"]);
    expect(nextQuestion({})!.id).toBe("Q01");
    expect(nextQuestion({ Q01: { text: "x" } })!.id).toBe("Q02");
  });

  it("asks exactly one question at a time and never repeats", () => {
    const a: Answers = {};
    const asked = walk(a, (id) => id === "Q01" || id === "Q10" || id === "Q12" ? { text: "t" } : id === "Q03" ? { service: "Screening" } : { choice: "no" });
    expect(new Set(asked).size).toBe(asked.length);
  });

  it("'no limits' skips the limit questions and Q10", () => {
    const a: Answers = {};
    const asked = walk(a, (id) => id === "Q02" ? { choice: "no" } : id === "Q03" ? { service: "Screening" } : { text: "t", choice: "no" });
    expect(asked).toEqual(["Q01", "Q02", "Q03", "Q11", "Q12"]);
    const s = buildScope(a);
    expect(s.restrictions.every((r) => r.status === "explicitly_none")).toBe(true);
  });

  it("'unsure' stays unknown, never present or none", () => {
    const a: Answers = { Q01: { text: "g" }, Q02: { choice: "unsure" }, Q04: { choice: "unsure" } };
    const s = buildScope(a);
    expect(s.restrictions.find((r) => r.kind === "time")!.status).toBe("unknown");
    expect(s.restrictions.find((r) => r.kind === "samples")!.status).toBe("unknown");
  });

  it("captures a one-hour time cap and asks Q10 only when a limit exists", () => {
    const a: Answers = { Q01: { text: "g" }, Q02: { choice: "yes" }, Q03: { service: "Limited assessment" },
      Q04: { choice: "yes", value: 1, unit: "hour", proposedBy: "package", text: "One hour visit" },
      Q05: { choice: "no" }, Q06: { choice: "no" }, Q07: { choice: "no" }, Q08: { choice: "no" }, Q09: { choice: "no" } };
    expect(nextQuestion(a)!.id).toBe("Q10");
    const t = buildScope(a).restrictions.find((r) => r.kind === "time")!;
    expect(t).toMatchObject({ status: "present", limit_value: 1, limit_unit: "hour", proposed_by: "package" });
  });

  it("confirmation: goal required; unknown limits need an explicit conditional choice", () => {
    expect(confirmScope(buildScope({})).ok).toBe(false);
    const s = buildScope({ Q01: { text: "g" }, Q02: { choice: "unsure" } });
    expect(confirmScope(s)).toMatchObject({ ok: false, reason: "unknown_limits_need_conditional" });
    const c = confirmScope(s, { conditional: true, now: "2026-11-03T00:00:00Z" });
    expect(c.ok && c.scope.confirmation_status).toBe("conditional");
  });

  it("fully answered scope confirms as 'confirmed'", () => {
    const s = buildScope({ Q01: { text: "g" }, Q02: { choice: "no" }, Q03: { service: "Screening" } });
    const c = confirmScope(s);
    expect(c.ok && c.scope.confirmation_status).toBe("confirmed");
  });

  it("built scope fits the contract and summary avoids blame words", () => {
    const s = confirmScope(buildScope({ Q01: { text: "g" }, Q02: { choice: "no" }, Q03: { service: "Screening" } }));
    expect(s.ok).toBe(true);
    if (!s.ok) return;
    const snap = { ...(structuredClone(example) as any), scope: s.scope };
    snap.scope.included_areas = (example as any).scope.included_areas;
    expect(validateCaseSnapshot(snap).ok).toBe(true);
    const text = summarizeScope(s.scope).join(" ").toLowerCase();
    for (const bad of ["negligen", "fraud", "incompetent", "failed to", "violation"]) expect(text).not.toContain(bad);
  });
});
