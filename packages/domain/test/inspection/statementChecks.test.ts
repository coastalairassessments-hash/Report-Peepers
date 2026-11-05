import { describe, it, expect } from "vitest";
import { checkStatements } from "../../src/inspection/statementChecks.js";
import { loadSelfConsistencyConfig } from "../../src/inspection/selfConsistency.js";
import { read } from "../render/helpers.js";
import type { PageSpec } from "../ingest/fixtures.js";

const cfg = loadSelfConsistencyConfig();
const page = (ls: string[]): PageSpec => ({ puts: ls.map((text, i) => ({ text, x: 40, y: 740 - i * 13, size: 9 })) });
const run = async (pages: PageSpec[]) => { const { doc } = await read(pages); return checkStatements(doc, cfg); };

describe("statements that disagree", () => {
  it("flags a sampling date that differs from the inspection date, quoting both", async () => {
    const f = await run([page(["Date of Inspection: July 25, 2025", "Date of Report: July 28, 2025"]), page(["Sampled: 07-27-25", "Received: 07-28-25"])]);
    const d = f.filter((x) => x.check === "dates_disagree");
    expect(d).toHaveLength(1);
    expect(d[0]!.quotes.map((q) => q.page)).toEqual([1, 2]);
  });
  it("stays silent when the dates agree in different formats", async () => {
    const f = await run([page(["Date of Inspection: July 25, 2025"]), page(["Sampled: 07-25-25"])]);
    expect(f.filter((x) => x.check === "dates_disagree")).toHaveLength(0);
  });
  it("stays silent when no sampling date is stated", async () => {
    expect((await run([page(["Date of Inspection: July 25, 2025"])])).filter((x) => x.check === "dates_disagree")).toHaveLength(0);
  });

  it("flags two different laboratory names", async () => {
    const f = await run([page(["Samples are sent to a 3rd party laboratory (AEML Inc.) for analysis."]), page(["Sporelytics Batch: 219308 Spore Trap Analysis", "Laboratory: Sporelytics"])]);
    expect(f.filter((x) => x.check === "two_lab_names")).toHaveLength(1);
  });
  it("reads the lab name from a lab sheet header", async () => {
    const f = await run([page(["Samples are sent to a 3rd party laboratory (AEML Inc.) for analysis."]), page(["Sporelytics Batch: 219308 A001 Spore Trap Analysis"])]);
    expect(f.filter((x) => x.check === "two_lab_names")).toHaveLength(1);
  });
  it("stays silent when the same lab is named twice, however it is written", async () => {
    const f = await run([page(["Samples are sent to a 3rd party laboratory (AEML Inc.) for analysis."]), page(["Laboratory: AEML, Inc."])]);
    expect(f.filter((x) => x.check === "two_lab_names")).toHaveLength(0);
  });

  it("flags terms that are defined and then never applied", async () => {
    const f = await run([page(["Condition 1 - normal fungal ecology.", "Condition 2 - settled spores.", "Condition 3 - actual growth."]), page(["Mold growth was found behind the baseboard."])]);
    expect(f.filter((x) => x.check === "defined_never_used")).toHaveLength(1);
  });
  it("stays silent when a condition is assigned to an area", async () => {
    const f = await run([page(["Condition 1 - normal fungal ecology.", "Condition 2 - settled spores.", "Condition 3 - actual growth."]), page(["The Living Room is Condition 3."])]);
    expect(f.filter((x) => x.check === "defined_never_used")).toHaveLength(0);
  });

  it("flags two different time spans for the same step before clearance testing", async () => {
    const f = await run([page(["Operate the air filtration devices continuously for 48-72 hours before post remediation testing is completed."]), page(["Turn off all air filtration devices approximately 24-48 hours prior to clearance testing."])]);
    expect(f.filter((x) => x.check === "time_spans_differ")).toHaveLength(1);
  });
  it("stays silent when the spans agree", async () => {
    const f = await run([page(["Operate the air filtration devices for 48-72 hours before post remediation testing."]), page(["Keep air filtration devices off 48-72 hours prior to clearance testing."])]);
    expect(f.filter((x) => x.check === "time_spans_differ")).toHaveLength(0);
  });
});
