import { describe, it, expect } from "vitest";
import spec from "../../../docs/spec/workflow_transitions.json" with { type: "json" };
import { transition, GUARDS, type Facts } from "../src/caseStateMachine.js";

const allTrue = (keys: string[]): Facts => Object.fromEntries(keys.map((k) => [k, true]));

describe("case state machine", () => {
  it("every guard in the spec file has a matching entry (no drift)", () => {
    const specKeys = spec.guards.map((g) => g.transition).sort();
    expect(Object.keys(GUARDS).sort()).toEqual(specKeys);
  });

  it("allows every unguarded transition in the spec", () => {
    for (const [from, tos] of Object.entries(spec.case_transitions)) {
      for (const to of tos) {
        if (GUARDS[`${from} -> ${to}`]) continue;
        expect(transition(from, to).ok, `${from} -> ${to}`).toBe(true);
      }
    }
  });

  it("refuses every transition not in the spec", () => {
    const states = Object.keys(spec.case_transitions);
    for (const from of states) for (const to of states) {
      const allowed = (spec.case_transitions as Record<string, string[]>)[from]!.includes(to);
      if (!allowed) expect(transition(from, to, allWithEverything()).ok, `${from} -> ${to}`).toBe(false);
    }
  });

  it("guarded transitions fail without facts and pass with all facts", () => {
    for (const [key, facts] of Object.entries(GUARDS)) {
      const [from, to] = key.split(" -> ") as [string, string];
      const bad = transition(from, to, {});
      expect(bad.ok).toBe(false);
      expect(transition(from, to, allTrue(facts)).ok, key).toBe(true);
    }
  });

  it("a single missing fact blocks the guard and is named", () => {
    const facts = allTrue(GUARDS["awaiting_reviewer -> released"]!);
    facts.humanApprovalRecorded = false;
    const r = transition("awaiting_reviewer", "released", facts);
    expect(r).toEqual({ ok: false, reason: "guard_failed", missing: ["humanApprovalRecorded"] });
  });

  it("no direct analysis -> released path exists", () => {
    expect(transition("analysis", "released", allWithEverything())).toEqual({ ok: false, reason: "not_allowed" });
  });

  it("deleted is terminal and unknown states are rejected", () => {
    expect(transition("deleted", "draft").ok).toBe(false);
    expect(transition("bogus", "draft")).toEqual({ ok: false, reason: "unknown_state" });
  });
});

function allWithEverything(): Facts {
  return allTrue([...new Set(Object.values(GUARDS).flat())]);
}
