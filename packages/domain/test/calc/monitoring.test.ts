import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { monitoringCoverage } from "../../src/calc/monitoring.js";

const pad = (n: number) => String(n).padStart(2, "0");
/** Readings every `step` minutes for the given 1-based days of a 7-day week in Jan 2026. */
function series(days: number[], step = 15): string[] {
  const out: string[] = [];
  for (const d of days) for (let m = 0; m < 1440; m += step) out.push(`2026-01-${pad(d)}T${pad(Math.floor(m / 60))}:${pad(m % 60)}:00Z`);
  return out;
}

describe("monitoring coverage", () => {
  it("TC014: a 7-day record with 4 days missing reports 3 complete days and the gap", () => {
    const r = monitoringCoverage(series([1, 2, 7]), 15);
    expect(r.status).toBe("ok");
    if (r.status !== "ok") return;
    expect(r.completeDays).toEqual(["2026-01-01", "2026-01-02", "2026-01-07"]);
    expect(r.partialDays).toEqual(["2026-01-03", "2026-01-04", "2026-01-05", "2026-01-06"]);
    expect(r.gaps).toHaveLength(1);
    expect(r.gaps[0]!.from).toBe("2026-01-02T23:45");
    expect(r.gaps[0]!.to).toBe("2026-01-07T00:00");
    expect(r.observedReadings).toBe(288);
    expect(r.expectedReadings).toBe(672);
    expect(r.coveragePercent).toBe(42.9);
  });

  it("a full 7-day record has 7 complete days and no gaps", () => {
    const r = monitoringCoverage(series([1, 2, 3, 4, 5, 6, 7]), 15);
    expect(r.status === "ok" && r.completeDays.length).toBe(7);
    expect(r.status === "ok" && r.gaps).toEqual([]);
    expect(r.status === "ok" && r.coveragePercent).toBe(100);
  });

  it("a series that starts mid-day has a partial first day", () => {
    const r = monitoringCoverage(series([1, 2]).slice(40), 15);
    expect(r.status === "ok" && r.partialDays).toEqual(["2026-01-01"]);
    expect(r.status === "ok" && r.completeDays).toEqual(["2026-01-02"]);
  });

  it("small clock jitter is not a gap", () => {
    const j = series([1]).map((s, i) => s.replace(":00Z", i % 2 ? ":20Z" : ":00Z"));
    const r = monitoringCoverage(j, 15);
    expect(r.status === "ok" && r.gaps).toEqual([]);
  });

  it("too few readings and bad intervals are not computable", () => {
    expect(monitoringCoverage(["2026-01-01T00:00:00Z"], 15)).toEqual({ status: "not_computable", reason: "too_few_readings" });
    expect(monitoringCoverage([], 15)).toEqual({ status: "not_computable", reason: "too_few_readings" });
    for (const i of [0, -5, NaN, Infinity]) expect(monitoringCoverage(series([1]), i)).toEqual({ status: "not_computable", reason: "invalid_interval" });
  });

  it("flags unsorted input, duplicates, invalid timestamps, mixed or missing offsets", () => {
    const s = series([1]);
    const messy = [s[5]!, s[2]!, s[2]!, "not a time", s[0]!, "2026-01-01T01:00:00-05:00", "2026-01-01T01:15:00"];
    const r = monitoringCoverage(messy, 15);
    expect(r.status).toBe("ok");
    if (r.status !== "ok") return;
    for (const f of ["unsorted_input", "duplicate_timestamps", "invalid_timestamp", "mixed_offsets", "no_timezone_in_timestamps"]) expect(r.flags).toContain(f);
  });

  it("never adds readings: observed never exceeds the distinct valid timestamps", () => {
    const s = series([1, 2]);
    const r = monitoringCoverage(s, 15);
    expect(r.status === "ok" && r.observedReadings).toBe(s.length);
  });

  it("property: coverage is within 0 to 100 and observed never exceeds the distinct input", () => {
    const stamp = fc.integer({ min: 0, max: 20 * 24 * 60 }).map((m) => `2026-02-${pad(1 + Math.floor(m / 1440))}T${pad(Math.floor((m % 1440) / 60))}:${pad(m % 60)}:00Z`);
    fc.assert(fc.property(fc.array(stamp, { maxLength: 200 }), fc.integer({ min: 1, max: 120 }), (ts, interval) => {
      const r = monitoringCoverage(ts, interval);
      if (r.status !== "ok") return true;
      return r.coveragePercent >= 0 && r.coveragePercent <= 100 && r.observedReadings <= new Set(ts).size;
    }), { numRuns: 300 });
  });
});
