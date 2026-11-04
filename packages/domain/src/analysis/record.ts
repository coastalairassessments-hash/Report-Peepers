import { randomUUID } from "node:crypto";
import type { CaseSnapshot } from "@report-peepers/contracts";
import type { ApprovedView } from "../release.js";
import { isKnownCode, type PatternList } from "./patterns.js";
import { scrubText, type ScrubReason } from "./scrub.js";

/** One item from the closing summary, as saved for analysis (ADR-005). Wording is null when the scrub withheld it. */
export interface SummaryRecordItem {
  title: string | null; question: string | null; next_step: string | null; wording_withheld: boolean;
  finding_type: string; decision_relevance: string; evidence_strength: string;
  pattern_code: string | null; resolved_later: boolean; reviewer_changed: boolean;
}
export interface SummaryRecord { record_id: string; release_month: string; service_type: string; document_kinds: string[]; items: SummaryRecordItem[] }

/** The few case facts a record may carry. Month only, never a date. */
export interface RecordFacts { release_month: string; service_type: string; document_kinds: string[] }
/** The reviewer's tags, supplied beside the approved view (the contract itself is unchanged). */
export interface ReviewerTags { pattern_codes: Record<string, string>; resolved_later?: string[]; reviewer_changed?: string[] }

/** Listed for the reviewer only. Finding ids appear here and never in the record. */
export interface BuildNotice { finding_id: string; kind: "wording_withheld" | "missing_tag" | "unknown_code"; reasons?: ScrubReason[] }
export type BuildResult = { ok: true; record: SummaryRecord; notices: BuildNotice[] } | { ok: false; reason: "not_published" | "not_approved" | "bad_facts" };

export function factsFrom(s: Pick<CaseSnapshot, "release" | "scope" | "documents">): RecordFacts | null {
  const at = s.release.published_at;
  if (!at || !/^\d{4}-\d{2}/.test(at)) return null;
  return { release_month: at.slice(0, 7), service_type: s.scope.service_label, document_kinds: [...new Set(s.documents.map((d) => d.kind))].sort() };
}

/**
 * Builds the record by naming every field it may hold. Nothing else can pass: ids, dates, explanations, quotes, page
 * references, names, and anchors are never read. Wording is saved only when the scrub passes, otherwise codes only.
 */
export function buildSummaryRecord(view: ApprovedView, facts: RecordFacts, tags: ReviewerTags, blockedNames: string[], patterns: PatternList, newId: () => string = randomUUID): BuildResult {
  if (view.status !== "published") return { ok: false, reason: "not_published" };
  if (view.human_review.status !== "approved") return { ok: false, reason: "not_approved" };
  if (!/^\d{4}-\d{2}$/.test(facts.release_month)) return { ok: false, reason: "bad_facts" };

  const notices: BuildNotice[] = [];
  const resolved = new Set(tags.resolved_later ?? []), changed = new Set(tags.reviewer_changed ?? []);
  const items = view.findings.map((f): SummaryRecordItem => {
    const wording = { title: f.title, question: f.questions[0] ?? "", next_step: f.possible_next_steps[0] ?? "" };
    const results = Object.values(wording).filter(Boolean).map((t) => scrubText(t, blockedNames));
    const reasons = [...new Set(results.flatMap((r) => (r.ok ? [] : r.reasons)))];
    if (reasons.length) notices.push({ finding_id: f.id, kind: "wording_withheld", reasons });

    const given = tags.pattern_codes[f.id];
    let code: string | null;
    if (f.finding_type === "supported_reasoning") code = isKnownCode(patterns, given) ? given : null;
    else if (given === undefined) { code = "other"; notices.push({ finding_id: f.id, kind: "missing_tag" }); }
    else if (!isKnownCode(patterns, given)) { code = "other"; notices.push({ finding_id: f.id, kind: "unknown_code" }); }
    else code = given;

    const withheld = reasons.length > 0;
    return {
      title: withheld ? null : wording.title, question: withheld || !wording.question ? null : wording.question, next_step: withheld || !wording.next_step ? null : wording.next_step, wording_withheld: withheld,
      finding_type: f.finding_type, decision_relevance: f.decision_relevance, evidence_strength: f.evidence_strength,
      pattern_code: code, resolved_later: resolved.has(f.id), reviewer_changed: changed.has(f.id),
    };
  });
  // Sorted so the order cannot reveal the order of the original summary.
  items.sort((a, b) => (a.pattern_code ?? "").localeCompare(b.pattern_code ?? "") || a.finding_type.localeCompare(b.finding_type) || (a.title ?? "").localeCompare(b.title ?? ""));
  return { ok: true, notices, record: { record_id: newId(), release_month: facts.release_month, service_type: facts.service_type, document_kinds: [...facts.document_kinds].sort(), items } };
}
