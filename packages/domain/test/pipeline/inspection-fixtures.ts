import { loadCrossChecksConfig } from "../../src/inspection/crossChecks.js";
import { makePdf, type PageSpec } from "../ingest/fixtures.js";
import { lines, j } from "./slice-fixtures.js";
import { makeServices, readyCase, sys } from "./helpers.js";
import { runAnalysis } from "../../src/pipeline/analyze.js";
import { loadChecklist } from "../../src/inspection/checklist.js";
import { loadConsistencyConfig } from "../../src/inspection/consistency.js";
import { loadSelfConsistencyConfig } from "../../src/inspection/selfConsistency.js";
import { loadEvidenceMapConfig } from "../../src/inspection/evidenceMap.js";
import { loadGapWording } from "../../src/inspection/gaps.js";
import { loadExpectations } from "../../src/context.js";
import { loadScopeEffects } from "../../src/inspection/gaps.js";

export const checklist = loadChecklist();
export const idOf = (topic: string) => checklist.items.find((i) => i.topic === topic)!.id;
export const NOTHING = j({ evidence: [], claims: [] });
export const NO_PROPOSAL = j({ questions: [], hypotheses: [], findings: [] });
export const ev = (local_id: string, exact_text: string, area_text?: string, origin = "report_author") => ({ local_id, origin, exact_text, ...(area_text ? { area_text } : {}) });
export const cl = (local_id: string, claim_type: string, exact_text: string, basis: string[], area_text?: string) => ({ local_id, claim_type, text: "Restated.", exact_text, strength_in_report: "categorical", basis_local_ids: basis, ...(area_text ? { area_text } : {}) });
export async function run(pages: PageSpec[], script: string[], tweak?: (svc: ReturnType<typeof makeServices>) => void) {
  const svc = makeServices(script);
  svc.inspection = { checklist, consistency: loadConsistencyConfig(), selfConsistency: loadSelfConsistencyConfig(), crossChecks: loadCrossChecksConfig(), evidenceMap: loadEvidenceMapConfig(), wording: loadGapWording(), expectations: loadExpectations(), scopeEffects: loadScopeEffects() };
  tweak?.(svc);
  const id = await readyCase(svc, await makePdf(pages));
  const r = await runAnalysis(svc, id);
  return { svc, id, r, rec: (await svc.repo.get(sys, id))! };
}

// A thin report, modeled on a real one: moisture called "elevated" with no reading, removal recommended, a cause stated, two lab names, two dates.
export const THIN: PageSpec[] = [
  lines(["LIVING ROOM", "Elevated water content was found along the NW corner.", "Mold growth was found behind the baseboard.", "It is recommended that the water damaged building materials be removed.", "The cause of the water damage was leaking ductwork in the attic."]),
  lines(["Samples are sent to a 3rd party laboratory (AEML Inc.) for analysis.", "Date of Inspection: July 25, 2025", "Laboratory: Sporelytics", "Sampled: 07-27-25"]),
];
export const thinScript = [
  j({ evidence: [ev("a", "Elevated water content was found along the NW corner.", "LIVING ROOM"), ev("b", "Mold growth was found behind the baseboard.", "LIVING ROOM")], claims: [cl("c", "remediation", "It is recommended that the water damaged building materials be removed.", ["a"], "LIVING ROOM"), cl("d", "cause", "The cause of the water damage was leaking ductwork in the attic.", ["a"], "LIVING ROOM")] }),
  NOTHING, NO_PROPOSAL,
  j({ items: [], conditions: [{ condition: "called_wet", exact_text: "Elevated water content was found along the NW corner." }, { condition: "recommendation_made", exact_text: "It is recommended that the water damaged building materials be removed." }, { condition: "cause_stated", exact_text: "The cause of the water damage was leaking ductwork in the attic." }] }),
  j({ items: [], conditions: [{ condition: "samples_taken", exact_text: "Samples are sent to a 3rd party laboratory" }] }),
];

// A complete report: a reading, a sample, a cause, a recommendation, one lab, one date.
export const COMPLETE: PageSpec[] = [lines(["LIVING ROOM", "Moisture meter reading 28% at the wall base, against a dry reading of 9%.", "An air sample was taken in the living room.", "It is recommended that the water damaged building materials be removed.", "The cause of the water damage was leaking ductwork in the attic.", "Date of Inspection: July 25, 2025", "Sampled: 07-25-25"])];
export const completeScript = [
  j({ evidence: [ev("a", "Moisture meter reading 28% at the wall base, against a dry reading of 9%.", "LIVING ROOM"), ev("b", "An air sample was taken in the living room.", "LIVING ROOM")], claims: [cl("c", "remediation", "It is recommended that the water damaged building materials be removed.", ["a"], "LIVING ROOM"), cl("d", "cause", "The cause of the water damage was leaking ductwork in the attic.", ["a"], "LIVING ROOM")] }),
  NO_PROPOSAL,
  j({ items: [{ item_id: idOf("Dry standard"), exact_text: "against a dry reading of 9%", coverage: "full", states_not_done: false }], conditions: [{ condition: "called_wet", exact_text: "Moisture meter reading 28% at the wall base" }] }),
];

