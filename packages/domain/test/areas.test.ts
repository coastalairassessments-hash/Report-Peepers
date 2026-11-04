import { describe, it, expect } from "vitest";
import example from "../../../docs/spec/example_case.json" with { type: "json" };
import type { Area } from "@report-peepers/contracts";
import { describeArea, areaKey, unaddressedAreas } from "../src/areas.js";
import { checkIntegrity } from "../src/integrity.js";

const STATUSES: Area["condition_status"][] = ["documented_impact", "possible_related_impact", "assessed_no_indicators_reported", "unassessed_inaccessible", "unclear_documentation", "conflicting_evidence"];
const area = (condition_status: Area["condition_status"], assessed_scope = "Visual check of the room during one visit."): Area =>
  ({ id: "A", name: "Closet", parent_id: null, kind: "room", condition_status, assessed_scope, time_context: null, basis_evidence_ids: ["EV-001"], uncertainties: [] });
const clone = () => structuredClone(example) as any;
const codes = (s: any) => checkIntegrity(s).map((i) => i.code);

describe("areas not examined", () => {
  it("TC009: a room the report never addresses is listed as not addressed, never clean or affected", () => {
    const areas = [area("documented_impact")];
    expect(unaddressedAreas(["Closet", "Master Bath", "master  bath", "Attic"], areas)).toEqual(["Master Bath", "Attic"]);
  });

  it("no status wording says clean, unaffected, safe, or contaminated", () => {
    for (const s of STATUSES) {
      const text = describeArea(area(s)).toLowerCase();
      for (const bad of ["clean", "unaffected", "safe", "contaminated"]) expect(text, `${s}: ${bad}`).not.toContain(bad);
    }
  });

  it("no indicators wording keeps the assessed scope and limits itself to it", () => {
    const t = describeArea(area("assessed_no_indicators_reported", "Visual check of the closet."));
    expect(t).toContain("Visual check of the closet.");
    expect(t).toContain("not a finding about anything outside that scope");
  });

  it("room names match across case, spacing, and punctuation", () => {
    expect(areaKey("Master Bath")).toBe(areaKey("master  bath"));
    expect(areaKey("Master-Bath!")).toBe(areaKey("master bath"));
  });

  it("no-indicators area without evidence is rejected", () => {
    const c = clone(); c.areas[0].condition_status = "assessed_no_indicators_reported"; c.areas[0].basis_evidence_ids = [];
    expect(codes(c)).toContain("area_no_indicators_without_basis");
  });

  it("contradicting evidence needs a conflicting status", () => {
    const c = clone();
    c.evidence.push({ ...structuredClone(c.evidence[0]), id: "EV-002", contradicts_ids: ["EV-001"] });
    expect(codes(c)).toContain("area_conflict_not_marked");
    c.areas[0].condition_status = "conflicting_evidence";
    expect(codes(c)).not.toContain("area_conflict_not_marked");
  });

  it("an area pointing at missing evidence is a dangling reference", () => {
    const c = clone(); c.areas[0].basis_evidence_ids = ["EV-404"];
    expect(codes(c)).toContain("dangling_reference");
  });
});
