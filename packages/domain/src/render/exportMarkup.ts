import { createHash } from "node:crypto";
import type { CaseSnapshot } from "@report-peepers/contracts";
import { extractDocument } from "../ingest/extract.js";
import { exportRelease, type ApprovedView } from "../release.js";
import { canon } from "../revision.js";
import { planMarkup, loadMarkupConfig, type MarkupConfig, type MarkupPlan, type PlanIssue, type ReviewPages } from "./plan.js";
import { renderMarkup } from "./renderMarkup.js";
import { verifyMarkup, type VerifyProblem } from "./verifyMarkup.js";

const sha = (b: Uint8Array | string) => createHash("sha256").update(b).digest("hex");

export type MarkupExport =
  | { ok: true; pdf: Uint8Array; text: string; plan: MarkupPlan; issues: PlanIssue[]; hashes: { source_sha256: string; view_sha256: string; plan_sha256: string; output_sha256: string } }
  | { ok: false; reason: "not_published" | "snapshot_changed" | "superseded_notice" | "withdrawn_notice" | "unknown_document" | "source_mismatch" | "unreadable_source" | "render_failed" | "verification_failed"; notice?: string; detail?: string; problems?: VerifyProblem[] };

/** The plain-text version: the same numbers and wording as the marked-up pages, built from the same plan. */
export function markupText(plan: MarkupPlan): string {
  const L: string[] = [plan.summary.title, ""];
  const s = plan.summary;
  if (s.items_to_clarify_statement) L.push(s.items_to_clarify_statement, "");
  if (s.leading_questions.length) { L.push(plan.labels.questions_heading); s.leading_questions.forEach((q, i) => L.push(`${i + 1}. ${q}`)); L.push(""); }
  for (const g of s.groups) {
    L.push(g.heading);
    for (const i of g.items) L.push(`${i.number}. ${i.title} (${i.page === null ? "no location" : `report page ${i.page}${i.label && i.label !== String(i.page) ? `, printed ${i.label}` : ""}`}; evidence ${i.strength})${i.next_step ? ` Possible next step: ${i.next_step}` : ""}`);
    L.push("");
  }
  const notes = plan.pages.flatMap((p) => p.notes.map((n) => ({ page: p.index, n })));
  if (notes.length) { L.push("Notes written in the margins"); for (const { page, n } of notes) L.push(`${n.number === null ? "-" : `${n.number}.`} (page ${page}) ${n.text}`); L.push(""); }
  const rv = s.review;
  if (rv) {
    const sec = (h: string, xs: string[]) => { if (xs.length) { L.push(h); xs.forEach((x) => L.push(`- ${x}`)); L.push(""); } };
    sec(plan.labels.done_well_heading, rv.done_well); sec(plan.labels.review_questions_heading, rv.questions); sec(plan.labels.not_expected_heading, rv.not_expected); sec(plan.labels.not_checked_heading, rv.not_checked);
  }
  if (plan.overflow.length) { L.push(plan.labels.notes_sheet_title); for (const o of plan.overflow) L.push(`${o.number}.${o.page === null ? "" : ` (report page ${o.page})`} ${o.text}`); L.push(""); }
  if (s.limits.length) { L.push(plan.labels.limits_heading); s.limits.forEach((x) => L.push(`- ${x}`)); L.push(""); }
  L.push(s.method_statement);
  return L.join("\n");
}

/**
 * Release gates, then plan, draw, read back, and verify. Any failure returns a reason and no files.
 * The source must be the exact file the release was written against (content hash).
 */
export async function exportMarkup(snapshot: CaseSnapshot, publishedFingerprint: string, sourcePdf: Uint8Array, documentVersionId: string, cfg: MarkupConfig = loadMarkupConfig(), review?: ReviewPages): Promise<MarkupExport> {
  const rel = exportRelease(snapshot as never, publishedFingerprint);
  if (!rel.ok) return { ok: false, reason: rel.reason, ...(rel.notice ? { notice: rel.notice } : {}) };
  const document = snapshot.documents.find((d) => d.id === documentVersionId);
  if (!document) return { ok: false, reason: "unknown_document", detail: `The release has no document ${documentVersionId}.` };
  const sourceHash = sha(sourcePdf);
  if (sourceHash !== document.content_sha256) return { ok: false, reason: "source_mismatch", detail: "The file supplied is not the file this release was written against." };

  let source;
  try { source = await extractDocument(sourcePdf); } catch (e) { return { ok: false, reason: "unreadable_source", detail: e instanceof Error ? e.message : String(e) }; }

  const plan = planMarkup(rel.view as ApprovedView, source, documentVersionId, cfg, review);
  const drawn = await renderMarkup(sourcePdf, plan);
  if (!drawn.ok) return { ok: false, reason: "render_failed", detail: `${drawn.reason}: ${drawn.diagnostics}` };

  let output;
  try { output = await extractDocument(drawn.pdf); } catch (e) { return { ok: false, reason: "verification_failed", detail: `The finished file could not be read back: ${e instanceof Error ? e.message : String(e)}` }; }
  const v = verifyMarkup(source, output, plan);
  if (!v.ok) return { ok: false, reason: "verification_failed", problems: v.problems };

  return { ok: true, pdf: drawn.pdf, text: markupText(plan), plan, issues: plan.issues, hashes: { source_sha256: sourceHash, view_sha256: rel.hash, plan_sha256: sha(canon(plan)), output_sha256: sha(drawn.pdf) } };
}
