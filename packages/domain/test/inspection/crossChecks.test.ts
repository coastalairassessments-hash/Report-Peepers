import { describe, it, expect } from "vitest";
import { checkCrossChecks, loadCrossChecksConfig } from "../../src/inspection/crossChecks.js";
import { loadSelfConsistencyConfig } from "../../src/inspection/selfConsistency.js";
import { read } from "../render/helpers.js";
import type { PageSpec } from "../ingest/fixtures.js";

const cfg = loadCrossChecksConfig();
const mat = loadSelfConsistencyConfig();
const page = (ls: string[]): PageSpec => ({ puts: ls.map((text, i) => ({ text, x: 40, y: 740 - i * 13, size: 9 })) });
const run = async (pages: PageSpec[]) => { const { doc } = await read(pages); return checkCrossChecks(doc, cfg, mat); };
const names = (r: { check: string }[]) => r.map((x) => x.check);

describe("cover count against sections", () => {
  it("quotes the claim and a counted section when they disagree", async () => {
    const r = await run([page(["We collected 5 samples at the property."]), page(["Sample 1 Hall", "Sample 2 Den", "Sample 3 Kitchen"])]);
    const c = r.find((x) => x.check === "cover_count_vs_sections")!;
    expect(c.quotes.length).toBe(2);
    expect(c.quotes[0]!.text).toContain("5 samples");
    expect(c.detail).toContain("3");
  });
  it("is silent when the count matches or no sections are found", async () => {
    expect(names(await run([page(["We collected 3 samples."]), page(["Sample 1 Hall", "Sample 2 Den", "Sample 3 Kitchen"])]))).not.toContain("cover_count_vs_sections");
    expect(names(await run([page(["We collected 3 samples."])]))).not.toContain("cover_count_vs_sections");
  });
});

describe("confirmed next to needs a lab", () => {
  it("fires when the same room has both", async () => {
    const r = await run([page(["SAMPLE HALL - Mold growth confirmed on the wallboard.", "SAMPLE HALL - The wallboard requires laboratory analysis."])]);
    expect(names(r)).toContain("confirmed_vs_needs_lab");
  });
  it("is silent for different rooms and different materials", async () => {
    const r = await run([page(["SAMPLE HALL - Mold confirmed on the ceiling.", "SAMPLE DEN - The wood floor requires laboratory analysis."])]);
    expect(names(r)).not.toContain("confirmed_vs_needs_lab");
  });
});

describe("rating without a reading", () => {
  it("fires when the rule needs a number and the row has none", async () => {
    const r = await run([page(["Elevated moisture is equal to or in excess of 10% moisture content.", "SAMPLE HALL - wallboard Elevated Levels"])]);
    expect(names(r)).toContain("rating_without_reading");
  });
  it("is silent when the row has its number or the report states no rule", async () => {
    expect(names(await run([page(["Elevated moisture is in excess of 10%.", "SAMPLE HALL - wallboard 33.7% Elevated"])]))).not.toContain("rating_without_reading");
    expect(names(await run([page(["SAMPLE HALL - wallboard Elevated"])]))).not.toContain("rating_without_reading");
  });
});

describe("instrument not in the equipment list", () => {
  it("fires when the report has a list and the instrument is missing from it", async () => {
    const r = await run([page(["Equipment", "Moisture meter", "SAMPLE HALL - Readings were taken using a thermal imaging camera."])]);
    const c = r.find((x) => x.check === "instrument_not_listed")!;
    expect(c.quotes.length).toBe(2);
  });
  it("is silent with no equipment list or when the instrument is listed", async () => {
    expect(names(await run([page(["Readings were taken using a thermal imaging camera."])]))).not.toContain("instrument_not_listed");
    expect(names(await run([page(["Equipment", "Thermal imaging camera", "Readings were taken using a thermal imaging camera."])]))).not.toContain("instrument_not_listed");
  });
});

describe("number against its own stated limit", () => {
  it("fires when the words and numbers disagree", async () => {
    const r = await run([page(["The reading of 14% is below the 10% limit."])]);
    expect(names(r)).toContain("number_vs_standard");
  });
  it("is silent when they agree", async () => {
    expect(names(await run([page(["The reading of 8% is below the 10% limit."])]))).not.toContain("number_vs_standard");
  });
});

describe("standard named without edition", () => {
  it("asks about a standard with no year or section", async () => {
    const r = await run([page(["Work followed ANSI/IICRC S520 practice."])]);
    const c = r.find((x) => x.check === "citation_without_edition")!;
    expect(c.quotes.length).toBe(1);
  });
  it("is silent when a year or section is on the same line", async () => {
    expect(names(await run([page(["Work followed ANSI/IICRC S520 (2015) practice."])]))).not.toContain("citation_without_edition");
    expect(names(await run([page(["Work followed ANSI/IICRC S520 section 12 practice."])]))).not.toContain("citation_without_edition");
  });
});
