import { describe, it, expect } from "vitest";
import example from "../../../docs/spec/example_case.json" with { type: "json" };
import { checkIntegrity } from "../src/integrity.js";

const clone = () => structuredClone(example) as any;
const codes = (s: any) => checkIntegrity(s).map((i) => i.code);

describe("evidence and finding integrity", () => {
  it("the synthetic example is clean", () => {
    expect(checkIntegrity(clone())).toEqual([]);
  });

  it("rejects a finding with no source evidence", () => {
    const c = clone(); c.findings[0].support_evidence_ids = [];
    expect(codes(c)).toContain("finding_without_source");
  });

  it("rejects ids that point at nothing", () => {
    const c = clone(); c.findings[0].support_evidence_ids = ["EV-999"]; c.findings[0].question_ids = ["Q-999"];
    expect(codes(c).filter((x) => x === "dangling_reference").length).toBe(2);
  });

  it("rejects evidence anchored to a missing document, or with no page location", () => {
    const c = clone(); c.evidence[0].anchor.document_version_id = "DOC-404";
    expect(codes(c)).toContain("dangling_reference");
    const d = clone(); d.evidence[0].anchor.pdf_page_index_1based = null; d.evidence[0].anchor.paragraph_or_table_anchor = null;
    expect(codes(d)).toContain("anchor_without_locator");
  });

  it("rejects duplicate ids", () => {
    const c = clone(); c.evidence.push(structuredClone(c.evidence[0]));
    expect(codes(c)).toContain("duplicate_id");
  });

  it("rejects a finding resting only on unusable evidence", () => {
    const c = clone(); c.evidence[0].quality_status = "unusable";
    expect(codes(c)).toContain("finding_rests_on_unusable_evidence");
  });

  it("blocks 'verified' use of a rights-blocked reference", () => {
    const c = clone();
    c.references = [{ id: "REF-1", publisher: "P", title: "T", edition: null, official_url: "https://example.org", authority_type: "standard", ai_use_status: "blocked", permission_record_id: null, allowed_uses: ["metadata"], effective_context: "x", reviewed_at: null }];
    c.findings[0].reference_bindings = [{ reference_id: "REF-1", verified_locator: null, relevance_explanation: "x", support_verified: true, applicability_verified: true, permission_verified: true, verified_by: "r1" }];
    expect(codes(c)).toContain("reference_rights_blocked");
    c.references[0].ai_use_status = "authorized"; c.references[0].allowed_uses = ["output_reference"];
    expect(codes(c)).not.toContain("reference_rights_blocked");
  });

  it("a verified departure needs a verified reference and human approval", () => {
    const c = clone(); c.findings[0].finding_type = "verified_reference_departure";
    const k = codes(c);
    expect(k).toContain("departure_without_verified_reference");
    expect(k).toContain("departure_without_human_approval");
  });

  it("rejects verdict, score, and accusation wording", () => {
    for (const bad of ["The report fails inspection.", "Inspector score: 40", "This is a violation.", "Shows negligence.", "Area is confirmed unaffected."]) {
      const c = clone(); c.findings[0].explanation = bad;
      expect(codes(c), bad).toContain("prohibited_language");
    }
  });

  it("publishing needs human approval, reviewer, date, approved findings, and confirmed scope", () => {
    const c = clone(); c.release.status = "published";
    const k = codes(c);
    for (const x of ["publish_without_human_approval", "publish_without_reviewer", "publish_without_date", "published_finding_unapproved"]) expect(k).toContain(x);
  });

  it("a properly approved release passes", () => {
    const c = clone();
    Object.assign(c.release, { status: "published", human_review_status: "approved", reviewer_id: "REV-1", published_at: "2026-11-03T00:00:00Z" });
    c.findings[0].human_approved = true;
    c.scope.confirmation_status = "confirmed";
    expect(checkIntegrity(c)).toEqual([]);
  });

  it("a sound report with no findings is valid", () => {
    const c = clone();
    c.findings = []; c.release.attention_finding_ids = []; c.release.leading_question_ids = [];
    expect(checkIntegrity(c)).toEqual([]);
  });

  it("rejects a reference that does not exist", () => {
    const c = clone();
    c.findings[0].reference_bindings = [{ reference_id: "REF-404", verified_locator: null, relevance_explanation: "x", support_verified: false, applicability_verified: false, permission_verified: false, verified_by: null }];
    expect(codes(c)).toContain("dangling_reference");
  });

  it("rejects wording that certifies safe reoccupancy", () => {
    const c = clone(); c.findings[0].explanation = "It is safe to reoccupy.";
    expect(codes(c)).toContain("prohibited_language");
  });

  it("ordinary building terms are not blocked", () => {
    for (const ok of ["Moisture was noted at the below grade foundation wall.", "Sloped grade directs water toward the slab.", "Grade level windows were fogged."]) {
      const c = clone(); c.findings[0].explanation = ok;
      expect(codes(c), ok).not.toContain("prohibited_language");
    }
  });

  it("scoring or ranking of people and reports is still blocked", () => {
    for (const bad of ["Inspector grade: B", "We assigned a score of 40 to this report.", "The compliance score is low.", "A risk score of 7 applies.", "Please rank the inspector against others.", "This is the contractor ranking."]) {
      const c = clone(); c.findings[0].explanation = bad;
      expect(codes(c), bad).toContain("prohibited_language");
    }
  });
});
