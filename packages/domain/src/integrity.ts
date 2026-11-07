import { checkReferenceUse, timingsFromReferences } from "./referenceTiming.js";
import { sourceRightsProblems } from "./references/rights.js";
import { unaddressedAreas } from "./areas.js";
import type { CaseSnapshot as Snap } from "@report-peepers/contracts";

export interface Issue { code: string; path: string; message: string }

/** Words the product must never use (no verdicts, scores, or accusations). Spec sections 2 and 13. */
const PROHIBITED = [
  /\bpass(?:ed|es)?\b\/?\s*fail/i, /\bfail(?:ed|s)?\s+(?:the\s+)?inspection/i,
  // Scoring, grading, or ranking of people, companies, or reports. Plain building terms ("below grade", "sloped grade") stay allowed.
  /\b(?:inspector|contractor|company|assessor|report)\s+(?:grade|score|ranking|rating)\b/i,
  /\b(?:grade|score|rank|rate)[sd]?\s+(?:the\s+|this\s+|that\s+)?(?:inspector|contractor|company|assessor)s?\b/i,
  /\bgrade\s*:\s*[A-F][+-]?(?![a-z])/i, /\bscore\s*(?:of|:)\s*\d+/i, /\b(?:risk|health|safety|compliance|severity)\s+score\b/i, /\branking\b/i,
  /\bviolat(?:ion|ed|es)\b/i, /\bnegligen/i, /\bfraud/i, /\bincompeten/i, /\bdishonest/i, /\bconfirmed (?:unaffected|clean|safe)\b/i, /\bsafe to reoccupy\b/i,
];

/**
 * Words that claim certainty. An opinion states evidence strength, never certainty (spec 11.3, 13).
 * Text inside double quotes is exempt, so a finding can quote what a report says. Accusation wording is not quote-exempt.
 */
const OVERCERTAIN = [
  /\bprove[sd]?\b/i, /\bproven\b/i, /\bconclusive(?:ly)?\b/i, /\bdefinite(?:ly)?\b/i, /\bdefinitive(?:ly)?\b/i,
  /\bundoubted(?:ly)?\b/i, /\bwithout (?:a |any )?doubt\b/i, /\bcertainly\b/i, /\bwith certainty\b/i, /\bguarantee[sd]?\b/i,
  // numeric confidence or probability of a cause
  /\b\d{1,3}(?:\.\d+)?\s?(?:%|percent)\s+(?:certain|certainty|confident|confidence|sure|likely|probable|probability|chance)\b/i,
  /\b(?:confidence|probability|likelihood|certainty)\s*(?:of|is|was|:|=)\s*(?:about\s+)?\d/i,
];

/** Every wording rule a piece of customer-facing text breaks. Used on text that never passes through a finding, such as notes and summary lines. */
export function wordingProblems(text: string): string[] {
  const out: string[] = [];
  for (const re of PROHIBITED) if (re.test(text)) out.push(`prohibited:${re.source}`);
  const unquoted = stripQuoted(text);
  for (const re of OVERCERTAIN) if (re.test(unquoted)) out.push(`overcertain:${re.source}`);
  return out;
}

/** Removes text inside straight or curly double quotes. An unbalanced quote leaves the rest in place. */
export function stripQuoted(text: string): string {
  return text.replace(/\u201C[^\u201D]*\u201D/g, " ").replace(/"[^"]*"/g, " ");
}

/**
 * Checks the rules a JSON Schema cannot: IDs that must resolve, findings that must trace to source,
 * references used only with permission, prohibited wording, and release gates.
 * Returns every problem found; an empty list means the snapshot is internally sound.
 */
