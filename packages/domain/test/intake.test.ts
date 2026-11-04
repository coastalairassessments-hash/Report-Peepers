import { describe, it, expect } from "vitest";
import { QUESTION_BANK, nextQuestion, buildScope, confirmScope, summarizeScope, recordScopeConflict, resolveScopeConflict, type Answers } from "../src/intake.js";
import { validateCaseSnapshot } from "@report-peepers/contracts";
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

  describe("conflicting accounts", () => {
    const base = () => buildScope({ Q01: { text: "g" }, Q02: { choice: "yes" }, Q04: { choice: "no" } });
    const accounts = { agreement: "Visit limited to one hour", client: "No time limit was mentioned" };

    it("TC003: both accounts are kept word for word when scope accounts conflict", () => {
      const s = recordScopeConflict(base(), "time", accounts);
      const r = s.restrictions.find((x) => x.kind === "time")!;
      expect(r.status).toBe("conflicting");
      expect(r.description).toContain("Visit limited to one hour");
      expect(r.description).toContain("No time limit was mentioned");
      expect(s.unresolved_discrepancies.join(" ")).toContain("Visit limited to one hour");
    });

    it("the conflict is also stored as structured accounts, and a resolution updates them", () => {
      const c = recordScopeConflict(base(), "time", { agreement: "One hour.", client: "No limit." });
      expect(c.conflict_accounts).toEqual([{ kind: "time", agreement_account: "One hour.", client_account: "No limit.", status: "open", choice: null, note: null }]);
      const r = resolveScopeConflict(c, "time", { choice: "agreement", outcome: "present", note: "Client confirmed in writing." });
      expect(r.conflict_accounts?.[0]).toMatchObject({ status: "resolved", choice: "agreement", agreement_account: "One hour.", client_account: "No limit." });
      const b = resolveScopeConflict(c, "time", { choice: "both_stand", outcome: "unknown", note: "Still disputed." });
      expect(b.conflict_accounts?.[0]).toMatchObject({ status: "open", choice: "both_stand" });
    });

    it("does not edit the scope it was given", () => {
      const s = base(); const before = JSON.stringify(s);
      recordScopeConflict(s, "time", accounts);
      expect(JSON.stringify(s)).toBe(before);
    });

    it("refuses to record a conflict with an empty account", () => {
      expect(() => recordScopeConflict(base(), "time", { agreement: " ", client: "x" })).toThrow();
      expect(() => recordScopeConflict(base(), "time", { agreement: "x", client: "" })).toThrow();
    });

    it("confirmation still needs an explicit conditional choice while the conflict is open", () => {
      const s = recordScopeConflict(base(), "time", accounts);
      expect(confirmScope(s)).toMatchObject({ ok: false, reason: "unknown_limits_need_conditional" });
    });

    it("a resolution needs a note and keeps both accounts", () => {
      const s = recordScopeConflict(base(), "time", accounts);
      expect(() => resolveScopeConflict(s, "time", { choice: "agreement", outcome: "present", note: " " })).toThrow();
      const r = resolveScopeConflict(s, "time", { choice: "agreement", outcome: "present", note: "Client found the signed agreement." });
      const t = r.restrictions.find((x) => x.kind === "time")!;
      expect(t.status).toBe("present");
      expect(t.description).toContain("Visit limited to one hour");
      expect(t.description).toContain("No time limit was mentioned");
      expect(t.description).toContain("Client found the signed agreement.");
    });

    it("both_stand keeps the conflict open", () => {
      const s = recordScopeConflict(base(), "time", accounts);
      const r = resolveScopeConflict(s, "time", { choice: "both_stand", outcome: "unknown", note: "Cannot tell which is right." });
      expect(r.restrictions.find((x) => x.kind === "time")!.status).toBe("conflicting");
    });

    it("cannot resolve something that is not in conflict", () => {
      expect(() => resolveScopeConflict(base(), "time", { choice: "client", outcome: "explicitly_none", note: "x" })).toThrow();
    });
  });
});
