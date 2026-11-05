import type { CaseSnapshot } from "@report-peepers/contracts";
import { validateCaseSnapshot } from "@report-peepers/contracts";
import { buildAreas } from "../inspection/areas.js";
import { reviewInspection } from "../inspection/reviewItems.js";
import { checkConsistency } from "../inspection/consistency.js";
import { checkSelfConsistency } from "../inspection/selfConsistency.js";
import { buildEvidenceMap } from "../inspection/evidenceMap.js";
import { recordsReceived } from "../intake.js";
import { contextExpectations } from "../context.js";
import { buildInspectionReview } from "../inspection/gaps.js";
import { sha256Hex } from "./hash.js";
import { extractEvidenceFromDocument } from "../engine/extractEvidence.js";
import { proposeFindings } from "../engine/proposeFindings.js";
import { extractDocument } from "../ingest/extract.js";
import { ocrDocument } from "../ingest/ocr.js";
import { checkAnchors } from "../ingest/checkAnchors.js";
import { checkIntegrity } from "../integrity.js";
import { fingerprint } from "../revision.js";
import { move, type StepFailure } from "./intake.js";
import type { CaseRecord, ProcessingIssue, Services } from "./types.js";

export const DOCUMENT_VERSION_ID = "DOC-001-v1";

const issue = (svc: Services, stage: ProcessingIssue["stage"], code: string, detail: string, page?: number): ProcessingIssue => ({ id: svc.newId("ISS"), stage, code, detail, ...(page !== undefined ? { page } : {}), acknowledged: false });

/** Marks the case failed with the reason on record, never a guessed result. */
async function fail(svc: Services, rec: CaseRecord, reason: string, detail: string, extra: ProcessingIssue[] = []): Promise<StepFailure & { state: "failed" }> {
  rec.issues = [...rec.issues, ...extra, issue(svc, "integrity", reason, detail)];
  const m = move(rec, "failed");
  if (!m.ok) throw new Error(`Unexpected: ${m.reason}`);
  await svc.repo.save({ role: "system" }, rec);
  return { ok: false, reason, detail, state: "failed" };
}

/** The empty case the pipeline builds first: scope, the one document, one whole-report area. Evidence and claims are added by extraction. */
function skeleton(svc: Services, rec: CaseRecord, pages: number, status: "readable" | "partially_readable"): CaseSnapshot {
  const area = svc.pipeline.whole_report_area, src = rec.source!;
  return {
    schema_version: "0.2", case_id: rec.id, case_revision_id: `REV-${rec.id}`, episode_id: "EP-001",
    scope: rec.scope!,
    documents: [{ id: DOCUMENT_VERSION_ID, version: 1, display_name: src.display_name, content_sha256: src.sha256, kind: "assessment", status, page_count: pages, episode_id: "EP-001" }],
    client_statements: [], evidence: [],
    areas: [{ id: area.id, name: area.name, parent_id: null, kind: "building", condition_status: "unclear_documentation", assessed_scope: "The report has not yet been divided into rooms or areas; the whole report is treated as one area.", time_context: null, basis_evidence_ids: [], uncertainties: ["Rooms and areas have not been identified."] }],
    connections: [], measurements: [], monitoring_series: [], samples: [], claims: [], hypotheses: [], proposed_actions: [], references: [], questions: [], findings: [],
    release: { id: "REL-001", status: "awaiting_approval", case_revision_id: `REV-${rec.id}`, overview: "Draft review awaiting a human reviewer.", supported_finding_ids: [], attention_finding_ids: [], leading_question_ids: [], coverage_limitations: [], human_review_status: "pending", reviewer_id: null, reviewer_scope: null, published_at: null, supersedes_release_id: null, changes: [], reviewer_conflict_disclosure: null },
    provenance: { rule_pack_version: svc.pipeline.rule_pack_version, reference_snapshot_id: svc.pipeline.reference_snapshot_id, prompt_version: "extract_evidence.v2 + propose_findings.v1", model_version: "", input_snapshot_sha256: "", run_id: "" },
  } as CaseSnapshot;
}

