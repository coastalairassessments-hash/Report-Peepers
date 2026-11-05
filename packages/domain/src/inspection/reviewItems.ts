import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Anchor } from "@report-peepers/contracts";
import { findAnchor } from "../ingest/anchors.js";
import type { ExtractedDocument } from "../ingest/extract.js";
import type { AuditRecord } from "../engine/audit.js";
import type { ModelPort } from "../engine/port.js";
import { runStage, type Stage } from "../engine/runStage.js";
import type { Checklist } from "./checklist.js";

const NES = { type: "string", minLength: 1, maxLength: 4000 } as const;
const obj = (required: string[], properties: Record<string, unknown>) => ({ type: "object", additionalProperties: false, required, properties });

export interface ReviewProposal {
  items: { item_id: string; exact_text: string; coverage: "full" | "partial"; states_not_done: boolean }[];
  conditions: { condition: string; exact_text: string }[];
}

/** What the model may say. The ids and condition names it may use are enumerated, so it cannot invent one. No status, severity, page or anchor field exists to set. */
export function reviewSchema(list: Checklist): object {
  return obj(["items", "conditions"], {
    items: { type: "array", maxItems: 200, items: obj(["item_id", "exact_text", "coverage", "states_not_done"], { item_id: { enum: list.items.map((i) => i.id) }, exact_text: NES, coverage: { enum: ["full", "partial"] }, states_not_done: { type: "boolean" } }) },
    conditions: { type: "array", maxItems: 50, items: obj(["condition", "exact_text"], { condition: { enum: list.applies_when_values }, exact_text: NES }) },
  });
}

export function reviewStage(list: Checklist): Stage<{ page: number; text: string }, ReviewProposal> {
  return {
    name: "review_inspection", promptVersion: "review_inspection.v1",
    instructions: readFileSync(resolve(import.meta.dirname, "../../../../data/rules/prompts/review_inspection.v1.md"), "utf8"),
    buildData: ({ page, text }) => ({ page, page_text: text, checklist: list.items.map((i) => ({ item_id: i.id, topic: i.topic, looks_for: i.looks_for })), conditions: list.applies_when_values }),
    schema: reviewSchema(list),
  };
}

export interface ReviewHit { item_id: string; page: number; anchor: Anchor; coverage: "full" | "partial"; states_not_done: boolean }
export interface ConditionHit { condition: string; page: number; anchor: Anchor }
export interface ReviewHeldBack { page: number; kind: "item" | "condition"; id: string; reason: "text_not_on_page" | "ambiguous_text" }
export interface ReviewPageIssue { page: number; issue: "no_text_layer" | "too_large" | "model_error" | "invalid_output"; detail: string }

/** Checks every quote against its page. The model's word is never the check. */
export function applyReview(doc: ExtractedDocument, documentVersionId: string, page: number, p: ReviewProposal): { hits: ReviewHit[]; conditions: ConditionHit[]; held_back: ReviewHeldBack[] } {
  const hits: ReviewHit[] = [], conditions: ConditionHit[] = [], held_back: ReviewHeldBack[] = [];
  for (const it of p.items) {
    const r = findAnchor(doc, documentVersionId, it.exact_text, { page });
    if (r.status !== "found") { held_back.push({ page, kind: "item", id: it.item_id, reason: r.status === "multiple_matches" ? "ambiguous_text" : "text_not_on_page" }); continue; }
    hits.push({ item_id: it.item_id, page, anchor: r.anchor, coverage: it.coverage, states_not_done: it.states_not_done });
  }
  for (const c of p.conditions) {
    const r = findAnchor(doc, documentVersionId, c.exact_text, { page });
    if (r.status !== "found") { held_back.push({ page, kind: "condition", id: c.condition, reason: r.status === "multiple_matches" ? "ambiguous_text" : "text_not_on_page" }); continue; }
    conditions.push({ condition: c.condition, page, anchor: r.anchor });
  }
  return { hits, conditions, held_back };
}

export type ItemStatus = "supported" | "partly_shown" | "not_shown" | "not_applicable" | "not_verifiable";
export type GapKind = "not_explained" | "not_performed" | "unknown";
export interface ItemResult { item_id: string; status: ItemStatus; gap_kind: GapKind | null; quotes: { page: number; anchor: Anchor; coverage: "full" | "partial" }[] }
export interface ReviewResult { results: ItemResult[]; conditions: string[]; held_back: ReviewHeldBack[]; page_issues: ReviewPageIssue[]; audit: AuditRecord[] }

/**
 * Reads the report page by page and sets each item's status by rule.
 * supported: a verified quote the model called a full answer. partly_shown: only partial quotes.
 * not_shown: every page was read and nothing was found. not_verifiable: some page could not be read, so absence cannot be claimed.
 * not_applicable: the item's condition was never shown on a page, and every page was read.
 * A status is a draft for the reviewer. Nothing here is approved.
 */
export async function reviewInspection(port: ModelPort, list: Checklist, doc: ExtractedDocument, documentVersionId: string, now?: () => string, maxChars = 12000): Promise<ReviewResult> {
  const out: ReviewResult = { results: [], conditions: [], held_back: [], page_issues: [], audit: [] };
  const stage = reviewStage(list);
  const hits: ReviewHit[] = [], condHits: ConditionHit[] = [];
  for (const pg of doc.pages) {
    if (pg.quality_flags.includes("no_text_layer") || pg.text.trim() === "") { out.page_issues.push({ page: pg.index, issue: "no_text_layer", detail: "This page has no readable text; it was not reviewed." }); continue; }
    if (pg.text.length > maxChars) { out.page_issues.push({ page: pg.index, issue: "too_large", detail: `The page text is ${pg.text.length} characters; the limit is ${maxChars}.` }); continue; }
    const r = await runStage(port, stage, { page: pg.index, text: pg.text }, now);
    out.audit.push(...r.audit);
    if (!r.ok) { out.page_issues.push({ page: pg.index, issue: r.issue, detail: r.errors.join("; ") }); continue; }
    const a = applyReview(doc, documentVersionId, pg.index, r.value);
    hits.push(...a.hits); condHits.push(...a.conditions); out.held_back.push(...a.held_back);
  }
  const allRead = out.page_issues.length === 0;
  const conds = new Set(condHits.map((c) => c.condition));
  out.conditions = [...conds].sort();
  for (const it of list.items) {
    const mine = hits.filter((h) => h.item_id === it.id);
    const quotes = mine.map((h) => ({ page: h.page, anchor: h.anchor, coverage: h.coverage }));
    if (it.applies_when !== "always" && !conds.has(it.applies_when)) { out.results.push({ item_id: it.id, status: allRead ? "not_applicable" : "not_verifiable", gap_kind: allRead ? null : "unknown", quotes }); continue; }
    if (mine.some((h) => h.coverage === "full" && !h.states_not_done)) { out.results.push({ item_id: it.id, status: "supported", gap_kind: null, quotes }); continue; }
    if (mine.length) { out.results.push({ item_id: it.id, status: "partly_shown", gap_kind: mine.some((h) => h.states_not_done) ? "not_performed" : "not_explained", quotes }); continue; }
    out.results.push({ item_id: it.id, status: allRead ? "not_shown" : "not_verifiable", gap_kind: allRead ? "not_explained" : "unknown", quotes });
  }
  return out;
}
