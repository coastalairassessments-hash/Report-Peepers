import type { CaseSnapshot } from "@report-peepers/contracts";
import { checkAnchors } from "../ingest/checkAnchors.js";
import { extractDocument } from "../ingest/extract.js";
import { ocrDocument } from "../ingest/ocr.js";
import { checkIntegrity, stripQuoted, wordingProblems } from "../integrity.js";
import { outcomeOf } from "../analysis/weaknessReport.js";
import { exportMarkup } from "../render/exportMarkup.js";
import type { ReviewPages } from "../render/plan.js";
import { buildSummaryRecord, factsFrom } from "../analysis/record.js";
import { blockedNamesFrom } from "../analysis/scrub.js";
import { validateCaseSnapshot } from "@report-peepers/contracts";
import { exportRelease } from "../release.js";
import { fingerprint } from "../revision.js";
import { DOCUMENT_VERSION_ID } from "./analyze.js";
import { sha256Hex } from "./hash.js";
import { move, type StepFailure } from "./intake.js";
import type { Actor, ProcessingIssue, ReleasedOutputs, Services } from "./types.js";
import { citationProblems } from "../inspection/noCitations.js";

/** Plain facts about a draft. The gates read only these, so they can be tested without a PDF. */
export interface GateInput {
  /** Every sentence a homeowner would read. */
  sentences: string[];
  contractValid: boolean;
  integrityIssues: number;
  /** Quotes that were not found word for word on their page in the source file. */
  anchorProblems: number;
  sourceIntact: boolean;
  entitled: boolean;
  pagesTotal: number;
  unreadablePages: number;
  heldBack: number;
  maxHeldBack: number;
}
export interface GateFailure { gate: string; detail: string }
export interface GateResult { ok: boolean; failed: GateFailure[] }

/**
 * ADR-006. The checks stand in for the reviewer: every gate must pass or nothing is released.
 * Findings that need a person (departures from a reference) are removed before this runs, not blocked here.
 */
export function autoReleaseGates(i: GateInput): GateResult {
  const failed: GateFailure[] = [];
  const no = (gate: string, detail: string) => failed.push({ gate, detail });
  if (i.sentences.length === 0) no("nothing_to_release", "There is no customer-facing text to release.");
  const w = i.sentences.flatMap((s) => wordingProblems(s));
  if (w.length) no("wording", `${w.length} wording problem${w.length === 1 ? "" : "s"}`);
  // Only our own words are held to the no-citation rule. What the inspector wrote, in quotation marks, is theirs.
  const c = i.sentences.flatMap((s) => citationProblems(stripQuoted(s)));
  if (c.length) no("no_citations", `${c.length} sentence${c.length === 1 ? "" : "s"} name a standard or claim compliance`);
  if (!i.contractValid) no("contract_valid", "The snapshot does not match the contract.");
  if (i.integrityIssues > 0) no("integrity", `${i.integrityIssues} integrity issue${i.integrityIssues === 1 ? "" : "s"}`);
  if (i.anchorProblems > 0) no("quotes_verbatim", `${i.anchorProblems} quote${i.anchorProblems === 1 ? "" : "s"} not found word for word on the page`);
  if (!i.sourceIntact) no("source_intact", "The stored file no longer matches the file received.");
  if (!i.entitled) no("entitlement", "Entitlement was not verified.");
  if (i.pagesTotal <= 0 || i.unreadablePages >= i.pagesTotal) no("readable", "No page of the report could be read.");
  if (i.heldBack > i.maxHeldBack) no("held_back_limit", `${i.heldBack} items were held back, above the limit of ${i.maxHeldBack}.`);
  return { ok: failed.length === 0, failed };
}

const AUTO_OVERVIEW = "This is an automated second look at the report you supplied. It lists what the report does well and questions you may want to ask the inspector. It is not an inspection of the building and not an expert opinion.";
const AUTO_DISCLOSURE = "No person reviewed this release. It was produced and checked by the program.";
const UNREADABLE = new Set(["no_text_layer", "too_large", "model_error", "invalid_output", "ocr_failed", "ocr_skipped_page_limit"]);
const DEFAULT_MAX_HELD_BACK = 25;

