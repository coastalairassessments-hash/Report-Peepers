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

  it("a conflicting scope account must be recorded as an open discrepancy", () => {
    const c = clone(); c.scope.restrictions[0].status = "conflicting";
    c.scope.unresolved_discrepancies = [];
    expect(codes(c)).toContain("scope_conflict_unrecorded");
    c.scope.unresolved_discrepancies = ["time: agreement says X; client says Y"];
    expect(codes(c)).not.toContain("scope_conflict_unrecorded");
  });

  describe("defensibility rules", () => {
    const setExplanation = (text: string) => { const c = clone(); c.findings[0].explanation = text; return c; };

    it("XC003: numeric confidence and certainty claims are rejected", () => {
      for (const bad of ["We are 90% certain the cause is HVAC failure.", "I am 95 percent sure of this.", "The probability of 0.8 supports this cause.", "Confidence: 90 for this cause.", "This proves the cause.", "The cause is definitely a leak.", "The result is conclusive.", "Undoubtedly the source is the register.", "This was determined with certainty.", "We guarantee this reading."])
        expect(codes(setExplanation(bad)), bad).toContain("overcertain_language");
    });

    it("measured values and ordinary words are not caught", () => {
      for (const ok of ["Closet RH was 73.6 percent at 74.1 F.", "RH reached 100 percent during the visit.", "The result is inconclusive.", "The new filter improves airflow.", "The plan was approved by the owner.", "The duration is indefinite."])
        expect(codes(setExplanation(ok)), ok).not.toContain("overcertain_language");
    });

    it("quoted report wording is allowed for over-certain words but not for accusations", () => {
      expect(codes(setExplanation('The report says the cause is "definitely" HVAC failure.'))).not.toContain("overcertain_language");
      expect(codes(setExplanation("The report says the cause is \u201Cdefinitely\u201D HVAC failure."))).not.toContain("overcertain_language");
      expect(codes(setExplanation("This definitely shows HVAC failure.\u0022 and more"))).toContain("overcertain_language");
      expect(codes(setExplanation('The inspector was "negligent" in this case.'))).toContain("prohibited_language");
    });

    it("an unbalanced quote does not hide over-certain wording or crash", () => {
      expect(codes(setExplanation('The report says "definitely and this proves it.'))).toContain("overcertain_language");
    });

    it("the release overview is checked too", () => {
      const c = clone(); c.release.overview = "This proves the report is wrong.";
      expect(codes(c)).toContain("overcertain_language");
    });

    const addCause = (c: any, id: string, withHypothesis: boolean) => {
      c.claims.push({ ...structuredClone(c.claims[0]), id, claim_type: "cause", text: `Cause claim ${id}` });
      if (withHypothesis) c.hypotheses.push({ ...structuredClone(c.hypotheses[0]), id: `HY-${id}`, claim_id: id });
      c.findings[0].claim_ids.push(id);
    };

    it("XC011: a cause finding without a hypothesis listing alternatives is rejected", () => {
      const c = clone(); addCause(c, "CL-9", false);
      const issues = checkIntegrity(c).filter((i) => i.code === "cause_finding_without_hypothesis");
      expect(issues).toHaveLength(1);
      expect(issues[0]!.message).toContain("CL-9");
      const d = clone(); addCause(d, "CL-9", true);
      expect(codes(d)).not.toContain("cause_finding_without_hypothesis");
    });

    it("with two cause claims, only the one missing a hypothesis is named", () => {
      const c = clone(); addCause(c, "CL-8", true); addCause(c, "CL-9", false);
      const issues = checkIntegrity(c).filter((i) => i.code === "cause_finding_without_hypothesis");
      expect(issues.map((i) => i.message).join(" ")).toContain("CL-9");
      expect(issues.map((i) => i.message).join(" ")).not.toContain("CL-8");
    });

    it("an observation claim does not need a hypothesis", () => {
      const c = clone(); c.claims[0].claim_type = "observation"; c.hypotheses = [];
      expect(codes(c)).not.toContain("cause_finding_without_hypothesis");
    });

    it("a hypothesis needs alternatives and change conditions", () => {
      const c = clone(); c.hypotheses[0].alternative_explanations = []; c.hypotheses[0].what_would_change_interpretation = [];
      expect(codes(c)).toContain("hypothesis_without_alternatives");
      expect(codes(c)).toContain("hypothesis_without_change_conditions");
    });

    it("a hypothesis cannot be supported when the timing does not fit", () => {
      const c = clone(); c.hypotheses[0].time_compatible = "no"; c.hypotheses[0].status = "supported_with_limits";
      expect(codes(c)).toContain("hypothesis_supported_but_time_incompatible");
      c.hypotheses[0].status = "plausible_unconfirmed";
      expect(codes(c)).not.toContain("hypothesis_supported_but_time_incompatible");
    });

    it("a hypothesis naming a missing claim is a dangling reference", () => {
      const c = clone(); c.hypotheses[0].claim_id = "CL-404";
      expect(codes(c)).toContain("dangling_reference");
    });

    it("XC006: client statements alone cannot carry a strong finding", () => {
      const c = clone(); c.evidence[0].origin = "client_statement"; c.findings[0].evidence_strength = "strong";
      expect(codes(c)).toContain("client_only_support_too_strong");
      c.findings[0].evidence_strength = "moderate";
      expect(codes(c)).toContain("client_only_support_too_strong");
      for (const ok of ["limited", "indeterminate"]) { c.findings[0].evidence_strength = ok; expect(codes(c), ok).not.toContain("client_only_support_too_strong"); }
    });

    it("mixed client and report-author support is not limited by the client-only rule", () => {
      const c = clone();
      c.evidence.push({ ...structuredClone(c.evidence[0]), id: "EV-002", origin: "report_author" });
      c.evidence[0].origin = "client_statement";
      c.findings[0].support_evidence_ids = ["EV-001", "EV-002"]; c.findings[0].evidence_strength = "strong";
      expect(codes(c)).not.toContain("client_only_support_too_strong");
    });
  });

  describe("calculation records (v0.2)", () => {
    const rec = (over: object = {}) => ({
      id: "CALC-1", kind: "indoor_outdoor_ratio", record_type: "derived", corrects_id: null, status: "ok", formula: "indoor / outdoor",
      inputs: {}, units: "ratio", rounding: "two decimals", result: { ratio: 1.5 }, limitations: [], source_evidence_ids: ["EV-001"], ...over,
    });
    const v02 = (calcs: object[], ids: string[] = []) => { const c = clone(); c.schema_version = "0.2"; c.findings[0].assumptions = ["Readings were taken where stated."]; c.calculations = calcs; c.findings[0].calculation_ids = ids; return c; };

    it("a v0.2 snapshot with a sound record and a finding that cites it is clean", () => {
      expect(checkIntegrity(v02([rec()], ["CALC-1"]))).toEqual([]);
    });

    it("a record whose source evidence does not exist is flagged", () => {
      expect(codes(v02([rec({ source_evidence_ids: ["EV-404"] })]))).toContain("calculation_source_missing");
    });

    it("a finding citing a calculation that does not exist is flagged", () => {
      expect(codes(v02([rec()], ["CALC-9"]))).toContain("finding_number_without_calculation");
    });

    it("a not-computable record must say why", () => {
      expect(codes(v02([rec({ status: "not_computable", result: {} })]))).toContain("calculation_not_computable_without_reason");
      expect(codes(v02([rec({ status: "not_computable", result: { reason: "outdoor_nondetect" } })]))).not.toContain("calculation_not_computable_without_reason");
    });

    it("a correction must point at an existing record and never overwrite it", () => {
      expect(codes(v02([rec({ record_type: "corrected", corrects_id: null })]))).toContain("correction_overwrites");
      expect(codes(v02([rec({ record_type: "corrected", corrects_id: "CALC-404" })]))).toContain("correction_overwrites");
      expect(codes(v02([rec({ record_type: "corrected", corrects_id: "CALC-1" })]))).toContain("correction_overwrites");
      expect(codes(v02([rec(), rec({ id: "CALC-2", record_type: "corrected", corrects_id: "CALC-1" })]))).not.toContain("correction_overwrites");
    });

    it("duplicate calculation ids are flagged", () => {
      expect(codes(v02([rec(), rec()]))).toContain("duplicate_id");
    });

    it("a v0.1 snapshot with no calculations is unaffected", () => {
      expect(checkIntegrity(clone())).toEqual([]);
    });
  });

  describe("stored v0.2 fields", () => {
    const v02 = () => { const c = clone(); c.schema_version = "0.2"; c.findings[0].assumptions = ["Readings were taken where stated."]; return c; };
    const ref = (over: object = {}) => ({ id: "REF-1", publisher: "P", title: "T", edition: "2024", official_url: "https://example.org", authority_type: "guidance", ai_use_status: "authorized", permission_record_id: "PR-1", allowed_uses: ["output_reference"], effective_context: "Residential reports", reviewed_at: null, ...over });
    const binding = { reference_id: "REF-1", verified_locator: null, relevance_explanation: "x", support_verified: true, applicability_verified: true, permission_verified: true, verified_by: "r1" };

    it("a v0.2 snapshot with assumptions is clean", () => { expect(checkIntegrity(v02())).toEqual([]); });

    it("E2: a cause finding in a v0.2 snapshot must list its assumptions; v0.1 is not asked", () => {
      const c = v02(); c.findings[0].assumptions = [];
      expect(codes(c)).toContain("cause_finding_without_assumptions");
      const old = clone(); expect(codes(old)).not.toContain("cause_finding_without_assumptions");
    });

    it("E5: a published v0.2 release needs a conflict disclosure; v0.1 is not asked", () => {
      const publish = (c: any) => { Object.assign(c.release, { status: "published", human_review_status: "approved", reviewer_id: "REV-1", reviewer_scope: "Residential", published_at: "2026-11-03T00:00:00Z" }); c.findings[0].human_approved = true; c.scope.confirmation_status = "confirmed"; return c; };
      expect(codes(publish(v02()))).toContain("publish_missing_conflict_disclosure");
      const ok = publish(v02()); ok.release.reviewer_conflict_disclosure = "None.";
      expect(codes(ok)).not.toContain("publish_missing_conflict_disclosure");
      const blank = publish(v02()); blank.release.reviewer_conflict_disclosure = "   ";
      expect(codes(blank)).toContain("publish_missing_conflict_disclosure");
      expect(codes(publish(clone()))).not.toContain("publish_missing_conflict_disclosure");
    });

    it("stored reference dates and status are used: a later edition cannot support a departure", () => {
      const c = v02(); c.references = [ref({ publication_status: "published", published_on: "2025-06-01" })]; c.report_issued_on = "2024-01-01";
      c.findings[0].finding_type = "verified_reference_departure"; c.findings[0].reference_bindings = [binding];
      expect(codes(c)).toContain("reference_postdates_report");
      c.references = [ref({ publication_status: "draft", published_on: null })];
      expect(codes(c)).toContain("reference_draft_not_citable");
    });

    it("a relied-on reference with no stored status is flagged unknown, never a crash", () => {
      const c = v02(); c.references = [ref()]; c.findings[0].reference_bindings = [binding];
      expect(codes(c)).toContain("reference_timing_unknown");
      c.report_issued_on = "not a date"; c.references = [ref({ publication_status: "published", published_on: "also not a date" })]; c.findings[0].finding_type = "verified_reference_departure";
      expect(codes(c)).toContain("reference_timing_unknown");
    });

    it("an expected room the report never addresses is flagged, not given a status", () => {
      const c = v02(); c.expected_area_names = ["Closet", "Master Bath"]; c.areas[0].name = "Closet";
      const issues = checkIntegrity(c).filter((i) => i.code === "expected_area_unaddressed");
      expect(issues).toHaveLength(1);
      expect(issues[0]!.message).toContain("Master Bath");
      const d = v02(); d.expected_area_names = ["closet"];
      expect(codes(d)).not.toContain("expected_area_unaddressed");
    });

    it("a structured open scope conflict counts as recorded", () => {
      const c = v02(); c.scope.restrictions[0].status = "conflicting"; c.scope.unresolved_discrepancies = [];
      expect(codes(c)).toContain("scope_conflict_unrecorded");
      c.scope.conflict_accounts = [{ kind: c.scope.restrictions[0].kind, agreement_account: "One hour.", client_account: "No limit.", status: "open", choice: null, note: null }];
      expect(codes(c)).not.toContain("scope_conflict_unrecorded");
    });
  });
});

