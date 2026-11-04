import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { indoorOutdoorRatio, type Measured, type Basis } from "../../src/calc/ratio.js";

const U = "structures/m3";
const det = (value: number, rawCount?: number): Measured => ({ kind: "detected", value, unit: U, ...(rawCount !== undefined ? { rawCount } : {}) });
const nd: Measured = { kind: "nondetect", unit: U };
const total: Basis = { type: "total" };
const both = (b: Basis = total) => ({ indoor: b, outdoor: b });

describe("indoor/outdoor ratio", () => {
  it("5027 over 53 is about 95, with formula and rounding recorded", () => {
    const r = indoorOutdoorRatio(det(5027), det(53), both());
    expect(r).toMatchObject({ status: "ok", ratio: 94.8, formula: "indoor / outdoor", unit: U });
    if (r.status === "ok") expect(r.limitations.join(" ")).toContain("not a health or severity threshold");
  });

  it("outdoor nondetect is not computable, never Infinity", () => {
    expect(indoorOutdoorRatio(det(5027), nd, both())).toMatchObject({ status: "not_computable", reason: "outdoor_nondetect" });
  });

  it("indoor nondetect is not computable, not a ratio of zero", () => {
    expect(indoorOutdoorRatio(nd, det(53), both())).toMatchObject({ status: "not_computable", reason: "indoor_nondetect" });
  });

  it("zero, negative, NaN, and Infinity are invalid values", () => {
    for (const v of [0, -5, NaN, Infinity]) expect(indoorOutdoorRatio(det(100), det(v), both()), String(v)).toMatchObject({ reason: "invalid_value" });
  });

  it("unknown values are not computable", () => {
    expect(indoorOutdoorRatio({ kind: "unknown" }, det(5), both())).toMatchObject({ reason: "unknown_value" });
  });

  it("total versus a single group is refused, and the same group matches", () => {
    const g: Basis = { type: "group", name: "Aspergillus/Penicillium-like" };
    expect(indoorOutdoorRatio(det(5013), det(4), { indoor: g, outdoor: total })).toMatchObject({ reason: "basis_mismatch" });
    expect(indoorOutdoorRatio(det(5013), det(4), { indoor: g, outdoor: { ...g, name: " aspergillus/penicillium-like " } }).status).toBe("ok");
  });

  it("different units are refused", () => {
    const swab: Measured = { kind: "detected", value: 5, unit: "structures/cm2" };
    expect(indoorOutdoorRatio(det(100), swab, both())).toMatchObject({ reason: "unit_mismatch" });
  });

  it("low outdoor raw count is noted only when a threshold is supplied", () => {
    const withT = indoorOutdoorRatio(det(5027), det(53, 4), both(), { lowRawCountAtOrBelow: 5 });
    expect(withT.status === "ok" && withT.limitations.join(" ")).toContain("Low outdoor raw count (4)");
    const none = indoorOutdoorRatio(det(5027), det(53, 4), both());
    expect(none.status === "ok" && none.limitations.join(" ")).not.toContain("Low outdoor raw count");
  });

  it("extreme values give out_of_range, not Infinity or zero", () => {
    expect(indoorOutdoorRatio(det(1e308), det(1e-308), both())).toMatchObject({ reason: "out_of_range" });
    expect(indoorOutdoorRatio(det(1e-308), det(1e308), both())).toMatchObject({ reason: "out_of_range" });
  });

  it("property: never NaN or Infinity, and ok always means a positive finite ratio", () => {
    const num = fc.oneof(fc.double({ noNaN: false }), fc.constantFrom(0, -1, NaN, Infinity, -Infinity, 1e308, 1e-308));
    const measured = fc.oneof(
      num.map((value): Measured => ({ kind: "detected", value, unit: U })),
      fc.constant(nd), fc.constant<Measured>({ kind: "unknown" }),
    );
    fc.assert(fc.property(measured, measured, (a, b) => {
      const r = indoorOutdoorRatio(a, b, both());
      if (r.status === "ok") return Number.isFinite(r.ratio) && r.ratio > 0;
      return true;
    }), { numRuns: 500 });
  });
});
