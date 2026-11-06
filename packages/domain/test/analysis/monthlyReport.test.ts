import { describe, it, expect } from "vitest";
import { monthlyPatternReport, monthlyReportMarkdown } from "../../src/analysis/monthlyReport.js";
import type { SummaryRecord, SummaryRecordItem } from "../../src/analysis/record.js";

const item = (o: Partial<SummaryRecordItem> = {}): SummaryRecordItem => ({
  title: "Moisture readings not shown", question: "What were the readings, and where?", next_step: "Ask for the readings",
  wording_withheld: false, finding_type: "missing_information", decision_relevance: "high", evidence_strength: "moderate",
  pattern_code: "duration_without_basis", resolved_later: false, reviewer_changed: false, ...o,
});
let n = 0;
const rec = (items: SummaryRecordItem[], month = "2026-11", service = "limited_assessment"): SummaryRecord =>
  ({ record_id: `r${++n}`, release_month: month, service_type: service, document_kinds: ["assessment"], items });

describe("monthly pattern report", () => {
  it("counts patterns and questions for one month and one service type", () => {
    const rs = [
      rec([item(), item({ pattern_code: "other", question: "Who took the samples?" })]),
      rec([item()]),
      rec([item({ resolved_later: true })]),
      rec([item()], "2026-10"),            // other month: left out
      rec([item()], "2026-11", "full"),    // other service: left out
    ];
    const r = monthlyPatternReport(rs, 3, { month: "2026-11", service_type: "limited_assessment" });
    expect(r.suppressed).toBe(false);
    if (r.suppressed) return;
    expect(r.records).toBe(3);
    expect(r.patterns).toEqual([{ code: "duration_without_basis", records: 3 }, { code: "other", records: null }]);
    expect(r.questions).toEqual([{ question: "What were the readings, and where?", records: 3 }]);
    expect(r.items_resolved_later).toBe(1);
    expect(r.items_changed_by_reviewer).toBe(0);
  });

  it("says nothing but 'suppressed' when the group is smaller than the minimum", () => {
    const r = monthlyPatternReport([rec([item()]), rec([item()])], 3, { month: "2026-11", service_type: "limited_assessment" });
    expect(r).toEqual({ suppressed: true, min_group_size: 3 });
  });

  it("leaves out a question seen in fewer records than the minimum, and groups the same question written with different case or spacing", () => {
    const rs = [
      rec([item({ question: "What  were the readings, and where?" })]),
      rec([item({ question: "what were the readings, and where?" })]),
      rec([item({ question: "What were the readings, and where?" })]),
      rec([item({ question: "One-off question about a thing" })]),
    ];
    const r = monthlyPatternReport(rs, 3, { month: "2026-11", service_type: "limited_assessment" });
    if (r.suppressed) throw new Error("unexpected");
    expect(r.questions).toEqual([{ question: "What were the readings, and where?", records: 3 }]);
    expect(JSON.stringify(r)).not.toMatch(/One-off/);
  });

  it("never reads withheld wording and counts it separately", () => {
    const w = item({ title: null, question: null, next_step: null, wording_withheld: true });
    const r = monthlyPatternReport([rec([w]), rec([w]), rec([w])], 3, { month: "2026-11", service_type: "limited_assessment" });
    if (r.suppressed) throw new Error("unexpected");
    expect(r.questions).toEqual([]);
    expect(r.items_with_wording_withheld).toBe(3);
  });

  it("carries nothing but counts and the saved wording: no record ids", () => {
    const r = monthlyPatternReport([rec([item()]), rec([item()]), rec([item()])], 3, { month: "2026-11", service_type: "limited_assessment" });
    expect(JSON.stringify(r)).not.toMatch(/"r\d+"|record_id/);
  });

  it("refuses a minimum under 2 and a malformed month", () => {
    expect(() => monthlyPatternReport([], 1, { month: "2026-11", service_type: "x" })).toThrow(/2 or more/);
    expect(() => monthlyPatternReport([], 3, { month: "2026-11-03", service_type: "x" })).toThrow(/month/);
  });

  it("renders a plain markdown view, and a short note when suppressed", () => {
    const rs = [rec([item()]), rec([item()]), rec([item()])];
    const md = monthlyReportMarkdown(monthlyPatternReport(rs, 3, { month: "2026-11", service_type: "limited_assessment" }), "2026-11", "limited_assessment");
    expect(md).toMatch(/2026-11/);
    expect(md).toMatch(/duration_without_basis/);
    expect(md).toMatch(/What were the readings, and where\?/);
    expect(monthlyReportMarkdown({ suppressed: true, min_group_size: 3 }, "2026-11", "x")).toMatch(/too few/i);
  });
});
