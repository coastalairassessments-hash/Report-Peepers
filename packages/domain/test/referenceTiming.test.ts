import { describe, it, expect } from "vitest";
import example from "../../../docs/spec/example_case.json" with { type: "json" };
import { checkReferenceUse, type ReferenceTiming } from "../src/referenceTiming.js";

const ref = (over: any = {}) => ({ id: "REF-1", publisher: "P", title: "T", edition: "2024", official_url: "https://example.org", authority_type: "guidance", ai_use_status: "authorized", permission_record_id: "PR-1", allowed_uses: ["output_reference"], effective_context: "Residential reports", reviewed_at: null, ...over });
const binding = (verified = true) => ({ reference_id: "REF-1", verified_locator: null, relevance_explanation: "x", support_verified: verified, applicability_verified: verified, permission_verified: verified, verified_by: verified ? "r1" : null });
const finding = (type: string, verified = true) => ({ ...(structuredClone((example as any).findings[0])), finding_type: type, reference_bindings: [binding(verified)] });
const timing = (over: Partial<ReferenceTiming> = {}): ReferenceTiming => ({ reference_id: "REF-1", publication_status: "published", published_on: "2024-06-01", ...over });
const codes = (f: any, refs: any[], t: ReferenceTiming[], issued: string | null) => checkReferenceUse(f, refs, t, issued).map((i) => i.code);

describe("reference timing and draft sources", () => {
  it("TC041: a draft source with a verified binding is not citable", () => {
    expect(codes(finding("clarification_needed"), [ref()], [timing({ publication_status: "draft" })], "2022-05-01")).toContain("reference_draft_not_citable");
  });

  it("TC040: an edition published after the report cannot support a verified departure", () => {
    expect(codes(finding("verified_reference_departure"), [ref()], [timing()], "2022-05-01")).toContain("reference_postdates_report");
    expect(codes(finding("clarification_needed"), [ref()], [timing()], "2022-05-01")).toEqual([]);
  });

  it("an edition published before the report is fine for a departure", () => {
    expect(codes(finding("verified_reference_departure"), [ref()], [timing({ published_on: "2021-01-01" })], "2022-05-01")).toEqual([]);
  });

  it("missing or unreadable dates block a departure and never throw", () => {
    for (const issued of [null, "sometime in 2022", ""]) expect(codes(finding("verified_reference_departure"), [ref()], [timing()], issued), String(issued)).toContain("reference_timing_unknown");
    expect(codes(finding("verified_reference_departure"), [ref()], [timing({ published_on: null })], "2022-05-01")).toContain("reference_timing_unknown");
    expect(codes(finding("verified_reference_departure"), [ref({ edition: null })], [], "2022-05-01")).toContain("reference_timing_unknown");
  });

  it("a withdrawn source needs an explicit historical context", () => {
    const t = [timing({ publication_status: "withdrawn" })];
    expect(codes(finding("clarification_needed"), [ref()], t, "2022-05-01")).toContain("reference_withdrawn_needs_historical_context");
    expect(codes(finding("clarification_needed"), [ref({ effective_context: "Historical context only, for older reports" })], t, "2022-05-01")).not.toContain("reference_withdrawn_needs_historical_context");
  });

  it("a candidate binding that is not yet verified is not flagged", () => {
    expect(codes(finding("clarification_needed", false), [ref()], [], null)).toEqual([]);
  });
});
