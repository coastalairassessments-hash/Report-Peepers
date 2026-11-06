import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import example from "../../../docs/spec/example_case.json" with { type: "json" };
import { validateCaseSnapshot } from "../src/validate.js";

const sha = (f: string) => createHash("sha256").update(readFileSync(resolve(import.meta.dirname, "../../../docs/spec", f))).digest("hex");
const as = (v: string, mut?: (c: any) => void) => { const c = structuredClone(example) as any; c.schema_version = v; mut?.(c); return c; };
const auto = (c: any) => { c.release.human_review_status = "automatic"; c.release.release_mode = "automatic"; };

describe("contract v0.3 (automatic release, ADR-006)", () => {
  it("the v0.1 and v0.2 schema files are unchanged", () => {
    expect(sha("review_contract.schema.json")).toBe("5f715e13c8492bb959da9d29364b915cd33400d1c066414ebd979005fbb6fbea");
    expect(sha("review_contract.v0.2.schema.json")).toBe("04235c68d801bde3a4a3f4f47eee877f9c5fb0fee9044859b12a00671e950530");
  });
  it("the same snapshot labeled 0.3 validates", () => { expect(validateCaseSnapshot(as("0.3")).ok).toBe(true); });
  it("0.3 accepts the automatic mode", () => { expect(validateCaseSnapshot(as("0.3", auto)).ok).toBe(true); });
  it("0.3 still accepts human release_mode and approved status", () => {
    expect(validateCaseSnapshot(as("0.3", (c) => { c.release.release_mode = "human"; c.release.human_review_status = "approved"; })).ok).toBe(true);
  });
  it("0.3 rejects an unknown release_mode", () => {
    expect(validateCaseSnapshot(as("0.3", (c) => { c.release.release_mode = "robot"; })).ok).toBe(false);
  });
  it("0.2 and 0.1 still refuse the automatic status", () => {
    expect(validateCaseSnapshot(as("0.2", auto)).ok).toBe(false);
    expect(validateCaseSnapshot(as("0.1", auto)).ok).toBe(false);
  });
  it("a 0.3 snapshot is routed to the 0.3 schema, and the error names the versions", () => {
    const r = validateCaseSnapshot(as("0.4"));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]).toContain("0.3");
  });
});
