import { createHash } from "node:crypto";
import type { Anchor, CaseSnapshot as Snap } from "@report-peepers/contracts";
import { canon, fingerprint } from "./revision.js";

export interface ApprovedView {
  release_id: string;
  case_revision_id: string;
  status: Snap["release"]["status"];
  overview: string;
  human_review: { status: Snap["release"]["human_review_status"]; reviewer_id: string | null; reviewer_scope: string | null; conflict_disclosure?: string };
  leading_questions: string[];
  findings: {
    id: string; title: string; finding_type: string; explanation: string; evidence_strength: string; decision_relevance: string;
    uncertainty: string; questions: string[]; possible_next_steps: string[]; resolution_condition: string; resolution_status: string;
    /** Where in the report this rests: the anchors of its supporting and counter evidence, so every output can point at the same spots. */
    sources: { role: "support" | "counter"; anchor: Anchor }[];
  }[];
  coverage_limitations: string[];
  changes: Snap["release"]["changes"];
  method: {
    statement: string; rule_pack_version: string; reference_snapshot_id: string;
    model_version: string; prompt_version: string; input_snapshot_sha256: string; run_id: string;
  };
}

const METHOD_STATEMENT = "This is a document review by software, based only on the files and answers you provided. It is not an inspection of the building, and it is not an expert, legal, insurance or medical opinion. It does not say whether a building is safe or whether anyone's work was proper. Questions are suggestions for a conversation. Where words came from an image, please check them against your original. Customary practice, not any specific published standard, is the reference. This marked-up copy is for your own use in talking with the report's author or your advisers.";

/** The single approved result. The screen, PDF, and text export must all come from this and nothing else. */
export function buildApprovedView(s: Snap): ApprovedView {
  const q = new Map(s.questions.map((x) => [x.id, x.text]));
  const f = new Map(s.findings.map((x) => [x.id, x]));
  const ev = new Map(s.evidence.map((e) => [e.id, e]));
  const order = [...s.release.attention_finding_ids, ...s.release.supported_finding_ids];
  return {
    release_id: s.release.id, case_revision_id: s.release.case_revision_id, status: s.release.status, overview: s.release.overview,
    human_review: { status: s.release.human_review_status, reviewer_id: s.release.reviewer_id, reviewer_scope: s.release.reviewer_scope, ...(s.release.reviewer_conflict_disclosure?.trim() ? { conflict_disclosure: s.release.reviewer_conflict_disclosure.trim() } : {}) },
    leading_questions: s.release.leading_question_ids.map((id) => q.get(id) ?? "").filter(Boolean),
    findings: order.flatMap((id) => {
      const x = f.get(id);
      return x ? [{
        id: x.id, title: x.title, finding_type: x.finding_type, explanation: x.explanation, evidence_strength: x.evidence_strength,
        decision_relevance: x.decision_relevance, uncertainty: x.uncertainty, questions: x.question_ids.map((qid) => q.get(qid) ?? "").filter(Boolean),
        possible_next_steps: x.possible_next_steps, resolution_condition: x.resolution_condition, resolution_status: x.resolution_status,
        sources: [...x.support_evidence_ids.map((id) => ["support", id] as const), ...x.counter_evidence_ids.map((id) => ["counter", id] as const)]
          .flatMap(([role, id]) => { const e = ev.get(id); return e ? [{ role, anchor: structuredClone(e.anchor) }] : []; }),
      }] : [];
    }),
    coverage_limitations: s.release.coverage_limitations,
    changes: s.release.changes,
    method: { statement: METHOD_STATEMENT, ...s.provenance, rule_pack_version: s.provenance.rule_pack_version },
  };
}

/** A page reference in words: PDF page, plus the printed label when it differs. */
export function locationText(a: Anchor): string {
  if (a.pdf_page_index_1based === null) return "location not recorded";
  const label = a.printed_page_label && a.printed_page_label !== String(a.pdf_page_index_1based) ? ` (printed page ${a.printed_page_label})` : "";
  return `page ${a.pdf_page_index_1based}${label}`;
}

/** Plain text. Content is carried as written, never interpreted as markup. */
export function renderText(v: ApprovedView): string {
  const L: string[] = [];
  L.push(`Review ${v.release_id} (revision ${v.case_revision_id})`, "", v.overview, "");
  L.push(`Human review: ${v.human_review.status}${v.human_review.reviewer_id ? ` by ${v.human_review.reviewer_id}` : ""}${v.human_review.reviewer_scope ? ` (scope: ${v.human_review.reviewer_scope})` : ""}`, "");
  if (v.human_review.conflict_disclosure) L.push(`Reviewer conflict disclosure: ${v.human_review.conflict_disclosure}`, "");
  if (v.leading_questions.length) { L.push("Questions to ask the inspector:"); v.leading_questions.forEach((x, i) => L.push(`${i + 1}. ${x}`)); L.push(""); }
  for (const x of v.findings) {
    L.push(`Finding ${x.id}: ${x.title} [${x.finding_type}; evidence ${x.evidence_strength}; ${x.decision_relevance}; ${x.resolution_status}]`, x.explanation, `Uncertainty: ${x.uncertainty}`);
    for (const src of x.sources) L.push(`Source (${src.role}): ${locationText(src.anchor)}`);
    x.questions.forEach((y) => L.push(`Question: ${y}`));
    x.possible_next_steps.forEach((y) => L.push(`Possible next step: ${y}`));
    L.push(`Resolves when: ${x.resolution_condition}`, "");
  }
  if (v.coverage_limitations.length) { L.push("Limits of this review:"); v.coverage_limitations.forEach((y) => L.push(`- ${y}`)); L.push(""); }
  if (v.changes.length) { L.push("Changes since the earlier release:"); v.changes.forEach((c) => L.push(`- ${c.finding_id}: ${c.change_type}. ${c.reason}`)); L.push(""); }
  L.push("Method:", v.method.statement, `Rule pack ${v.method.rule_pack_version}; reference snapshot ${v.method.reference_snapshot_id}; model ${v.method.model_version}; prompt ${v.method.prompt_version}; run ${v.method.run_id}.`);
  return L.join("\n");
}

export const viewHash = (v: ApprovedView): string => createHash("sha256").update(canon(v)).digest("hex");

export type ExportResult =
  | { ok: true; view: ApprovedView; text: string; hash: string }
  | { ok: false; reason: "not_published" | "snapshot_changed" | "superseded_notice" | "withdrawn_notice"; notice?: string };

/** Export only a published release that is unchanged since publication. Replaced or withdrawn releases return a notice, not an error. */
export function exportRelease(s: Snap, publishedFingerprint: string): ExportResult {
  if (s.release.status === "superseded") return { ok: false, reason: "superseded_notice", notice: `Release ${s.release.id} has been replaced by a newer release. Open the latest release for the current review.` };
  if (s.release.status === "withdrawn") return { ok: false, reason: "withdrawn_notice", notice: `Release ${s.release.id} has been withdrawn. Contact support for an explanation.` };
  if (s.release.status !== "published") return { ok: false, reason: "not_published" };
  if (fingerprint(s) !== publishedFingerprint) return { ok: false, reason: "snapshot_changed" };
  const view = buildApprovedView(s);
  return { ok: true, view, text: renderText(view), hash: viewHash(view) };
}
