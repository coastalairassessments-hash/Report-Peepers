import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import example from "../../../docs/spec/example_case.json" with { type: "json" };
import { validateCaseSnapshot } from "../src/validate.js";

const clone = () => structuredClone(example) as any;
const v02 = () => { const c = clone(); c.schema_version = "0.2"; return c; };
const ref = (extra: object = {}) => ({
  id: "REF-1", publisher: "Example Publisher", title: "Example Standard", edition: "2020", official_url: "https://example.invalid/standard",
  authority_type: "standard", ai_use_status: "metadata_only", permission_record_id: null, allowed_uses: [], effective_context: "Example context", reviewed_at: null, ...extra,
});
const calc = () => ({
  id: "CALC-1", kind: "indoor_outdoor_ratio", record_type: "derived", corrects_id: null, status: "ok",
  formula: "indoor / outdoor", inputs: { indoor: 60, outdoor: 40 }, units: "ratio", rounding: "two decimals",
  result: { ratio: 1.5 }, limitations: ["Single paired reading."], source_evidence_ids: [(example as any).evidence[0].id],
});

describe("contract v0.2", () => {
  it("the v0.1 schema file is unchanged", () => {
    const hash = createHash("sha256").update(readFileSync(resolve(import.meta.dirname, "../../../docs/spec/review_contract.schema.json"))).digest("hex");
    expect(hash).toBe("5f715e13c8492bb959da9d29364b915cd33400d1c066414ebd979005fbb6fbea");
  });

  it("a v0.1 snapshot still validates", () => { expect(validateCaseSnapshot(example).ok).toBe(true); });

  it("the same snapshot labeled 0.2 validates", () => { expect(validateCaseSnapshot(v02()).ok).toBe(true); });

  it("any other version fails with a clear message", () => {
    const c = clone(); c.schema_version = "9.9";
    const r = validateCaseSnapshot(c);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.errors.join(" ")).toContain("schema_version");
  });

  it("a snapshot labeled 0.1 that carries v0.2 fields is rejected", () => {
    const c = clone(); c.calculations = [calc()];
    expect(validateCaseSnapshot(c).ok).toBe(false);
  });

  it("a v0.2 snapshot with a calculation validates", () => {
    const c = v02(); c.calculations = [calc()];
    expect(validateCaseSnapshot(c).ok).toBe(true);
  });

  it("a calculation without a formula is rejected", () => {
    const c = v02(); const k = calc() as any; delete k.formula; c.calculations = [k];
    expect(validateCaseSnapshot(c).ok).toBe(false);
  });

  it("the new optional fields validate", () => {
    const c = v02();
    c.report_issued_on = "2026-05-01"; c.expected_area_names = ["Closet"];
    c.references = [ref({ publication_status: "published", published_on: "2024-01-01" })];
    c.findings[0].assumptions = ["Readings were taken at the stated location."]; c.findings[0].calculation_ids = [];
    c.release.reviewer_conflict_disclosure = "None.";
    c.scope.conflict_accounts = [{ kind: "time", agreement_account: "One hour.", client_account: "No limit.", status: "open", choice: null, note: null }];
    const r = validateCaseSnapshot(c);
    expect(r.ok, !r.ok ? r.errors.join("; ") : "").toBe(true);
  });

  it("a bad publication status is rejected", () => {
    const good = v02(); good.references = [ref({ publication_status: "published" })];
    expect(validateCaseSnapshot(good).ok).toBe(true);
    const bad = v02(); bad.references = [ref({ publication_status: "maybe" })];
    expect(validateCaseSnapshot(bad).ok).toBe(false);
  });
});