describe("automatic release mode (ADR-006, contract 0.3)", () => {
  const auto = () => {
    const c = clone(); c.schema_version = "0.3"; c.scope.confirmation_status = "confirmed"; c.findings.forEach((f: any) => { f.assumptions = ["Stated by the report."]; });
    Object.assign(c.release, { status: "published", human_review_status: "automatic", release_mode: "automatic", reviewer_id: "automatic", reviewer_scope: "Automated checks", published_at: "2026-11-05T00:00:00Z", reviewer_conflict_disclosure: "No person reviewed this release." });
    return c;
  };
  it("a properly formed automatic release passes with no person's approval", () => {
    expect(checkIntegrity(auto())).toEqual([]);
  });
  it("automatic status is only valid in a 0.3 automatic release", () => {
    const a = auto(); a.schema_version = "0.2"; expect(codes(a)).toContain("automatic_status_misused");
    const b = auto(); b.release.release_mode = "human"; expect(codes(b)).toContain("automatic_status_misused");
    const c = auto(); delete c.release.release_mode; expect(codes(c)).toContain("automatic_status_misused");
  });
  it("an automatic release cannot carry a departure from a reference", () => {
    const c = auto(); c.findings[0].finding_type = "verified_reference_departure";
    expect(codes(c)).toContain("departure_in_automatic_release");
  });
  it("human mode on 0.3 still needs a person's approval", () => {
    const c = auto(); c.release.release_mode = "human"; c.release.human_review_status = "pending";
    expect(codes(c)).toContain("publish_without_human_approval");
  });
  it("automatic still needs a date, a conflict disclosure and confirmed scope", () => {
    const c = auto(); c.release.published_at = null; c.release.reviewer_conflict_disclosure = ""; c.scope.confirmation_status = "unconfirmed";
    for (const x of ["publish_without_date", "publish_missing_conflict_disclosure", "publish_without_scope"]) expect(codes(c)).toContain(x);
  });
  it("wording rules apply to the automatic overview just as to a person's", () => {
    const c = auto(); c.release.overview = "The report fails inspection.";
    expect(codes(c)).toContain("prohibited_language");
  });
});