export function checkIntegrity(s: Snap): Issue[] {
  const out: Issue[] = [];
  const add = (code: string, path: string, message: string) => out.push({ code, path, message });

  const sets = {
    documents: new Set(s.documents.map((d) => d.id)),
    evidence: new Set(s.evidence.map((e) => e.id)),
    areas: new Set(s.areas.map((a) => a.id)),
    claims: new Set(s.claims.map((c) => c.id)),
    actions: new Set(s.proposed_actions.map((a) => a.id)),
    references: new Set(s.references.map((r) => r.id)),
    questions: new Set(s.questions.map((q) => q.id)),
    findings: new Set(s.findings.map((f) => f.id)),
  };

  // duplicate ids
  const dup = (name: string, ids: string[]) => {
    const seen = new Set<string>();
    ids.forEach((id, i) => { if (seen.has(id)) add("duplicate_id", `${name}[${i}]`, `Duplicate id ${id}`); seen.add(id); });
  };
  dup("documents", s.documents.map((d) => d.id)); dup("evidence", s.evidence.map((e) => e.id));
  dup("claims", s.claims.map((c) => c.id)); dup("findings", s.findings.map((f) => f.id));
  dup("calculations", (s.calculations ?? []).map((k) => k.id));
  dup("questions", s.questions.map((q) => q.id)); dup("proposed_actions", s.proposed_actions.map((a) => a.id));

  // calculation records (v0.2): sources resolve, "not computable" says why, a correction points at what it corrects
  const calcIds = new Set((s.calculations ?? []).map((k) => k.id));
  (s.calculations ?? []).forEach((k, i) => {
    const p = `calculations[${i}]`;
    k.source_evidence_ids.forEach((id) => { if (!sets.evidence.has(id)) add("calculation_source_missing", `${p}.source_evidence_ids`, `Evidence ${id} does not exist`); });
    if (k.status === "not_computable" && !(typeof (k.result as { reason?: unknown }).reason === "string" && (k.result as { reason: string }).reason.length > 0))
      add("calculation_not_computable_without_reason", `${p}.result`, "A calculation that gives no number must state the reason");
    if (k.record_type === "corrected" && (!k.corrects_id || k.corrects_id === k.id || !calcIds.has(k.corrects_id)))
      add("correction_overwrites", p, "A corrected value must point at a different, existing record and leave the original in place");
  });

  const need = (set: Set<string>, ids: readonly string[], path: string, what: string) =>
    ids.forEach((id) => { if (!set.has(id)) add("dangling_reference", path, `${what} ${id} does not exist`); });

  // evidence: anchors resolve and carry a usable locator
  s.evidence.forEach((e, i) => {
    const p = `evidence[${i}]`;
    if (!sets.documents.has(e.anchor.document_version_id) && !["client_entry", "reviewer_entry"].includes(e.anchor.extraction_method))
      add("dangling_reference", `${p}.anchor`, `Document ${e.anchor.document_version_id} does not exist`);
    const typed = ["client_entry", "reviewer_entry"].includes(e.anchor.extraction_method);
    if (!typed && e.anchor.pdf_page_index_1based == null && !e.anchor.paragraph_or_table_anchor)
      add("anchor_without_locator", `${p}.anchor`, "Evidence from a document needs a page or paragraph/table location");
    need(sets.areas, e.area_ids, `${p}.area_ids`, "Area");
    need(sets.evidence, e.contradicts_ids, `${p}.contradicts_ids`, "Evidence");
  });
  s.claims.forEach((c, i) => { need(sets.evidence, c.basis_evidence_ids, `claims[${i}].basis_evidence_ids`, "Evidence"); need(sets.areas, c.area_ids, `claims[${i}].area_ids`, "Area"); });
  s.proposed_actions.forEach((a, i) => {
    need(sets.evidence, a.support_evidence_ids, `proposed_actions[${i}].support_evidence_ids`, "Evidence");
    if (a.claim_id) need(sets.claims, [a.claim_id], `proposed_actions[${i}].claim_id`, "Claim");
  });

  // areas: a "no indicators" status needs a basis, and contradicting evidence must be shown as a conflict
  s.areas.forEach((a, i) => {
    const p = `areas[${i}]`;
    need(sets.evidence, a.basis_evidence_ids, `${p}.basis_evidence_ids`, "Evidence");
    if (a.condition_status === "assessed_no_indicators_reported" && a.basis_evidence_ids.length === 0)
      add("area_no_indicators_without_basis", p, "A no-indicators status needs the evidence it rests on");
    const mine = new Set([...a.basis_evidence_ids, ...s.evidence.filter((e) => e.area_ids.includes(a.id)).map((e) => e.id)]);
    const conflict = s.evidence.some((e) => mine.has(e.id) && e.contradicts_ids.some((id) => mine.has(id)));
    if (conflict && a.condition_status !== "conflicting_evidence")
      add("area_conflict_not_marked", p, "Evidence for this area contradicts itself; status must be conflicting_evidence");
  });

  // scope: a conflicting account must be recorded as an open discrepancy
  const conflicting = s.scope.restrictions.some((r) => r.status === "conflicting" || r.agreed_status === "conflicting");
  const structuredOpen = (s.scope.conflict_accounts ?? []).some((c) => c.status === "open");
  if (conflicting && s.scope.unresolved_discrepancies.length === 0 && !structuredOpen)
    add("scope_conflict_unrecorded", "scope", "A conflicting scope account must appear in unresolved_discrepancies");

  // v0.2 only: rules that read the stored fields. A v0.1 snapshot has none of them, so it is judged as before.
  if (s.schema_version !== "0.1") {
    const timings = timingsFromReferences(s.references);
    s.findings.forEach((f) => out.push(...checkReferenceUse(f, s.references, timings, s.report_issued_on ?? null)));
    if (s.expected_area_names)
      unaddressedAreas(s.expected_area_names, s.areas).forEach((n) => add("expected_area_unaddressed", "areas", `The report never addresses "${n}"; it gets no status, not clean and not affected`));
  }

  const claimById = new Map(s.claims.map((c) => [c.id, c]));
  const hypByClaim = new Map<string, Snap["hypotheses"]>();
  s.hypotheses.forEach((h, i) => {
    const p = `hypotheses[${i}]`;
    if (!sets.claims.has(h.claim_id)) add("dangling_reference", `${p}.claim_id`, `Claim ${h.claim_id} does not exist`);
    hypByClaim.set(h.claim_id, [...(hypByClaim.get(h.claim_id) ?? []), h]);
    if (h.alternative_explanations.length === 0) add("hypothesis_without_alternatives", p, "A hypothesis lists the competing explanations considered");
    if (h.what_would_change_interpretation.length === 0) add("hypothesis_without_change_conditions", p, "A hypothesis states what would change the interpretation");
    if (h.time_compatible === "no" && h.status === "supported_with_limits") add("hypothesis_supported_but_time_incompatible", p, "A hypothesis whose timing does not fit cannot be supported");
  });

  for (const p of sourceRightsProblems(s.references)) add(`source_rights_${p.code}`, `references[${s.references.findIndex((r) => r.id === p.reference_id)}]`, p.detail);
  const refById = new Map(s.references.map((r) => [r.id, r]));
  const evById = new Map(s.evidence.map((e) => [e.id, e]));

  s.findings.forEach((f, i) => {
    (f.calculation_ids ?? []).forEach((id) => { if (!calcIds.has(id)) add("finding_number_without_calculation", `findings[${i}].calculation_ids`, `Calculation ${id} does not exist`); });
    const p = `findings[${i}]`;
    need(sets.claims, f.claim_ids, `${p}.claim_ids`, "Claim");
    need(sets.actions, f.action_ids, `${p}.action_ids`, "Action");
    need(sets.evidence, f.support_evidence_ids, `${p}.support_evidence_ids`, "Evidence");
    need(sets.evidence, f.counter_evidence_ids, `${p}.counter_evidence_ids`, "Evidence");
    need(sets.questions, f.question_ids, `${p}.question_ids`, "Question");

    // traceability: no finding without a source
    if (f.support_evidence_ids.length === 0) add("finding_without_source", p, "Finding must link to at least one evidence item");
    if (f.support_evidence_ids.length > 0 && f.support_evidence_ids.every((id) => evById.get(id)?.quality_status === "unusable"))
      add("finding_rests_on_unusable_evidence", p, "All supporting evidence is marked unusable");

    // every finding gives the reader a way forward
    if (f.finding_type !== "supported_reasoning" && f.question_ids.length === 0 && f.possible_next_steps.length === 0)
      add("finding_without_next_step", p, "Finding needs a question or possible next step");

    // references: use only with permission and verification
    f.reference_bindings.forEach((b, j) => {
      const r = refById.get(b.reference_id);
      if (!r) return add("dangling_reference", `${p}.reference_bindings[${j}]`, `Reference ${b.reference_id} does not exist`);
      const fullyVerified = b.support_verified && b.applicability_verified && b.permission_verified;
      if (fullyVerified && r.ai_use_status !== "authorized")
        add("reference_rights_blocked", `${p}.reference_bindings[${j}]`, `Reference ${r.id} is ${r.ai_use_status}; cannot be marked verified`);
      if (fullyVerified && !r.allowed_uses.includes("output_reference"))
        add("reference_not_citable", `${p}.reference_bindings[${j}]`, `Reference ${r.id} is not approved for output`);
    });
    if (f.finding_type === "verified_reference_departure") {
      const ok = f.reference_bindings.some((b) => b.support_verified && b.applicability_verified && b.permission_verified);
      if (!ok) add("departure_without_verified_reference", p, "A verified departure needs a fully verified reference");
      if (!f.human_approved) add("departure_without_human_approval", p, "A verified departure needs human approval");
    }

    // wording
    for (const field of ["title", "explanation", "uncertainty", "resolution_condition"] as const) {
      for (const re of PROHIBITED) if (re.test(f[field])) add("prohibited_language", `${p}.${field}`, `Wording not allowed: ${re.source}`);
      const unquoted = stripQuoted(f[field]);
      for (const re of OVERCERTAIN) if (re.test(unquoted)) add("overcertain_language", `${p}.${field}`, "State evidence strength, not certainty or a numeric confidence");
    }

    // client recollection alone cannot carry a strong or moderate finding
    const supportEv = f.support_evidence_ids.map((id) => evById.get(id));
    if (supportEv.length > 0 && supportEv.every((e) => e?.origin === "client_statement") && (f.evidence_strength === "strong" || f.evidence_strength === "moderate"))
      add("client_only_support_too_strong", p, "Client statements alone cannot support a strong or moderate finding");

    // cause and duration claims need a hypothesis with competing explanations
    for (const cid of f.claim_ids) {
      const cl = claimById.get(cid);
      if (s.schema_version !== "0.1" && cl && (cl.claim_type === "cause" || cl.claim_type === "duration") && (f.assumptions ?? []).length === 0)
        add("cause_finding_without_assumptions", `${p}.assumptions`, `Claim ${cid} is a ${cl.claim_type} claim; list the assumptions it depends on`);
      if (cl && (cl.claim_type === "cause" || cl.claim_type === "duration") && !(hypByClaim.get(cid)?.length))
        add("cause_finding_without_hypothesis", `${p}.claim_ids`, `Claim ${cid} is a ${cl.claim_type} claim and needs a hypothesis with competing explanations`);
    }
  });

  // release gates
  const r = s.release;
  need(sets.findings, [...r.supported_finding_ids, ...r.attention_finding_ids], "release.finding_ids", "Finding");
  need(sets.questions, r.leading_question_ids, "release.leading_question_ids", "Question");
  for (const re of PROHIBITED) if (re.test(r.overview)) add("prohibited_language", "release.overview", `Wording not allowed: ${re.source}`);
  for (const re of OVERCERTAIN) if (re.test(stripQuoted(r.overview))) add("overcertain_language", "release.overview", "State evidence strength, not certainty or a numeric confidence");
  if (r.status === "published") {
    const automatic = r.release_mode === "automatic" && r.human_review_status === "automatic" && s.schema_version === "0.3";
    if (r.human_review_status === "automatic" && !automatic) add("automatic_status_misused", "release", "Automatic status is only valid in a version 0.3 release whose mode is automatic");
    else if (r.release_mode === "automatic" && !automatic) add("automatic_status_misused", "release", "An automatic release must carry the automatic status");
    else if (!automatic && r.human_review_status !== "approved") add("publish_without_human_approval", "release", "A person-reviewed release needs recorded human approval");
    if (s.schema_version !== "0.1" && !r.reviewer_conflict_disclosure?.trim())
      add("publish_missing_conflict_disclosure", "release.reviewer_conflict_disclosure", "Published release needs a reviewer conflict disclosure, even if it says none");
    if (!r.reviewer_id) add("publish_without_reviewer", "release.reviewer_id", "Published release needs a reviewer");
    if (!r.published_at) add("publish_without_date", "release.published_at", "Published release needs a date");
    const listed = new Set([...r.supported_finding_ids, ...r.attention_finding_ids]);
    s.findings.forEach((f, i) => { if (automatic && listed.has(f.id) && f.finding_type === "verified_reference_departure") add("departure_in_automatic_release", `findings[${i}]`, `Finding ${f.id} needs a person and cannot be in an automatic release`); if (!automatic && listed.has(f.id) && !f.human_approved) add("published_finding_unapproved", `findings[${i}]`, `Finding ${f.id} is in a published release without approval`); });
    if (s.scope.confirmation_status === "unconfirmed") add("publish_without_scope", "scope", "Scope must be confirmed or conditional before release");
  }
  return out;
}
