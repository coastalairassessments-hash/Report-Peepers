import { describe, it, expect } from "vitest";
import example from "../../../docs/spec/example_case.json" with { type: "json" };
import { validateCaseSnapshot } from "../src/validate.js";

const clone = () => structuredClone(example) as any;

describe("case snapshot contract v0.1", () => {
  it("accepts the synthetic example case", () => {
    const r = validateCaseSnapshot(example);
    expect(r.ok).toBe(true);
  });

  it("rejects a missing required top-level field", () => {
    const c = clone();
    delete c.scope;
    const r = validateCaseSnapshot(c);
    expect(r.ok).toBe(false);
  });

  it("rejects unknown extra properties", () => {
    const c = clone();
    c.pass_fail_score = 87;
    expect(validateCaseSnapshot(c).ok).toBe(false);
  });

  it("rejects a wrong schema version", () => {
    const c = clone();
    c.schema_version = "9.9";
    expect(validateCaseSnapshot(c).ok).toBe(false);
  });

  it("rejects an invalid finding type", () => {
    const c = clone();
    c.findings[0].finding_type = "violation";
    expect(validateCaseSnapshot(c).ok).toBe(false);
  });

  it("rejects a finding missing its resolution condition", () => {
    const c = clone();
    delete c.findings[0].resolution_condition;
    expect(validateCaseSnapshot(c).ok).toBe(false);
  });

  it("rejects non-object input", () => {
    expect(validateCaseSnapshot(null).ok).toBe(false);
    expect(validateCaseSnapshot("x").ok).toBe(false);
  });
});