export type AutoReleaseResult =
  | { ok: true; record_saved: boolean; excluded_finding_ids: string[]; notices: { finding_id: string; kind: string }[] }
  | (StepFailure & { failed_gates?: GateFailure[] });

/** The review pages in plain strings, from the inspection review the checks built. */
export const reviewPagesOf = (r: import("../inspection/gaps.js").InspectionReview | null | undefined): ReviewPages | undefined =>
  r ? { done_well: r.done_well.map((d) => d.text), questions: [...r.questions].sort((a, b) => Number(b.placement === "page_one") - Number(a.placement === "page_one")).map((q) => (q.request ? `${q.text} ${q.request}` : q.text)), not_expected: [...r.not_expected], not_checked: [...r.not_checked] } : undefined;

const sentencesOf = (snap: CaseSnapshot, rec: { inspection_review?: import("../inspection/gaps.js").InspectionReview | null }): string[] => {
  const out: string[] = [snap.release.overview, ...snap.release.coverage_limitations, ...snap.questions.map((q) => q.text)];
  for (const f of snap.findings) out.push(f.title, f.explanation, f.uncertainty, f.resolution_condition, ...f.possible_next_steps);
  const r = rec.inspection_review;
  if (r) {
    for (const q of r.questions) out.push(q.text, q.why, ...(q.request ? [q.request] : []));
    for (const d of r.done_well) out.push(d.text);
    out.push(...r.not_checked, ...r.not_expected);
  }
  return out.filter((s) => s.trim() !== "");
};

/**
 * ADR-006. Releases a drafted review with no person, or sends the case to "needs attention" and releases nothing.
 * Findings that need a person (departures from a reference) are left out, not released. Every check runs before anything is saved as released.
 */
