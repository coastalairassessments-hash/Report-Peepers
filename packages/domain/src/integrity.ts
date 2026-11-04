import type { EnvironmentalReviewCaseSnapshotVersion01 as Snap } from "../../contracts/src/types.js";

export interface Issue { code: string; path: string; message: string }

/** Words the product must never use (no verdicts, scores, or accusations). Spec sections 2 and 13. */
const PROHIBITED = [
  /\bpass(?:ed|es)?\b\/?\s*fail/i, /\bfail(?:ed|s)?\s+(?:the\s+)?inspection/i, /\bscore\b/i, /\bgrade\b/i, /\branking\b/i,
  /\bviolat(?:ion|ed|es)\b/i, /\bnegligen/i, /\bfraud/i, /\bincompeten/i, /\bdishonest/i, /\bconfirmed (?:unaffected|clean|safe)\b/i, /\bsafe to reoccupy\b/i,
];

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
  dup("questions", s.questions.map((q) => q.id)); dup("proposed_actions", s.proposed_actions.map((a) => a.id));

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

  const refById = new Map(s.references.map((r) => [r.id, r]));
  const evById = new Map(s.evidence.map((e) => [e.id, e]));

  s.findings.forEach((f, i) => {
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
    for (const field of ["title", "explanation", "uncertainty", "resolution_condition"] as const)
      for (const re of PROHIBITED) if (re.test(f[field])) add("prohibited_language", `${p}.${field}`, `Wording not allowed: ${re.source}`);
  });

  // release gates
  const r = s.release;
  need(sets.findings, [...r.supported_finding_ids, ...r.attention_finding_ids], "release.finding_ids", "Finding");
  need(sets.questions, r.leading_question_ids, "release.leading_question_ids", "Question");
  for (const re of PROHIBITED) if (re.test(r.overview)) add("prohibited_language", "release.overview", `Wording not allowed: ${re.source}`);
  if (r.status === "published") {
    if (r.human_review_status !== "approved") add("publish_without_human_approval", "release", "Pilot releases need recorded human approval");
    if (!r.reviewer_id) add("publish_without_reviewer", "release.reviewer_id", "Published release needs a reviewer");
    if (!r.published_at) add("publish_without_date", "release.published_at", "Published release needs a date");
    const listed = new Set([...r.supported_finding_ids, ...r.attention_finding_ids]);
    s.findings.forEach((f, i) => { if (listed.has(f.id) && !f.human_approved) add("published_finding_unapproved", `findings[${i}]`, `Finding ${f.id} is in a published release without approval`); });
    if (s.scope.confirmation_status === "unconfirmed") add("publish_without_scope", "scope", "Scope must be confirmed or conditional before release");
  }
  return out;
}