/**
 * Reads the report, extracts evidence, proposes drafts, and runs every check. The result is a snapshot of unapproved drafts
 * waiting for a human, or a failed case with the reason. Each page the model could not handle, and everything the checks held back, is listed.
 */
export async function runAnalysis(svc: Services, caseId: string): Promise<{ ok: true; state: "awaiting_reviewer"; issues: number } | (StepFailure & { state: string })> {
  const sys = { role: "system" } as const;
  const rec = await svc.repo.get(sys, caseId);
  if (!rec) return { ok: false, reason: "not_found", state: "unknown" };
  if (rec.state !== "ready_for_analysis" && rec.state !== "failed") return { ok: false, reason: "wrong_state", detail: rec.state, state: rec.state };

  const entitled = await svc.entitlement.verified(rec.id, rec.owner_id);
  const first = move(rec, "analysis", { retryable: true, sameSnapshotOrNewRun: true, entitlementVerified: entitled, attemptCapOk: rec.attempts < svc.pipeline.max_analysis_attempts });
  if (!first.ok) return { ok: false, reason: first.reason, ...(first.missing ? { missing: first.missing } : {}), state: rec.state };
  rec.attempts += 1;
  rec.snapshot = null;
  await svc.repo.save(sys, rec);

  let bytes: Uint8Array;
  try { bytes = await svc.files.get(rec.source!.file_ref); } catch { return fail(svc, rec, "source_missing", "The uploaded file could not be found."); }
  if (sha256Hex(bytes) !== rec.source!.sha256) return fail(svc, rec, "source_changed", "The stored file no longer matches the file that was checked at upload.");

  let doc;
  try { doc = await extractDocument(bytes); } catch (e) { return fail(svc, rec, "unreadable", e instanceof Error ? e.message : "The file could not be read."); }
  if (svc.ocr) doc = await ocrDocument(doc, bytes, svc.ocr.port, svc.ocr.renderer);

  const ex = await extractEvidenceFromDocument(svc.model, doc, DOCUMENT_VERSION_ID, svc.extraction, svc.now);
  const found: ProcessingIssue[] = [
    ...ex.page_issues.map((p) => issue(svc, "extraction", p.issue, p.detail, p.page)),
    ...ex.held_back.map((h) => issue(svc, "extraction", `held_back_${h.reason}`, `A proposed ${h.kind} (${h.local_id}) was not accepted: ${h.reason.replace(/_/g, " ")}.`, h.page)),
  ];
  if (ex.evidence.length === 0) return fail(svc, rec, "nothing_extracted", "No evidence could be extracted from the report.", found);

  const snap = skeleton(svc, rec, doc.page_count, doc.status === "readable" ? "readable" : "partially_readable");
  const areaId = svc.pipeline.whole_report_area.id;
  const rooms = buildAreas(ex.area_labels, svc.pipeline.whole_report_area);
  snap.evidence = ex.evidence.map((e) => ({ ...e, area_ids: rooms.areaIdsFor(e.id) }));
  snap.claims = ex.claims.map((c) => ({ ...c, area_ids: rooms.areaIdsFor(c.id) }));
  snap.areas[0]!.basis_evidence_ids = snap.evidence.map((e) => e.id);
  for (const a of rooms.areas) a.basis_evidence_ids = snap.evidence.filter((e) => e.area_ids.includes(a.id)).map((e) => e.id);
  snap.areas.push(...rooms.areas);
  const modelOf = (a: { model_name: string; model_version: string }[]) => [...new Set(a.map((x) => `${x.model_name}@${x.model_version}`))].join(", ") || "none";
  snap.provenance.model_version = modelOf(ex.audit);
  snap.provenance.input_snapshot_sha256 = fingerprint(snap);
  snap.provenance.run_id = svc.newId("RUN");
  const valid = validateCaseSnapshot(snap);
  if (!valid.ok) return fail(svc, rec, "snapshot_invalid", valid.errors.slice(0, 5).join("; "), found);

  const prop = await proposeFindings(svc.model, snap, svc.now);
  if (!prop.ok) return fail(svc, rec, prop.issue, prop.errors.join("; "), found);
  const next = prop.result.snapshot;
  for (const h of prop.result.held_back) found.push(issue(svc, "proposal", `held_back_${h.kind}`, `A proposed ${h.kind} (${h.id}) was held back by the checks: ${[...new Set(h.issues.map((i) => i.code))].join(", ")}.`));

  let inspectionReview = null;
  const reviewAudit = [];
  if (svc.inspection) {
    const i = svc.inspection;
    const rv = await reviewInspection(svc.model, i.checklist, doc, DOCUMENT_VERSION_ID, svc.now);
    reviewAudit.push(...rv.audit);
    for (const p of rv.page_issues) found.push(issue(svc, "inspection_review", p.issue, p.detail, p.page));
    for (const h of rv.held_back) found.push(issue(svc, "inspection_review", `held_back_${h.reason}`, `A proposed ${h.kind} (${h.id}) was not accepted: ${h.reason.replace(/_/g, " ")}.`, h.page));
    const imagePages = new Set(doc.pages.filter((p) => p.quality_flags.includes("read_from_image")).map((p) => p.index));
    inspectionReview = buildInspectionReview({
      checklist: i.checklist, review: rv, flags: checkConsistency(next, doc, i.consistency, rv.page_issues.length === 0), contradictions: checkSelfConsistency(doc, i.selfConsistency),
      map: buildEvidenceMap(next, i.evidenceMap), recordsReceived: recordsReceived(rec.answers), contextQuestions: i.expectations && rec.context ? contextExpectations(i.expectations, rec.context, doc.pages.map((p) => p.text).join("\n"), rv.page_issues.length === 0) : [], leadingMax: svc.markup.leading_questions_max, claims: next.claims, imagePages, wording: i.wording,
    });
    for (const h of inspectionReview.held_back) found.push(issue(svc, "inspection_review", "held_back_question", `A question (${h.id}) was held back by the wording rules: ${h.problems.join(", ")}.`));
  }

  const audit = [...ex.audit, ...prop.audit, ...reviewAudit];
  next.provenance.model_version = modelOf(audit);

  const attention = next.findings.filter((f) => f.finding_type !== "supported_reasoning").map((f) => f.id);
  next.release.attention_finding_ids = attention;
  next.release.supported_finding_ids = next.findings.filter((f) => f.finding_type === "supported_reasoning").map((f) => f.id);
  next.release.leading_question_ids = next.questions.filter((q) => next.findings.some((f) => f.question_ids.includes(q.id))).map((q) => q.id).slice(0, svc.markup.leading_questions_max);
  next.release.coverage_limitations = ex.page_issues.map((p) => (p.issue === "no_text_layer" ? `Page ${p.page} has no readable text and was not reviewed.` : `Page ${p.page} could not be reviewed (${p.issue.replace(/_/g, " ")}).`));

  const integrity = checkIntegrity(next), anchors = checkAnchors(next, { [DOCUMENT_VERSION_ID]: doc });
  if (integrity.length || anchors.length) return fail(svc, rec, "integrity", [...integrity, ...anchors].slice(0, 5).map((i) => `${i.code} at ${i.path}`).join("; "), found);

  rec.snapshot = next;
  if (inspectionReview) rec.inspection_review = inspectionReview;
  rec.issues = [...rec.issues, ...found];
  const m = move(rec, "awaiting_reviewer", { typedOutputValidated: true, ambiguitiesAddressed: true, referencesVerified: next.references.length === 0, prohibitedClaimsAbsent: true });
  if (!m.ok) return fail(svc, rec, m.reason, (m.missing ?? []).join(", "));
  await svc.repo.save(sys, rec);
  return { ok: true, state: "awaiting_reviewer", issues: found.length };
}

/** Puts a case in front of one reviewer. Only the system does this; a reviewer never picks their own case. */
export async function assignReviewer(svc: Services, caseId: string, reviewerId: string): Promise<{ ok: true } | StepFailure> {
  const sys = { role: "system" } as const;
  const rec = await svc.repo.get(sys, caseId);
  if (!rec) return { ok: false, reason: "not_found" };
  if (rec.state !== "awaiting_reviewer") return { ok: false, reason: "wrong_state", detail: rec.state };
  rec.reviewer_id = reviewerId;
  await svc.repo.save(sys, rec);
  return { ok: true };
}
