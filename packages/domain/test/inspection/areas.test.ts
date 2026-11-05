import { describe, it, expect } from "vitest";
import { buildAreas } from "../../src/inspection/areas.js";

const WHOLE = { id: "AREA-ALL", name: "Whole report" };
describe("rooms named in the report", () => {
  it("groups labels that differ only in case, spacing, or punctuation, and keeps the first spelling", () => {
    const r = buildAreas({ "E1": "Living Room", "E2": "LIVING  ROOM:", "C1": "Master Bedroom" }, WHOLE);
    expect(r.areas.map((a) => a.name)).toEqual(["Living Room", "Master Bedroom"]);
    expect(r.areaIdsFor("E1")).toEqual(r.areaIdsFor("E2"));
    expect(r.areaIdsFor("E1")).not.toEqual(r.areaIdsFor("C1"));
  });
  it("items with no label stay in the whole-report area", () => {
    const r = buildAreas({ E1: "Kitchen" }, WHOLE);
    expect(r.areaIdsFor("E9")).toEqual(["AREA-ALL"]);
  });
  it("each room hangs under the whole-report area and starts as unclear documentation", () => {
    const r = buildAreas({ E1: "Kitchen" }, WHOLE);
    expect(r.areas[0]).toMatchObject({ parent_id: "AREA-ALL", kind: "room", condition_status: "unclear_documentation" });
  });
  it("ids are stable and safe", () => {
    const r = buildAreas({ E1: "Dining Room / NW Corner (north)" }, WHOLE);
    expect(r.areas[0]!.id).toMatch(/^AREA-[A-Z0-9-]{1,60}$/);
    expect(buildAreas({ E1: "Dining Room / NW Corner (north)" }, WHOLE).areas[0]!.id).toBe(r.areas[0]!.id);
  });
  it("caps the number of rooms; extras fall back to the whole-report area", () => {
    const labels: Record<string, string> = {};
    for (let i = 0; i < 5; i++) labels[`E${i}`] = `Room number ${i}`;
    const r = buildAreas(labels, WHOLE, 3);
    expect(r.areas).toHaveLength(3);
    expect(r.areaIdsFor("E4")).toEqual(["AREA-ALL"]);
  });
});
