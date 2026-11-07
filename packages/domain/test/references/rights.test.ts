import { describe, it, expect } from "vitest";
import { sourceRightsProblems } from "../../src/references/rights.js";

const ref = (o: Record<string, unknown> = {}) => ({
  id: "REF-1", publisher: "Some Publisher", title: "T", edition: "2024", official_url: "https://example.org", authority_type: "guidance",
  ai_use_status: "authorized", permission_record_id: "PERM-1", allowed_uses: ["metadata", "output_reference"], effective_context: "", reviewed_at: "2026-01-01", ...o,
}) as never;
const codes = (r: unknown[]) => sourceRightsProblems(r as never).map((p) => p.code);

describe("source rights", () => {
  it("passes a source that is authorized with a permission record", () => { expect(codes([ref()])).toEqual([]); });
  it("authorized without a permission record is a problem", () => { expect(codes([ref({ permission_record_id: null })])).toEqual(["authorized_without_permission_record"]); });
  it("pending, blocked and metadata-only sources may carry no use beyond metadata", () => {
    for (const s of ["pending", "blocked", "metadata_only"]) {
      expect(codes([ref({ ai_use_status: s, permission_record_id: null, allowed_uses: ["metadata"] })]), s).toEqual([]);
      expect(codes([ref({ ai_use_status: s, permission_record_id: null, allowed_uses: ["metadata", "inference"] })]), s).toEqual(["uses_beyond_rights"]);
      expect(codes([ref({ ai_use_status: s, allowed_uses: ["output_reference"] })]), s).toEqual(["uses_beyond_rights"]);
    }
  });
  it("training is never allowed, even when authorized", () => { expect(codes([ref({ allowed_uses: ["metadata", "training"] })])).toEqual(["training_not_allowed"]); });
  it("a withdrawn or superseded source cannot be authorized for output", () => {
    expect(codes([ref({ publication_status: "withdrawn" })])).toEqual(["withdrawn_or_superseded_in_use"]);
    expect(codes([ref({ publication_status: "superseded", ai_use_status: "metadata_only", permission_record_id: null, allowed_uses: ["metadata"] })])).toEqual([]);
  });
  it("names the reference and the rule, never the title", () => {
    const p = sourceRightsProblems([ref({ permission_record_id: null, title: "Secret Title" })] as never);
    expect(p[0]).toMatchObject({ reference_id: "REF-1" });
    expect(JSON.stringify(p)).not.toMatch(/Secret/);
  });
});

import example from "../../../../docs/spec/example_case.json" with { type: "json" };
import { checkIntegrity } from "../../src/integrity.js";

describe("the integrity check applies the source-rights rules", () => {
  it("flags a case that carries a source with rights it does not have", () => {
    const c = structuredClone(example) as any;
    c.references = [{ id: "REF-1", publisher: "P", title: "T", edition: null, official_url: "https://example.org", authority_type: "standard", ai_use_status: "pending", permission_record_id: null, allowed_uses: ["metadata", "inference"], effective_context: "x", reviewed_at: null }];
    c.findings.forEach((f: any) => { f.reference_bindings = []; });
    const issues = checkIntegrity(c);
    expect(issues.map((i) => i.code)).toContain("source_rights_uses_beyond_rights");
    c.references[0].allowed_uses = ["metadata"];
    expect(checkIntegrity(c).map((i) => i.code)).not.toContain("source_rights_uses_beyond_rights");
  });
});