export async function releaseAutomatically(svc: Services, caseId: string): Promise<AutoReleaseResult> {
  const actor: Actor = { role: "system" };
  const rec = await svc.repo.get(actor, caseId);
  if (!rec) return { ok: false, reason: "not_found" };
  if ((rec.state !== "awaiting_reviewer" && rec.state !== "needs_attention") || !rec.snapshot || !rec.source || !rec.scope) return { ok: false, reason: "wrong_state", detail: rec.state };

  const snap = structuredClone(rec.snapshot) as CaseSnapshot;
  const excluded = snap.findings.filter((f) => f.finding_type === "verified_reference_departure").map((f) => f.id);
  snap.findings = snap.findings.filter((f) => !excluded.includes(f.id));
  const usedQ = new Set(snap.findings.flatMap((f) => f.question_ids));
  snap.questions = snap.questions.filter((q) => usedQ.has(q.id));
  snap.schema_version = "0.3";
  snap.release = {
    ...snap.release, status: "published", human_review_status: "automatic", release_mode: "automatic", reviewer_id: "automatic", reviewer_scope: "Automated checks. No person reviewed this release.",
    published_at: svc.now(), overview: AUTO_OVERVIEW, reviewer_conflict_disclosure: AUTO_DISCLOSURE,
    attention_finding_ids: snap.findings.filter((f) => f.finding_type !== "supported_reasoning").map((f) => f.id),
    supported_finding_ids: snap.findings.filter((f) => f.finding_type === "supported_reasoning").map((f) => f.id),
    leading_question_ids: snap.questions.map((q) => q.id).slice(0, svc.markup.leading_questions_max),
  };

  const facts0 = factsFrom(snap);
  const recordOutcome = async (gates: { ok: boolean; failed: readonly { gate: string }[] }) => {
    if (!svc.outcomes || !facts0) return;
    try { await svc.outcomes.save(outcomeOf(facts0, gates)); } catch { /* A failure to count never blocks a release. */ }
  };
  const entitled = await svc.entitlement.verified(rec.id, rec.owner_id);
  let bytes: Uint8Array | null = null;
  try { bytes = await svc.files.get(rec.source.file_ref); } catch { bytes = null; }
  const sourceIntact = bytes !== null && sha256Hex(bytes) === rec.source.sha256;

  let anchorProblems = 0;
  if (bytes && sourceIntact) {
    try {
      let doc = await extractDocument(bytes);
      if (svc.ocr) doc = await ocrDocument(doc, bytes, svc.ocr.port, svc.ocr.renderer);
      anchorProblems = checkAnchors(snap, { [DOCUMENT_VERSION_ID]: doc }).length;
    } catch { anchorProblems = Number.MAX_SAFE_INTEGER; }
  }
  const pagesUnread = new Set(rec.issues.filter((i) => UNREADABLE.has(i.code) && i.page !== undefined).map((i) => i.page));
  const gates = autoReleaseGates({
    sentences: sentencesOf(snap, rec), contractValid: validateCaseSnapshot(snap).ok, integrityIssues: checkIntegrity(snap).length, anchorProblems,
    sourceIntact, entitled, pagesTotal: rec.source.page_count, unreadablePages: pagesUnread.size,
    heldBack: rec.issues.filter((i) => i.code.startsWith("held_back_")).length, maxHeldBack: svc.pipeline.auto_release?.max_held_back ?? DEFAULT_MAX_HELD_BACK,
  });

  const toAttention = async (failed: GateFailure[], extra?: string) => {
    if (rec.state !== "needs_attention") { const m = move(rec, "needs_attention"); if (!m.ok) return { ok: false as const, reason: m.reason }; }
    const mk = (g: GateFailure): ProcessingIssue => ({ id: svc.newId("ISS"), stage: "integrity", code: `auto_release_${g.gate}`, detail: g.detail, acknowledged: false });
    rec.issues = [...rec.issues.filter((i) => !i.code.startsWith("auto_release_")), ...failed.map(mk)];
    await svc.repo.save(actor, rec);
    await recordOutcome({ ok: false, failed });
    return { ok: false as const, reason: "needs_attention", ...(extra ? { detail: extra } : {}), failed_gates: failed };
  };
  if (!gates.ok) return toAttention(gates.failed);

  const fp = fingerprint(snap as never);
  const out = await exportMarkup(snap, fp, bytes!, DOCUMENT_VERSION_ID, svc.markup, reviewPagesOf(rec.inspection_review));
  if (!out.ok) return toAttention([{ gate: `markup_${out.reason}`, detail: out.detail ?? "The marked-up copy could not be built and verified." }]);
  const exp = exportRelease(snap as never, fp);
  const facts = factsFrom(snap);
  if (!exp.ok || !facts) return toAttention([{ gate: "release_not_exportable", detail: "The release could not be exported." }]);
  const built = buildSummaryRecord(exp.view, facts, { pattern_codes: {}, reviewer_changed: [] }, blockedNamesFrom(snap), svc.patterns);
  if (!built.ok) return toAttention([{ gate: `record_${built.reason}`, detail: "The anonymous record could not be built." }]);

  if (rec.state === "needs_attention") { const back = move(rec, "awaiting_reviewer"); if (!back.ok) return { ok: false, reason: back.reason }; await svc.repo.save(actor, rec); }
  const t = move(rec, "released", { releaseMode: "automatic", automaticGatesPassed: true, activeRevisionUnchanged: true, entitlementVerified: entitled, rightsRechecked: sourceIntact, releaseImmutableAligned: true });
  if (!t.ok) return { ok: false, reason: t.reason, ...(t.missing ? { missing: t.missing } : {}) };

  const outputs: ReleasedOutputs = { markup_pdf: out.pdf, text: out.text, hashes: out.hashes, record_id: built.record.record_id, delivered_at: svc.now() };
  rec.snapshot = snap; rec.published_fingerprint = fp; rec.released = outputs;
  rec.issues = rec.issues.filter((i) => !i.code.startsWith("auto_release_"));
  await svc.repo.save(actor, rec);
  let saved = true;
  try { await svc.records.save(built.record); } catch { saved = false; }
  await recordOutcome({ ok: true, failed: [] });
  return { ok: true, record_saved: saved, excluded_finding_ids: excluded, notices: built.notices.map((n) => ({ finding_id: n.finding_id, kind: n.kind })) };
}
