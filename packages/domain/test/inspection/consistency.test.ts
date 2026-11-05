import { describe, it, expect } from "vitest";
import { checkConsistency, loadConsistencyConfig, type ConsistencyFlag } from "../../src/inspection/consistency.js";
import { read } from "../render/helpers.js";
import type { PageSpec } from "../ingest/fixtures.js";

const cfg = loadConsistencyConfig();
const anchor = (text: string, page = 1) => ({ document_version_id: "DOC-001-v1", pdf_page_index_1based: page, exact_text: text, extraction_method: "native_text", bbox_normalized: null }) as any;
const E = (id: string, statement: string, page = 1) => ({ id, origin: "report_author", statement, anchor: anchor(statement, page), area_ids: [], observed_time: null, time_basis: "unknown", quality_status: "usable", contradicts_ids: [] }) as any;
const C = (id: string, text: string, claim_type = "observation", basis: string[] = ["E1"], strength = "probable") => ({ id, text, claim_type, basis_evidence_ids: basis, area_ids: [], source_anchor: anchor(text), strength_in_report: strength }) as any;
const checks = (fs: ConsistencyFlag[]) => fs.map((f) => f.check).sort();
const run = (evidence: any[], claims: any[] = [], read = true) => checkConsistency({ evidence, claims }, null, cfg, read);

describe("moisture", () => {
  it("wet without any reading is flagged; a reading anywhere clears it", () => {
    const wet = E("E1", "The north wall in the conference room was wet.");
    expect(checks(run([wet]))).toContain("wet_without_reading");
    expect(checks(run([wet, E("E2", "Moisture reading of 28 percent on the north wall.")]))).not.toContain("wet_without_reading");
  });
  it("'no moisture' is not a wet claim", () => {
    expect(checks(run([E("E1", "No elevated moisture was detected at the time of assessment.")]))).not.toContain("wet_without_reading");
  });
  it("a reading with no dry standard is flagged; naming one clears it", () => {
    const r = E("E1", "Moisture reading of 28 percent on the north wall.");
    expect(checks(run([r]))).toContain("reading_without_dry_standard");
    expect(checks(run([r, E("E2", "A dry reference reading was taken in the hall.")]))).not.toContain("reading_without_dry_standard");
  });
  it("thermal imaging used for moisture with no meter reading is flagged", () => {
    const t = E("E1", "Thermal imaging readings show a temperature difference which might indicate a water leak.");
    expect(checks(run([t]))).toContain("thermal_without_meter");
    expect(checks(run([t, E("E2", "Meter reading of 30 percent at the same spot.")]))).not.toContain("thermal_without_meter");
  });
});

describe("sampling", () => {
  it("surface samples with no control from a similar surface are flagged", () => {
    const s = E("E1", "Surface sample taken on the conference room north wall.");
    expect(checks(run([s, E("E2", "Outside control sample collected.")]))).toContain("surface_sample_without_control");
    expect(checks(run([s, E("E2", "A comparison surface sample was taken from a clean wall of the same type.")]))).not.toContain("surface_sample_without_control");
  });
  it("air samples with no outdoor comparison are flagged", () => {
    const a = E("E1", "Air sample taken in the master suite.");
    expect(checks(run([a]))).toContain("air_without_outdoor_comparison");
    expect(checks(run([a, E("E2", "Outside control sample result for Cladosporium was 773 spores/m3.")]))).not.toContain("air_without_outdoor_comparison");
  });
  it("a sample from inside a cabinet described as the home's air is flagged", () => {
    const f = run([E("E1", "x")], [C("C1", "The airborne sample from the kitchen sink cabinet shows the interior of the residence is elevated.")]);
    expect(checks(f)).toContain("enclosed_air_read_as_room_air");
  });
  it("'everything must be read' checks stay silent when a page was not read", () => {
    const f = run([E("E1", "The wall was wet."), E("E2", "Air sample taken in the master suite."), E("E3", "Surface sample taken.")], [], false);
    expect(checks(f)).toEqual([]);
  });
});

