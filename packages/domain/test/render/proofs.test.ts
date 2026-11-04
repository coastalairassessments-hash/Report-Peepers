import { it } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { planMarkup, loadMarkupConfig } from "../../src/render/plan.js";
import { renderMarkup } from "../../src/render/renderMarkup.js";
import { verifyMarkup } from "../../src/render/verifyMarkup.js";
import { extractDocument } from "../../src/ingest/extract.js";
import { markupText } from "../../src/render/exportMarkup.js";
import { DOC, finding, viewOf, read, src } from "./helpers.js";
import type { PageSpec } from "../ingest/fixtures.js";

/** Writes the proof sheets for people to look at. Runs only when asked: WRITE_PROOFS=<folder> npx vitest run test/render/proofs.test.ts */
const out = process.env.WRITE_PROOFS;
const para = (lines: string[], top: number, size = 10.5, gap = 14): PageSpec["puts"] => lines.map((text, i) => ({ text, x: 72, y: top - i * gap, size }));

const page1 = para([
  "SYNTHETIC SAMPLE REPORT - made up for testing, not a real inspection",
  "",
  "Mold and Moisture Assessment, Example Property, 100 Sample Lane",
  "Assessment date: sample date. Prepared for: sample client.",
  "",
  "1. Scope of assessment",
  "The assessment covered the interior living areas, the attic access, and the crawl space. Areas",
  "behind locked doors and the detached garage were not accessed. Visual observation and a",
  "moisture meter were used. No destructive testing was performed during this assessment.",
  "",
  "2. Observations",
  "Staining was observed on the ceiling of the hall bathroom, approximately 2 feet by 3 feet.",
  "The stain is consistent with a long-standing moisture source above the ceiling plane.",
  "Moisture meter readings in the hall bathroom ceiling were elevated relative to adjacent areas.",
  "The closet humidity was persistently elevated during the visit, with no dehumidifier present.",
  "Visible growth was noted on the north wall of the primary bedroom closet near the baseboard.",
], 730);
const page2 = para([
  "3. Sampling",
  "Two air samples and one outdoor control sample were collected. Sample locations are listed in",
  "the laboratory appendix. The laboratory reported elevated spore counts in the primary bedroom.",
  "The duration of the moisture condition was estimated at more than six months.",
  "",
  "4. Conclusions",
  "The mold growth is caused by a roof leak above the hall bathroom. The condition poses a",
  "health risk to occupants and is the reason for the symptoms described by the client.",
  "",
  "5. Recommendations",
  "Remove all affected drywall in the hall bathroom and the primary bedroom closet. Replace the",
  "roof flashing above the hall bathroom. Remediation should be completed by a licensed contractor.",
  "The attic was not entered because of limited headroom, and no photographs of the attic exist.",
], 730);
const page3: PageSpec = {}; // a scanned page: no text layer at all

it.skipIf(!out)("writes the proof sheets", async () => {
  const { bytes, doc } = await read([{ puts: page1 }, { puts: page2 }, page3]);
  const f = [
    finding({ id: "F-A", title: "Cause of the staining stated without a source", finding_type: "clarification_needed", questions: ["What was the cause of the stain based on?"], sources: [src(doc, "consistent with a long-standing moisture source")] }),
    finding({ id: "F-B", title: "Duration estimate has no stated basis", questions: ["What was the six month estimate based on?"], sources: [src(doc, "more than six months")] }),
    finding({ id: "F-C", title: "Health statement goes beyond a mold assessment", finding_type: "insufficiently_supported_recommendation", questions: ["What supports linking the symptoms to the mold?"], sources: [src(doc, "reason for the symptoms described by the client")] }),
    finding({ id: "F-D", title: "Attic not entered, no photographs", finding_type: "documentation_limitation", decision_relevance: "contextual", questions: ["Can the attic be reviewed another way?"], sources: [src(doc, "no photographs of the attic exist")] }),
    finding({ id: "F-E", title: "Moisture readings are documented", finding_type: "supported_reasoning", questions: [], sources: [src(doc, "Moisture meter readings in the hall bathroom")] }),
    finding({ id: "F-F", title: "Statements about the closet differ", finding_type: "internal_inconsistency", decision_relevance: "contextual", questions: ["Which closet reading applies?"], sources: [src(doc, "closet humidity was persistently elevated"), src(doc, "Visible growth was noted on the north wall")] }),
    finding({ id: "F-G", title: "Scanned page cannot be read", finding_type: "documentation_limitation", decision_relevance: "contextual", questions: ["Can a readable copy of page 3 be supplied?"], sources: [{ role: "support", anchor: (await import("../../src/ingest/anchors.js")).pageOnlyAnchor(doc, DOC, 3) }] }),
  ];
  const plan = planMarkup(viewOf(f, ["What was the cause of the stain based on?", "What was the six month estimate based on?", "What supports linking the symptoms to the mold?"]), doc, DOC, loadMarkupConfig());
  const r = await renderMarkup(bytes, plan);
  if (!r.ok) throw new Error(r.diagnostics);
  const v = verifyMarkup(doc, await extractDocument(r.pdf), plan);
  mkdirSync(resolve(out!), { recursive: true });
  writeFileSync(resolve(out!, "sample_marked_up.pdf"), r.pdf);
  writeFileSync(resolve(out!, "sample_source.pdf"), bytes);
  writeFileSync(resolve(out!, "sample_marked_up.txt"), markupText(plan));
  writeFileSync(resolve(out!, "sample_plan_issues.json"), JSON.stringify({ verified: v.ok, problems: v.ok ? [] : v.problems, issues: plan.issues, overflow_count: plan.overflow.length }, null, 2));
});
