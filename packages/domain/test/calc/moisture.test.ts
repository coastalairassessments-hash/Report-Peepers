import { describe, it, expect } from "vitest";
import { describeMoisture } from "../../src/calc/moisture.js";

describe("moisture scale guard", () => {
  it("TC017: 80 on a comparative scale is never published as percent moisture content", () => {
    const r = describeMoisture(80, "comparative");
    expect(r).toMatchObject({ status: "not_computable", reason: "comparative_scale" });
    expect(r.label).toContain("meter reading 80");
    expect(r.label.toLowerCase()).not.toContain("percent");
  });
  it("an unknown scale is not converted", () => {
    expect(describeMoisture(80, "unknown")).toMatchObject({ status: "not_computable", reason: "unknown_scale" });
  });
  it("percent moisture content is described as reported", () => {
    expect(describeMoisture(18, "percent_moisture_content")).toMatchObject({ status: "ok", isMoistureContent: true });
  });
  it("wood moisture equivalent is labeled as such and is not moisture content", () => {
    const r = describeMoisture(18, "wood_moisture_equivalent");
    expect(r).toMatchObject({ status: "ok", isMoistureContent: false });
    expect(r.label).toContain("wood moisture equivalent");
  });
  it("NaN, negative, and non-numbers are invalid", () => {
    for (const v of [NaN, -1, Infinity, "80" as unknown as number]) expect(describeMoisture(v, "percent_moisture_content"), String(v)).toMatchObject({ reason: "invalid_value" });
  });
});
