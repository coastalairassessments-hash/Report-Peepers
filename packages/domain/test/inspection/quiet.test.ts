import { describe, it, expect } from "vitest";
import { checkConsistency, loadConsistencyConfig } from "../../src/inspection/consistency.js";
import { checkSelfConsistency, loadSelfConsistencyConfig } from "../../src/inspection/selfConsistency.js";
import { buildEvidenceMap, loadEvidenceMapConfig } from "../../src/inspection/evidenceMap.js";
import { loadGapWording } from "../../src/inspection/gaps.js";
import { read } from "../render/helpers.js";
import type { PageSpec } from "../ingest/fixtures.js";

// Every rule needs a sample where it must stay quiet. A new rule with no sample fails the meta-test at the bottom.
const consistency = loadConsistencyConfig(), self = loadSelfConsistencyConfig(), mapCfg = loadEvidenceMapConfig();
const page = (ls: string[]): PageSpec => ({ puts: ls.map((text, i) => ({ text, x: 40, y: 740 - i * 13, size: 9 })) });
const anchor = (text: string) => ({ document_version_id: "DOC-001-v1", pdf_page_index_1based: 1, exact_text: text, extraction_method: "native_text", bbox_normalized: null }) as any;
const E = (id: string, statement: string, area = "R1") => ({ id, origin: "report_author", statement, anchor: anchor(statement), area_ids: [area], observed_time: null, time_basis: "unknown", quality_status: "usable" }) as any;
const C = (id: string, text: string, claim_type = "observation", basis: string[] = ["E1"], strength = "probable") => ({ id, text, claim_type, basis_evidence_ids: basis, area_ids: ["R1"], source_anchor: anchor(text), strength_in_report: strength }) as any;

// A sound report: a reading against a dry standard, an air sample with an outdoor comparison, one cause, one recommendation, one lab, one date.
const SOUND = [page([
  "LIVING ROOM", "Moisture meter reading 28% at the wall base, against a dry reading of 9%.",
  "An air sample was taken in the living room. Outside control sample result for Cladosporium was 773 spores/m3.",
  "Visible growth was noted on the wall. It is recommended that the water damaged building materials be removed.",
  "The cause of the water damage was leaking ductwork in the attic.", "Date of Inspection: July 25, 2025", "Sampled: 07-25-25", "Laboratory: Sporelytics",
  "Analytical Report. Chain of Custody attached. Total spores per cubic meter.",
])];
const soundEvidence = [E("E1", "Visible growth was noted on the north wall."), E("E2", "Moisture meter reading of 28 percent on the north wall."), E("E3", "A dry reference reading was taken in the hall."), E("E4", "Air sample taken in the master suite."), E("E5", "Outside control sample result for Cladosporium was 773 spores/m3.")];
const flagsOnSound = () => checkConsistency({ evidence: soundEvidence, claims: [C("C1", "Remove the drywall on the north wall.", "remediation", ["E1"])] }, null, consistency, true).map((f) => f.check);
const selfOnSound = async () => { const { doc } = await read(SOUND); return checkSelfConsistency(doc, self).map((c) => c.check); };
const mapOn = (evidenceIds: string[]) => {
  const A = (id: string, name: string) => ({ id, name, kind: id === "AREA-ALL" ? "whole" : "room", condition_status: "unclear_documentation" }) as any;
  const ev = (id: string, statement: string, origin = "report_author") => ({ ...E(id, statement), origin, area_ids: ["R1"] });
  const snap = { areas: [A("AREA-ALL", "Whole report"), A("R1", "Living Room")], evidence: [ev("e1", "Staining on the baseboard"), ev("e2", "Moisture meter reading 28% at the wall base"), ev("e4", "Air sample taken in the room")].filter((e) => evidenceIds.includes(e.id)), claims: [{ ...C("c1", "A pipe leak", "cause", ["e2"]), area_ids: ["R1"] }, { ...C("c2", "Remove the wall covering", "remediation", ["e2"]), area_ids: ["R1"] }] } as any;
  return buildEvidenceMap(snap, mapCfg).flatMap((m) => m.gaps.map((g) => g.rule));
};

const mapOnSound = () => mapOn(["e1", "e2", "e4"]);

const QUIET: Record<string, () => string[] | Promise<string[]>> = {};
for (const id of ["air_without_outdoor_comparison", "enclosed_air_read_as_room_air", "firmer_than_evidence", "health_statement", "number_used_as_standard", "reading_without_dry_standard", "recommendation_without_support", "surface_sample_without_control", "remediation_on_samples_alone", "thermal_without_meter", "treatment_without_removal", "value_under_other_location", "wet_without_reading"]) QUIET[id] = flagsOnSound;
for (const id of ["dates_disagree", "two_lab_names", "defined_never_used", "time_spans_differ", "result_contradicts_threshold", "baseline_labeled_elevated", "narrative_material_without_reading", "referenced_not_supplied"]) QUIET[id] = selfOnSound;
for (const id of ["recommendation_without_measure_or_sample", "recommendation_on_samples_alone", "cause_without_measure", "conclusion_without_anything_behind_it"]) QUIET[id] = mapOnSound;

describe("every rule has a sample where it must stay quiet", () => {
  const wording = loadGapWording();
  const ids = [...Object.keys(wording.checks), ...Object.keys(wording.map)];
  it("the registry and the wording file name the same rules", () => {
    expect(Object.keys(QUIET).sort()).toEqual([...ids].sort());
  });
  for (const id of ids) it(`${id} stays quiet on a sound report`, async () => {
    const fired = await QUIET[id]!();
    expect(fired).not.toContain(id);
  });
  it("control: the same map does fire when the reading and sample are taken away", () => {
    expect(mapOn(["e1"])).toContain("recommendation_without_measure_or_sample");
  });
  it("the sound report is sound: nothing at all fires on it", async () => {
    expect(await selfOnSound()).toEqual([]);
    expect(mapOnSound()).toEqual([]);
  });
});
