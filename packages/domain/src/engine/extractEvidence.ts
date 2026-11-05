import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { CaseSnapshot } from "@report-peepers/contracts";
import { findAnchor } from "../ingest/anchors.js";
import type { ExtractedDocument } from "../ingest/extract.js";
import type { AuditRecord } from "./audit.js";
import type { ModelPort } from "./port.js";
import { runStage, type Stage } from "./runStage.js";

type Evidence = CaseSnapshot["evidence"][number];
type Claim = CaseSnapshot["claims"][number];

const NES = { type: "string", minLength: 1, maxLength: 4000 } as const;
const LOCAL = { type: "string", pattern: "^[A-Za-z0-9_-]{1,40}$" } as const;
const AREA = { type: "string", minLength: 1, maxLength: 120 } as const;
const obj = (required: string[], properties: Record<string, unknown>) => ({ type: "object", additionalProperties: false, required, properties });

/**
 * What the model may say. No page, box, anchor, id, quality, or time field: code builds those.
 * Every object forbids extra fields, so a model cannot set what the schema does not name.
 */
export const EXTRACTION_SCHEMA = obj(["evidence", "claims"], {
  evidence: { type: "array", maxItems: 100, items: obj(["local_id", "origin", "exact_text"], { local_id: LOCAL, origin: { enum: ["report_author", "laboratory"] }, exact_text: NES, area_text: AREA }) },
  claims: { type: "array", maxItems: 100, items: obj(["local_id", "claim_type", "text", "exact_text", "strength_in_report", "basis_local_ids"], {
    local_id: LOCAL, claim_type: { enum: ["observation", "cause", "extent", "duration", "remediation", "verification", "health", "other"] }, text: NES, exact_text: NES,
    strength_in_report: { enum: ["categorical", "probable", "possible", "unclear"] }, basis_local_ids: { type: "array", maxItems: 20, items: LOCAL }, area_text: AREA,
  }) },
});

export interface ExtractionProposal {
  evidence: { local_id: string; origin: "report_author" | "laboratory"; exact_text: string; area_text?: string }[];
  claims: { local_id: string; claim_type: Claim["claim_type"]; text: string; exact_text: string; strength_in_report: Claim["strength_in_report"]; basis_local_ids: string[]; area_text?: string }[];
}

export interface ExtractionConfig { max_page_chars: number; max_evidence_per_page: number; max_evidence_total: number; hedge_words: string[] }
export const loadExtractionConfig = (path = resolve(import.meta.dirname, "../../../../data/rules/extraction.json")): ExtractionConfig => JSON.parse(readFileSync(path, "utf8")) as ExtractionConfig;

/** The model sees one page number and that page's text, as quoted data. Nothing else about the case. */
export const extractEvidenceStage: Stage<{ page: number; text: string }, ExtractionProposal> = {
  name: "extract_evidence",
  promptVersion: "extract_evidence.v2",
  instructions: readFileSync(resolve(import.meta.dirname, "../../../../data/rules/prompts/extract_evidence.v2.md"), "utf8"),
  buildData: ({ page, text }) => ({ page, page_text: text }),
  schema: EXTRACTION_SCHEMA,
};

export interface HeldBackItem { page: number; kind: "evidence" | "claim"; local_id: string; reason: "text_not_on_page" | "ambiguous_text" | "duplicate" | "over_cap" | "number_not_in_text" | "strength_mismatch" | "no_supporting_evidence" }
export interface PageIssue { page: number; issue: "no_text_layer" | "too_large" | "model_error" | "invalid_output"; detail: string }
export interface ExtractionResult { evidence: Evidence[]; claims: Claim[]; held_back: HeldBackItem[]; page_issues: PageIssue[]; audit: AuditRecord[]; /** Room or area name for an evidence or claim id, in the page's own words. Only where the words were found on the page. */ area_labels: Record<string, string> }

const numbersIn = (s: string): string[] => (s.match(/\d+(?:[.,]\d+)*/g) ?? []).map((n) => n.replace(/,/g, ""));
const hedged = (text: string, hedges: string[]) => { const t = ` ${text.toLowerCase().replace(/[^a-z\s]/g, " ").replace(/\s+/g, " ")} `; return hedges.some((h) => t.includes(` ${h} `)); };

/**
 * Turns one page's proposal into rows, or holds items back with a reason. The model's word is never the check:
 * the words must be on the page exactly once, numbers must come from the report's own words, the statement is the report's text
 * (never a paraphrase), and a claim's firmness label must fit its words.
 */
