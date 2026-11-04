import { describe, it, expect } from "vitest";
import { InMemoryRecordStore, isAllowedRecord } from "../../src/analysis/store.js";
import { countPatterns, loadAnalysisConfig } from "../../src/analysis/counts.js";
import { buildSummaryRecord, type SummaryRecord } from "../../src/analysis/record.js";
import { loadPatterns } from "../../src/analysis/patterns.js";
import { finding, viewOf } from "../render/helpers.js";

const patterns = loadPatterns();
const rec = (id: string, codes: string[], service = "limited_assessment"): SummaryRecord => {
  const v = { ...viewOf(codes.map((c, i) => finding({ id: `F-${i}`, title: `Item ${c}` }))), human_review: { status: "approved" as const, reviewer_id: "R", reviewer_scope: "x" } };
  const r = buildSummaryRecord(v, { release_month: "2026-11", service_type: service, document_kinds: ["assessment"] }, { pattern_codes: Object.fromEntries(codes.map((c, i) => [`F-${i}`, c])) }, [], patterns, () => id);
  if (!r.ok) throw new Error(r.reason);
  return r.record;
};

describe("record store", () => {
  it("keeps what it is given, as a copy, and refuses a duplicate id", async () => {
    const s = new InMemoryRecordStore(), r = rec("a", ["other"]);
    await s.save(r);
    r.items[0]!.title = "changed after saving";
    expect((await s.all())[0]!.items[0]!.title).not.toBe("changed after saving");
    await expect(s.save(rec("a", ["other"]))).rejects.toThrow(/already saved/);
  });

  it("refuses a record with any field the builder does not produce", async () => {
    const s = new InMemoryRecordStore();
    await expect(s.save({ ...rec("b", ["other"]), case_id: "CASE-1" } as never)).rejects.toThrow(/not allowed/);
    const withItemExtra = rec("c", ["other"]); (withItemExtra.items[0] as any).explanation = "leak";
    await expect(s.save(withItemExtra)).rejects.toThrow(/not allowed/);
    expect(isAllowedRecord({ ...rec("d", ["other"]), release_month: "2026-11-03" })).toBe(false);
    expect(await s.all()).toEqual([]);
  });

  it("a record holds no link to a case, so removing a case's documents leaves it alone", async () => {
    const s = new InMemoryRecordStore();
    const r = rec("e", ["duration_without_basis"]);
    await s.save(r);
    expect(JSON.stringify(await s.all())).not.toMatch(/REL-1|REV-1|CASE|DOC-001/);
    // nothing in the store's API deletes by case; the saved row is unchanged however the case is handled
    expect(await s.all()).toEqual([r]);
  });
});

describe("countPatterns", () => {
  const many = [...Array.from({ length: 6 }, (_, i) => rec(`r${i}`, ["duration_without_basis"])), rec("s1", ["photos_missing_or_undated"]), rec("s2", ["photos_missing_or_undated", "duration_without_basis"])];

  it("counts records per pattern, and a group below the minimum is hidden, never a number", () => {
    const r = countPatterns(many, 5);
    expect(r.patterns).toEqual([{ code: "duration_without_basis", records: 7 }, { code: "photos_missing_or_undated", records: null }]);
  });

  it("counts a record once per pattern even when it has several items with that pattern", () => {
    const r = countPatterns([rec("x", ["other", "other", "other"]), rec("y", ["other"])], 2);
    expect(r.patterns).toEqual([{ code: "other", records: 2 }]);
  });

  it("returns no totals, so a hidden group cannot be found by subtraction", () => {
    const r = countPatterns(many, 5);
    expect(Object.keys(r).sort()).toEqual(["min_group_size", "patterns"]);
    expect(JSON.stringify(r)).not.toMatch(/total|hidden_count|sum/i);
  });

  it("the filter applies the same minimum to the filtered set", () => {
    const mixed = [...many, rec("o1", ["duration_without_basis"], "screening"), rec("o2", ["duration_without_basis"], "screening")];
    expect(countPatterns(mixed, 5, { service_type: "screening" }).patterns).toEqual([{ code: "duration_without_basis", records: null }]);
  });

  it("refuses to run without a real minimum, and the shipped config is not set yet", () => {
    for (const bad of [0, 1, -3, 2.5, NaN]) expect(() => countPatterns(many, bad)).toThrow(/2 or more/);
    expect(() => loadAnalysisConfig()).toThrow(/not set/);
  });

  it("silently ignores items that have no pattern code (supported items)", () => {
    const supported = rec("z", ["other"]); supported.items[0]!.pattern_code = null;
    expect(countPatterns([supported], 2).patterns).toEqual([]);
  });
});
