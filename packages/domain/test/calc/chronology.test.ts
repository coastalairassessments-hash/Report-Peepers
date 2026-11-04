import { describe, it, expect } from "vitest";
import { splitByEvent, mixesAcrossEvent } from "../../src/calc/chronology.js";

const repair = "2026-03-10T12:00:00Z";

describe("chronology", () => {
  it("TC022: measurements before and after a repair are flagged as mixed", () => {
    const t = ["2026-03-01T09:00:00Z", "2026-03-20T09:00:00Z"];
    expect(mixesAcrossEvent(t, repair)).toEqual({ mixed: true, unknownCount: 0 });
    expect(splitByEvent(t, repair)).toMatchObject({ before: [0], after: [1] });
  });
  it("all-before is not mixed", () => {
    expect(mixesAcrossEvent(["2026-03-01T09:00:00Z", "2026-03-02T09:00:00Z"], repair).mixed).toBe(false);
  });
  it("missing times stay unknown and are counted, never placed before or after", () => {
    const s = splitByEvent([null, "2026-03-01T09:00:00Z"], repair);
    expect(s).toMatchObject({ unknown: [0], before: [1], after: [] });
    expect(mixesAcrossEvent([null, "2026-03-01T09:00:00Z"], repair)).toEqual({ mixed: false, unknownCount: 1 });
  });
  it("unreadable times are invalid, not guessed", () => {
    expect(splitByEvent(["last Tuesday", "2026-13-45T00:00:00Z"], repair).invalid).toEqual([0, 1]);
  });
  it("same instant as the event counts as before", () => {
    expect(splitByEvent([repair], repair).before).toEqual([0]);
  });
  it("offsets are applied when comparing", () => {
    // 2026-03-10T08:00-05:00 is 13:00Z, after a 12:00Z event
    expect(splitByEvent(["2026-03-10T08:00:00-05:00"], repair).after).toEqual([0]);
  });
  it("times without an offset are compared as UTC and counted", () => {
    expect(splitByEvent(["2026-03-01T09:00:00"], repair).assumedUtc).toBe(1);
  });
  it("an unreadable event time throws a clear error", () => {
    expect(() => splitByEvent(["2026-03-01T09:00:00Z"], "soon")).toThrow(/not a readable timestamp/);
  });
});