export function applyExtraction(doc: ExtractedDocument, documentVersionId: string, page: number, p: ExtractionProposal, cfg: ExtractionConfig, already: { evidence: number }): { evidence: Evidence[]; claims: Claim[]; held_back: HeldBackItem[]; area_labels: Record<string, string> } {
  const held: HeldBackItem[] = [], evidence: Evidence[] = [], claims: Claim[] = [], area_labels: Record<string, string> = {};
  /** The label must be the page's own words and found exactly once; otherwise the item simply has no area. */
  const label = (id: string, area_text: string | undefined) => { if (!area_text) return; const r = findAnchor(doc, documentVersionId, area_text, { page }); if (r.status === "found") area_labels[id] = r.anchor.exact_text!.trim(); };
  const byLocal = new Map<string, string>(), seen = new Set<string>();
  const hold = (kind: HeldBackItem["kind"], local_id: string, reason: HeldBackItem["reason"]) => held.push({ page, kind, local_id, reason });

  for (const e of p.evidence) {
    const r = findAnchor(doc, documentVersionId, e.exact_text, { page });
    if (r.status === "not_found") { hold("evidence", e.local_id, "text_not_on_page"); continue; }
    if (r.status === "multiple_matches") { hold("evidence", e.local_id, "ambiguous_text"); continue; }
    const key = r.anchor.exact_text!;
    if (seen.has(key)) { hold("evidence", e.local_id, "duplicate"); continue; }
    if (evidence.length >= cfg.max_evidence_per_page || already.evidence + evidence.length >= cfg.max_evidence_total) { hold("evidence", e.local_id, "over_cap"); continue; }
    seen.add(key);
    const id = `AI-EV-p${page}-${e.local_id}`;
    byLocal.set(e.local_id, id);
    label(id, e.area_text);
    evidence.push({ id, origin: e.origin, statement: key, anchor: r.anchor, area_ids: [], observed_time: null, time_basis: "unknown", quality_status: "usable", contradicts_ids: [] });
  }

  for (const c of p.claims) {
    const r = findAnchor(doc, documentVersionId, c.exact_text, { page });
    if (r.status === "not_found") { hold("claim", c.local_id, "text_not_on_page"); continue; }
    if (r.status === "multiple_matches") { hold("claim", c.local_id, "ambiguous_text"); continue; }
    const source = r.anchor.exact_text!;
    const grounded = new Set(numbersIn(source));
    if (numbersIn(c.text).some((n) => !grounded.has(n))) { hold("claim", c.local_id, "number_not_in_text"); continue; }
    const isHedged = hedged(source, cfg.hedge_words);
    if ((c.strength_in_report === "categorical" && isHedged) || ((c.strength_in_report === "probable" || c.strength_in_report === "possible") && !isHedged)) { hold("claim", c.local_id, "strength_mismatch"); continue; }
    const basis = [...new Set(c.basis_local_ids.flatMap((l) => (byLocal.has(l) ? [byLocal.get(l)!] : [])))];
    if (basis.length === 0) { hold("claim", c.local_id, "no_supporting_evidence"); continue; }
    label(`AI-CL-p${page}-${c.local_id}`, c.area_text);
    claims.push({ id: `AI-CL-p${page}-${c.local_id}`, text: c.text, claim_type: c.claim_type, basis_evidence_ids: basis, area_ids: [], source_anchor: r.anchor, strength_in_report: c.strength_in_report });
  }
  return { evidence, claims, held_back: held, area_labels };
}

/** Reads the document one page at a time. A page that cannot be read, is too large, or gets a bad reply is listed and skipped; it never stops the rest. */
export async function extractEvidenceFromDocument(port: ModelPort, doc: ExtractedDocument, documentVersionId: string, cfg: ExtractionConfig = loadExtractionConfig(), now?: () => string): Promise<ExtractionResult> {
  const out: ExtractionResult = { evidence: [], claims: [], held_back: [], page_issues: [], audit: [], area_labels: {} };
  for (const pg of doc.pages) {
    if (pg.quality_flags.includes("no_text_layer") || pg.text.trim() === "") { out.page_issues.push({ page: pg.index, issue: "no_text_layer", detail: "This page has no readable text; nothing was extracted from it." }); continue; }
    if (pg.text.length > cfg.max_page_chars) { out.page_issues.push({ page: pg.index, issue: "too_large", detail: `The page text is ${pg.text.length} characters; the limit is ${cfg.max_page_chars}.` }); continue; }
    const r = await runStage(port, extractEvidenceStage, { page: pg.index, text: pg.text }, now);
    out.audit.push(...r.audit);
    if (!r.ok) { out.page_issues.push({ page: pg.index, issue: r.issue, detail: r.errors.join("; ") }); continue; }
    const a = applyExtraction(doc, documentVersionId, pg.index, r.value, cfg, { evidence: out.evidence.length });
    out.evidence.push(...a.evidence); out.claims.push(...a.claims); out.held_back.push(...a.held_back); Object.assign(out.area_labels, a.area_labels);
  }
  return out;
}
