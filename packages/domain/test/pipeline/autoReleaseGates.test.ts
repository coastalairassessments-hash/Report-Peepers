import { describe, it, expect } from "vitest";
import { autoReleaseGates, type GateInput } from "../../src/pipeline/autoRelease.js";

const ok = (): GateInput => ({
  sentences: ["The report says the crawlspace was dry (page 4). What reading showed that?"],
  contractValid: true, integrityIssues: 0, sourceIntact: true, rereadOk: true, entitled: true,
});
const failed = (g: GateInput) => autoReleaseGates(g).failed.map((x) => x.gate);

describe("autoReleaseGates: fail closed", () => {
  it("passes when every gate passes", () => { expect(autoReleaseGates(ok())).toEqual({ ok: true, failed: [] }); });
  it("accusing or certain wording in any customer sentence fails", () => {
    for (const bad of ["The inspector was negligent.", "This report fails inspection."]) expect(failed({ ...ok(), sentences: [...ok().sentences, bad] }), bad).toContain("wording");
  });
  it("naming a standard or claiming compliance in our own words fails; the inspector's quoted words are theirs", () => {
    for (const bad of ["This meets industry standards.", "Per ASTM D7338 the result is valid.", "The work is compliant."]) expect(failed({ ...ok(), sentences: [bad] }), bad).toContain("no_citations");
    expect(failed({ ...ok(), sentences: ["The report says \u201Csampled per ASTM D7338\u201D (page 3). Which edition and section was used?"] })).toEqual([]);
  });
  it("each yes/no gate fails on its own", () => {
    expect(failed({ ...ok(), contractValid: false })).toEqual(["contract_valid"]);
    expect(failed({ ...ok(), integrityIssues: 1 })).toEqual(["integrity"]);
    expect(failed({ ...ok(), sourceIntact: false })).toEqual(["source_intact"]);
    expect(failed({ ...ok(), entitled: false })).toEqual(["entitlement"]);
    expect(failed({ ...ok(), rereadOk: false })).toEqual(["reread_failed"]);
  });
  it("content problems are never gates: they are filtered before the gates run", () => {
    const g = ok() as unknown as Record<string, unknown>;
    for (const k of ["anchorProblems", "suspiciousPages", "heldBack", "maxHeldBack", "pagesTotal", "unreadablePages"]) expect(k in g, k).toBe(false);
  });
  it("reports every failure, not just the first", () => {
    expect(failed({ ...ok(), entitled: false, sourceIntact: false }).sort()).toEqual(["entitlement", "source_intact"]);
  });
  it("an empty sentence list fails closed", () => {
    expect(failed({ ...ok(), sentences: [] })).toContain("nothing_to_release");
  });
});
