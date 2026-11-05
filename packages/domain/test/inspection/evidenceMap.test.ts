import { describe, it, expect } from "vitest";
import { buildEvidenceMap, loadEvidenceMapConfig } from "../../src/inspection/evidenceMap.js";

const cfg = loadEvidenceMapConfig();
const A = (id: string, name: string, parent: string | null = "AREA-ALL") => ({ id, name, parent_id: parent, kind: parent ? "room" : "building" }) as any;
const E = (id: string, statement: string, area: string, origin = "report_author", page = 1) => ({ id, statement, origin, area_ids: [area], anchor: { pdf_page_index_1based: page } }) as any;
const C = (id: string, claim_type: string, text: string, area: string, page = 1) => ({ id, claim_type, text, area_ids: [area], source_anchor: { pdf_page_index_1based: page } }) as any;
const WHOLE = A("AREA-ALL", "Whole report", null);

describe("the evidence map", () => {
  it("sorts a room's statements into seen, measured, sampled, concluded and recommended", () => {
    const snap = { areas: [WHOLE, A("R1", "Living Room")], evidence: [E("e1", "Staining on the baseboard", "R1"), E("e2", "Moisture meter reading 28% at the wall base", "R1"), E("e3", "Aspergillus 1,267 spores", "R1", "laboratory"), E("e4", "Air sample taken in the room", "R1")], claims: [C("c1", "cause", "Duct condensation", "R1"), C("c2", "remediation", "Remove the wall covering", "R1")] };
    const m = buildEvidenceMap(snap, cfg).find((x) => x.area_id === "R1")!;
    expect(m.cells.seen).toEqual(["e1"]);
    expect(m.cells.measured).toEqual(["e2"]);
    expect(m.cells.sampled.sort()).toEqual(["e3", "e4"]);
    expect(m.cells.cause).toEqual(["c1"]);
    expect(m.cells.concluded).toEqual(["c1"]);
    expect(m.cells.recommended).toEqual(["c2"]);
    expect(m.gaps).toEqual([]);
  });

  it("a recommendation with no reading and no sample behind it is a material gap in that room", () => {
    const snap = { areas: [WHOLE, A("R1", "Living Room")], evidence: [E("e1", "Mold growth behind the baseboard", "R1")], claims: [C("c2", "remediation", "Remove the wall covering", "R1", 22)] };
    const g = buildEvidenceMap(snap, cfg).find((x) => x.area_id === "R1")!.gaps;
    expect(g).toHaveLength(1);
    expect(g[0]).toMatchObject({ rule: "recommendation_without_measure_or_sample", material: true, topic: "Recommendation has support", page: 22, claim_ids: ["c2"] });
  });

  it("a cause with no reading is material only when a recommendation leans on it", () => {
    const base = { areas: [WHOLE, A("R1", "Kitchen")], evidence: [E("e1", "Staining on the cabinet", "R1"), E("e2", "Air sample taken", "R1")] };
    const minor = buildEvidenceMap({ ...base, claims: [C("c1", "cause", "A pipe leak", "R1")] }, cfg).find((x) => x.area_id === "R1")!.gaps;
    expect(minor).toMatchObject([{ rule: "cause_without_measure", material: false }]);
    const material = buildEvidenceMap({ ...base, claims: [C("c1", "cause", "A pipe leak", "R1"), C("c2", "remediation", "Remove cabinets", "R1")] }, cfg).find((x) => x.area_id === "R1")!.gaps;
    expect(material.find((x) => x.rule === "cause_without_measure")).toMatchObject({ material: true });
  });

  it("a conclusion about a room with nothing seen, measured or sampled is a minor gap", () => {
    const snap = { areas: [WHOLE, A("R1", "Attic")], evidence: [], claims: [C("c1", "extent", "Growth covers the attic", "R1")] };
    expect(buildEvidenceMap(snap, cfg).find((x) => x.area_id === "R1")!.gaps).toMatchObject([{ rule: "conclusion_without_anything_behind_it", material: false }]);
  });

  it("the whole-report area is shown but never gets room-level gaps", () => {
    const snap = { areas: [WHOLE], evidence: [], claims: [C("c2", "remediation", "Clean the whole home", "AREA-ALL")] };
    const m = buildEvidenceMap(snap, cfg);
    expect(m[0]!.area_id).toBe("AREA-ALL");
    expect(m[0]!.gaps).toEqual([]);
  });

  it("a room with a measurement or a sample behind its recommendation has no gap", () => {
    const snap = { areas: [WHOLE, A("R1", "Dining Room")], evidence: [E("e1", "Air sample taken in the room", "R1")], claims: [C("c2", "remediation", "Remove the wall covering", "R1")] };
    expect(buildEvidenceMap(snap, cfg).find((x) => x.area_id === "R1")!.gaps).toEqual([]);
  });

  it("bad patterns stop the program at load", async () => {
    const { writeFileSync, mkdtempSync } = await import("node:fs");
    const { join } = await import("node:path"); const { tmpdir } = await import("node:os");
    const d = mkdtempSync(join(tmpdir(), "em-")); const p = join(d, "x.json");
    writeFileSync(p, JSON.stringify({ measured_patterns: ["("], sample_patterns: [], rules: [] }));
    expect(() => loadEvidenceMapConfig(p)).toThrow(/evidence_map.json/);
  });
});
