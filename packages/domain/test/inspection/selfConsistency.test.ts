import { describe, it, expect } from "vitest";
import { checkSelfConsistency, loadSelfConsistencyConfig } from "../../src/inspection/selfConsistency.js";
import { read } from "../render/helpers.js";
import type { PageSpec } from "../ingest/fixtures.js";

const cfg = loadSelfConsistencyConfig();
const page = (ls: string[]): PageSpec => ({ puts: ls.map((text, i) => ({ text, x: 40, y: 740 - i * 13, size: 9 })) });
const REPORT: PageSpec[] = [
  page([
    "SUMMARY",
    "Elevated levels of moisture found on the wallboard, ceiling and crown molding in the Sample Hall.",
    "Wallboard, crown molding and ceiling in the Sample Den.",
    "SAMPLE HALL - Strong musty odor. Elevated moisture on wallboard. Elevated moisture on crown molding.",
    "SAMPLE DEN - Slight musty odor. Elevated moisture on wallboard.",
  ]),
  page([
    "Elevated moisture is equal to or in excess of 10% moisture content.",
    "SAMPLE HALL - wallboard (south wall) 33.7% Elevated Levels",
    "SAMPLE HALL - ceiling wallboard 35.9% Elevated Levels",
    "SAMPLE DEN - wallboard 29.4% Elevated Levels",
    "SAMPLE DEN - ceiling wallboard 18.0% Elevated Levels",
    "SAMPLE DEN - wood floor baseline 8.7% Not Elevated",
    "SAMPLE DEN - wallboard (baseline) 4.2% Elevated Levels",
    "SAMPLE DEN - closet wallboard 6.1% Elevated Levels",
    "SAMPLE DEN - hall wallboard 14.0% Not Elevated",
  ]),
];
const run = async (pages = REPORT) => { const { doc } = await read(pages); return checkSelfConsistency(doc, cfg); };

describe("the report against itself", () => {
  it("a reference reading labeled elevated is flagged, with the row quoted", async () => {
    const f = (await run()).filter((x) => x.check === "baseline_labeled_elevated");
    expect(f).toHaveLength(1);
    expect(f[0]!.quotes[0]).toMatchObject({ page: 2, role: "report_says" });
    expect(f[0]!.quotes[0]!.text).toContain("4.2%");
  });

  it("a result that contradicts the report's own line is flagged with both statements quoted", async () => {
    const f = (await run()).filter((x) => x.check === "result_contradicts_threshold");
    const rows = f.map((x) => x.quotes[0]!.text);
    expect(rows.some((r) => r.includes("6.1%"))).toBe(true);   // under the line but labeled elevated
    expect(rows.some((r) => r.includes("14.0%"))).toBe(true);  // over the line but labeled not elevated
    expect(rows.some((r) => r.includes("33.7%"))).toBe(false);
    expect(f[0]!.quotes[1]).toMatchObject({ role: "but_also_says" });
    expect(f[0]!.quotes[1]!.text).toContain("10%");
  });

  it("a reference reading that is correctly 'Not Elevated' is not flagged", async () => {
    expect((await run()).some((x) => x.quotes[0]!.text.includes("8.7%"))).toBe(false);
  });

  it("moisture in the narrative on a material the room's table has no reading for is flagged", async () => {
    const f = (await run()).filter((x) => x.check === "narrative_material_without_reading").map((x) => x.detail);
    expect(f.some((d) => /crown molding in sample hall/.test(d))).toBe(true);
    expect(f.some((d) => /sample den/.test(d) && /crown molding/.test(d))).toBe(true); // from the summary sentence
    expect(f.some((d) => /wallboard in sample hall/.test(d))).toBe(false); // the table has wallboard
  });

  it("'ceiling wallboard' counts as a ceiling reading, not a wall reading", async () => {
    const f = await run([page(["Elevated moisture is equal to or in excess of 10%.", "ROOM ONE - ceiling wallboard 30.0% Elevated Levels"]), page(["ROOM ONE - Musty odor. Elevated moisture on wallboard."])]);
    expect(f.some((x) => x.check === "narrative_material_without_reading" && /wallboard/.test(x.detail))).toBe(true);
  });

  it("a report with no table, no stated line, or two different stated lines raises nothing it cannot support", async () => {
    expect(await run([page(["The staining was observed on the ceiling. Moisture on wallboard was noted."])])).toEqual([]);
    const two = await run([page(["Equal to or in excess of 10% is elevated.", "Above 12% is considered wet.", "ROOM - wallboard 6.0% Elevated Levels"])]);
    expect(two.some((x) => x.check === "result_contradicts_threshold")).toBe(false);
  });

  it("every flag names real checklist topics and quotes real text", async () => {
    const { loadChecklist } = await import("../../src/inspection/checklist.js");
    const topics = new Set(loadChecklist().items.map((i) => i.topic));
    const { doc } = await read(REPORT);
    for (const x of checkSelfConsistency(doc, cfg)) {
      for (const t of x.item_topics) expect(topics.has(t), t).toBe(true);
      for (const q of x.quotes) expect(doc.pages[q.page - 1]!.text.replace(/\s+/g, " ")).toContain(q.text.replace(/\s+/g, " ").slice(0, 40));
    }
  });
});
