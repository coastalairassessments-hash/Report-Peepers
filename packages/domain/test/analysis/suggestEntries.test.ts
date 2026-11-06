import { describe, it, expect } from "vitest";
import { suggestEntries } from "../../src/analysis/suggestEntries.js";
import type { SummaryRecord, SummaryRecordItem } from "../../src/analysis/record.js";

const item = (o: Partial<SummaryRecordItem> = {}): SummaryRecordItem => ({
  title: "Sample location not shown", question: "Where was each sample taken?", next_step: "Ask for the sample locations",
  wording_withheld: false, finding_type: "missing_information", decision_relevance: "high", evidence_strength: "moderate",
  pattern_code: "other", resolved_later: false, reviewer_changed: false, ...o,
});
let n = 0;
const rec = (items: SummaryRecordItem[], month = "2026-11"): SummaryRecord => ({ record_id: `r${++n}`, release_month: month, service_type: "limited_assessment", document_kinds: ["assessment"], items });
const opts = { min_records: 3, existing_questions: [] as string[] };

describe("suggested library entries", () => {
  it("drafts a stub when an 'other' question repeats in enough records, and always as ai_draft", () => {
    const rs = [rec([item()]), rec([item({ question: "where was  each sample taken?" })]), rec([item()], "2026-10"), rec([item({ pattern_code: "duration_without_basis" })])];
    const s = suggestEntries(rs, opts);
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ status: "ai_draft", production_enabled: false, homeowner_question: "Where was each sample taken?", seen_in_records: 3, title: "Sample location not shown" });
  });

  it("drafts nothing below the count, and never from withheld wording", () => {
    const w = item({ title: null, question: null, next_step: null, wording_withheld: true });
    expect(suggestEntries([rec([item()]), rec([item()])], opts)).toEqual([]);
    expect(suggestEntries([rec([w]), rec([w]), rec([w])], opts)).toEqual([]);
  });

  it("skips a question the library already asks", () => {
    const rs = [rec([item()]), rec([item()]), rec([item()])];
    expect(suggestEntries(rs, { ...opts, existing_questions: ["Where  was each sample taken?"] })).toEqual([]);
  });

  it("holds back wording that names a standard, gives a number, or breaks the customer-wording rule", () => {
    const bad = (q: string) => suggestEntries([rec([item({ question: q })]), rec([item({ question: q })]), rec([item({ question: q })])], opts);
    expect(bad("Was this done in line with ASTM D7338?")).toEqual([]);
    expect(bad("Was the area dried for 72 hours?")).toEqual([]);
    expect(bad("Is the property compliant?")).toEqual([]);
  });

  it("ignores items that already fit a pattern, and carries no record ids", () => {
    const s = suggestEntries([rec([item()]), rec([item()]), rec([item()])], opts);
    expect(JSON.stringify(s)).not.toMatch(/"r\d+"|record_id/);
    expect(suggestEntries([rec([item({ pattern_code: "duration_without_basis" })]), rec([item({ pattern_code: "duration_without_basis" })]), rec([item({ pattern_code: "duration_without_basis" })])], opts)).toEqual([]);
  });

  it("numbers stubs in a stable order and refuses a minimum under 2", () => {
    const a = item({ question: "Where was each sample taken?" }), b = item({ question: "Who analyzed the samples?", title: "Lab not named" });
    const rs = [rec([a, b]), rec([a, b]), rec([a, b]), rec([b])];
    const s = suggestEntries(rs, opts);
    expect(s.map((x) => x.id)).toEqual(["SUG-001", "SUG-002"]);
    expect(s[0]!.seen_in_records).toBeGreaterThanOrEqual(s[1]!.seen_in_records - 1);
    expect(() => suggestEntries(rs, { ...opts, min_records: 1 })).toThrow(/2 or more/);
  });
});
