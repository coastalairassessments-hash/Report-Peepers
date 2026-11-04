import { extractDocument, type ExtractedDocument } from "../../src/ingest/extract.js";
import { findAnchor } from "../../src/ingest/anchors.js";
import type { ApprovedView } from "../../src/release.js";
import { makePdf, type PageSpec } from "../ingest/fixtures.js";

export const DOC = "DOC-001-v1";
export type F = ApprovedView["findings"][number];

export const finding = (over: Partial<F> = {}): F => ({
  id: "F-1", title: "Basis for the duration statement", finding_type: "clarification_needed", explanation: "The report states a duration without showing what it rests on.",
  evidence_strength: "limited", decision_relevance: "material", uncertainty: "Other records may exist.", questions: ["What was the duration based on?"],
  possible_next_steps: ["Ask for the supporting history."], resolution_condition: "The basis is supplied.", resolution_status: "open", sources: [], ...over,
});
export const viewOf = (findings: F[], leading: string[] = ["What was the duration based on?"]): ApprovedView => ({
  release_id: "REL-1", case_revision_id: "REV-1", status: "published", overview: "Overview.", human_review: { status: "approved", reviewer_id: "REV-1", reviewer_scope: "Residential" },
  leading_questions: leading, findings, coverage_limitations: ["This is a document review within the supplied evidence."], changes: [],
  method: { statement: "Document review within the supplied evidence. This is not an inspection of the building and not an expert opinion.", rule_pack_version: "x", reference_snapshot_id: "x", model_version: "x", prompt_version: "x", input_snapshot_sha256: "x", run_id: "x" },
});
export const read = async (pages: PageSpec[]): Promise<{ bytes: Uint8Array; doc: ExtractedDocument }> => { const bytes = await makePdf(pages); return { bytes, doc: await extractDocument(bytes) }; };
export const src = (d: ExtractedDocument, phrase: string, page?: number, role: "support" | "counter" = "support") => {
  const r = findAnchor(d, DOC, phrase, page ? { page } : {});
  if (r.status !== "found") throw new Error(`setup: ${phrase} ${r.status}`);
  return { role, anchor: r.anchor };
};
export const dense = (n: number, label = "Line"): PageSpec => ({ puts: Array.from({ length: n }, (_, i) => ({ text: `${label} ${i + 1} of the assessment text runs across most of this line of the page body`, x: 72, y: 740 - i * (n > 50 ? 11.5 : 14), size: 10 })) });