describe("interpretation and recommendations", () => {
  it("a number or 'safe' used as a dividing line is flagged", () => {
    const f = run([E("E1", "x")], [C("C1", "The fungal load will exceed 1,000 aggregate fungal spores per cubic meter and be considered elevated.", "other")]);
    expect(checks(f)).toContain("number_used_as_standard");
    expect(checks(run([E("E1", "x")], [C("C1", "The home is safe to occupy.", "health")]))).toEqual(expect.arrayContaining(["number_used_as_standard", "health_statement"]));
  });
  it("a flat cause resting only on hedged evidence is flagged", () => {
    const f = run([E("E1", "The stain may indicate a roof leak.")], [C("C1", "A roof leak caused the stain.", "cause", ["E1"], "categorical")]);
    expect(checks(f)).toContain("firmer_than_evidence");
  });
  it("a recommendation resting on no observation, reading or sample is flagged", () => {
    const f = run([E("E1", "The company has been in business for many years.")], [C("C1", "Remove all drywall.", "remediation", ["E1"])]);
    expect(checks(f)).toContain("recommendation_without_support");
    const ok = run([E("E1", "Visible growth was noted on the north wall.")], [C("C1", "Remove the drywall on the north wall.", "remediation", ["E1"])]);
    expect(checks(ok)).not.toContain("recommendation_without_support");
  });
  it("treatment-only recommendations are flagged; mentioning removal clears it", () => {
    const fog = C("C1", "Fog the area with a fungicide.", "remediation", ["E1"]);
    const ev = E("E1", "Visible growth on the wall.");
    expect(checks(run([ev], [fog]))).toContain("treatment_without_removal");
    expect(checks(run([ev], [fog, C("C2", "Remove the damaged carpet.", "remediation", ["E1"])]))).not.toContain("treatment_without_removal");
  });
  it("every flag names the checklist topics it bears on, and each topic exists", async () => {
    const { loadChecklist } = await import("../../src/inspection/checklist.js");
    const topics = new Set(loadChecklist().items.map((i) => i.topic));
    const f = run([E("E1", "The wall was wet."), E("E2", "Air sample taken."), E("E3", "Surface sample taken.")], [C("C1", "The home is safe.", "health")]);
    for (const x of f) for (const t of x.item_topics) expect(topics.has(t), t).toBe(true);
  });
});

describe("a figure cited for one location that sits under another in the lab table", () => {
  const page: PageSpec = { puts: [
    "Location: Kitchen Sink Cabinet", "Chaetomium 1,094,400", "Location: A/C Closet", "Stachybotrys 63,373", "Chaetomium 13",
  ].map((text, i) => ({ text, x: 72, y: 730 - i * 14, size: 10 })) };
  it("flags the mislabeled figure", async () => {
    const { doc } = await read([page]);
    const f = checkConsistency({ evidence: [E("E1", "Chaetomium 1,094,400")], claims: [C("C1", "The A/C Closet sample showed 1,094,400 spores/m3 of Chaetomium.")] }, doc, cfg);
    expect(f.find((x) => x.check === "value_under_other_location")?.detail).toMatch(/kitchen sink cabinet/i);
  });
  it("is quiet when the figure sits under the location the claim names", async () => {
    const { doc } = await read([page]);
    const f = checkConsistency({ evidence: [E("E1", "Chaetomium 1,094,400")], claims: [C("C1", "The Kitchen Sink Cabinet sample showed 1,094,400 spores/m3 of Chaetomium.")] }, doc, cfg);
    expect(checks(f)).not.toContain("value_under_other_location");
  });
});

describe("config", () => {
  it("a lexicon pattern that does not compile stops the program", async () => {
    const { writeFileSync, mkdtempSync, readFileSync } = await import("node:fs");
    const { tmpdir } = await import("node:os"); const { join, resolve } = await import("node:path");
    const raw = JSON.parse(readFileSync(resolve(import.meta.dirname, "../../../../data/rules/consistency.json"), "utf8"));
    raw.wet_words = ["(unclosed"];
    const p = join(mkdtempSync(join(tmpdir(), "cc-")), "c.json"); writeFileSync(p, JSON.stringify(raw));
    expect(() => loadConsistencyConfig(p)).toThrow(/bad pattern/);
  });
});
