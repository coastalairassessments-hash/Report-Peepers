import { describe, it, expect } from "vitest";
import { ratioRecord, coverageRecord, moistureRecord, type CalcRecord } from "../../src/calc/record.js";
import { indoorOutdoorRatio } from "../../src/calc/ratio.js";
import { monitoringCoverage } from "../../src/calc/monitoring.js";
import { describeMoisture } from "../../src/calc/moisture.js";

const U = "structures/m3";
const REQUIRED: (keyof CalcRecord)[] = ["id", "kind", "derived", "status", "formula", "inputs", "units", "rounding", "result", "limitations", "source_evidence_ids"];

describe("calculation records", () => {
  it("every record carries formula, inputs, units, rounding, limitations, and source evidence", () => {
    const inputs = { indoor: 5027, outdoor: 53 };
    const recs = [
      ratioRecord("CALC-1", inputs, indoorOutdoorRatio({ kind: "detected", value: 5027, unit: U }, { kind: "detected", value: 53, unit: U }, { indoor: { type: "total" }, outdoor: { type: "total" } }), ["EV-1"]),
      coverageRecord("CALC-2", { intervalMinutes: 15 }, monitoringCoverage(["2026-01-01T00:00:00Z", "2026-01-01T00:15:00Z"], 15), ["EV-2"]),
      moistureRecord("CALC-3", { value: 80 }, describeMoisture(80, "percent_moisture_content"), ["EV-3"]),
    ];
    for (const r of recs) {
      for (const k of REQUIRED) expect(r, `${r.id} missing ${k}`).toHaveProperty(k);
      expect(r.derived).toBe(true);
      expect(r.source_evidence_ids.length).toBeGreaterThan(0);
    }
    expect(recs[0]!.result).toEqual({ ratio: 94.8 });
  });

  it("a 'not computable' outcome is stored as a record with the reason", () => {
    const nd = { kind: "nondetect", unit: U } as const;
    const r = ratioRecord("CALC-4", {}, indoorOutdoorRatio({ kind: "detected", value: 5027, unit: U }, nd, { indoor: { type: "total" }, outdoor: { type: "total" } }), ["EV-1"]);
    expect(r).toMatchObject({ status: "not_computable", result: { reason: "outdoor_nondetect" }, units: null });
    expect(r.limitations[0]).toContain("not zero");
    const m = moistureRecord("CALC-5", { value: 80 }, describeMoisture(80, "comparative"), ["EV-3"]);
    expect(m).toMatchObject({ status: "not_computable", result: { reason: "comparative_scale" } });
    const c = coverageRecord("CALC-6", {}, monitoringCoverage([], 15), []);
    expect(c).toMatchObject({ status: "not_computable", result: { reason: "too_few_readings" } });
  });
});
