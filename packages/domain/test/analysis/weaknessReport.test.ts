import { describe, it, expect } from "vitest";
import { weaknessReport, weaknessReportMarkdown, outcomeOf, type OutcomeRecord } from "../../src/analysis/weaknessReport.js";
import type { SummaryRecord, SummaryRecordItem } from "../../src/analysis/record.js";

const cut = { month: "2026-11", service_type: "limited_assessment" };
const out = (o: Partial<OutcomeRecord> = {}): OutcomeRecord => ({ release_month: "2026-11", service_type: "limited_assessment", outcome: "released", failed_gates: [], ...o });
const item = (o: Partial<SummaryRecordItem> = {}): SummaryRecordItem => ({
  title: "t", question: "q", next_step: "n", wording_withheld: false, finding_type: "missing_information", decision_relevance: "high",
  evidence_strength: "moderate", pattern_code: "duration_without_basis", resolved_later: false, reviewer_changed: false, ...o,
});
let n = 0;
const rec = (items: SummaryRecordItem[]): SummaryRecord => ({ record_id: `r${++n}`, release_month: "2026-11", service_type: "limited_assessment", document_kinds: ["assessment"], items });

describe("software weakness report", () => {
  it("counts released vs needs-attention and which gates stopped cases", () => {
    const outs = [
      out(), out(),
      out({ outcome: "needs_attention", failed_gates: ["scope_mismatch"] }),
      out({ outcome: "needs_attention", failed_gates: ["scope_mismatch", "lab_number_unread"] }),
      out({ outcome: "needs_attention", failed_gates: ["scope_mismatch"] }),
      out({ release_month: "2026-10" }),
    ];
    const r = weaknessReport(outs, [], 3, cut);
    if (r.suppressed) throw new Error("unexpected");
    expect(r.cases).toBe(5);
    expect(r.needs_attention).toBe(3);
    expect(r.released).toBe(2);
    expect(r.gates).toEqual([{ gate: "lab_number_unread", cases: null }, { gate: "scope_mismatch", cases: 3 }]);
  });

  it("counts withheld wording and 'other' tags from the saved summary records", () => {
    const outs = [out(), out(), out()];
    const recs = [rec([item({ wording_withheld: true, title: null, question: null, next_step: null }), item({ pattern_code: "other" })]), rec([item({ pattern_code: "other" })]), rec([item()])];
    const r = weaknessReport(outs, recs, 3, cut);
    if (r.suppressed) throw new Error("unexpected");
    expect(r.items_wording_withheld).toBe(1);
    expect(r.items_tagged_other).toBe(2);
  });

  it("is suppressed when fewer cases than the minimum", () => {
    expect(weaknessReport([out(), out()], [], 3, cut)).toEqual({ suppressed: true, min_group_size: 3 });
  });

  it("outcomeOf keeps gate ids only and never the detail text", () => {
    const o = outcomeOf({ release_month: "2026-11", service_type: "x" }, { ok: false, failed: [{ gate: "scope_mismatch", detail: "Smith residence at 12 Oak St" }] });
    expect(o).toEqual({ release_month: "2026-11", service_type: "x", outcome: "needs_attention", failed_gates: ["scope_mismatch"] });
    expect(JSON.stringify(o)).not.toMatch(/Smith|Oak/);
    expect(outcomeOf({ release_month: "2026-11", service_type: "x" }, { ok: true, failed: [] }).outcome).toBe("released");
  });

  it("refuses a gate id that is not a plain code, a bad month, and a minimum under 2", () => {
    expect(() => outcomeOf({ release_month: "2026-11", service_type: "x" }, { ok: false, failed: [{ gate: "Smith at 12 Oak", detail: "" }] })).toThrow(/gate/);
    expect(() => outcomeOf({ release_month: "2026-11-03", service_type: "x" }, { ok: true, failed: [] })).toThrow(/month/);
    expect(() => weaknessReport([], [], 1, cut)).toThrow(/2 or more/);
  });

  it("renders markdown", () => {
    const md = weaknessReportMarkdown(weaknessReport([out(), out(), out({ outcome: "needs_attention", failed_gates: ["scope_mismatch"] })], [], 3, cut), "2026-11", "limited_assessment");
    expect(md).toMatch(/scope_mismatch/);
    expect(md).toMatch(/Needs attention: 1/);
    expect(weaknessReportMarkdown({ suppressed: true, min_group_size: 3 }, "2026-11", "x")).toMatch(/too few/i);
  });
});
