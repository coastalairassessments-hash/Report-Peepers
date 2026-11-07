import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ExtractedDocument } from "./extract.js";

/** What the uploaded file seems to be. "unclear" is the safe answer whenever the program cannot tell. */
export type DocumentKind = "inspection_report" | "lab_only" | "unclear";
export interface DocumentKindConfig { lab: RegExp[]; inspection: RegExp[]; minLab: number; maxInspForLab: number; minInsp: number; unreadableShare: number }
export interface DocumentKindResult { kind: DocumentKind; lab_markers: number; inspection_markers: number; unreadable_share: number }

const phrase = (s: string): RegExp => new RegExp(`(?<![A-Za-z0-9])${s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+")}(?![A-Za-z0-9])`, "i");

export function loadDocumentKindConfig(path = resolve(import.meta.dirname, "../../../../data/rules/document_kind.json")): DocumentKindConfig {
  const r = JSON.parse(readFileSync(path, "utf8")) as { lab_markers: string[]; inspection_markers: string[]; min_lab_markers: number; max_inspection_markers_for_lab_only: number; min_inspection_markers: number; unreadable_share_for_unclear: number };
  const nums = [r.min_lab_markers, r.max_inspection_markers_for_lab_only, r.min_inspection_markers];
  if (nums.some((n) => !Number.isInteger(n) || n < 0) || !(r.unreadable_share_for_unclear > 0 && r.unreadable_share_for_unclear <= 1)) throw new Error("document_kind.json: bad numbers");
  if (!r.lab_markers.length || !r.inspection_markers.length) throw new Error("document_kind.json: marker lists are empty");
  return { lab: r.lab_markers.map(phrase), inspection: r.inspection_markers.map(phrase), minLab: r.min_lab_markers, maxInspForLab: r.max_inspection_markers_for_lab_only, minInsp: r.min_inspection_markers, unreadableShare: r.unreadable_share_for_unclear };
}

/**
 * A first look at what kind of document this is. It only counts marker words; it never follows anything the file says.
 * Pages that could not be read make the answer "unclear", never "lab only".
 */
export function classifyDocument(doc: ExtractedDocument, cfg: DocumentKindConfig): DocumentKindResult {
  const text = doc.pages.map((p) => p.text).join("\n");
  const unreadable = doc.pages.filter((p) => p.quality_flags.includes("no_text_layer") || p.quality_flags.includes("ocr_failed")).length;
  const share = doc.pages.length === 0 ? 1 : unreadable / doc.pages.length;
  const lab = cfg.lab.filter((r) => r.test(text)).length, insp = cfg.inspection.filter((r) => r.test(text)).length;
  const base = { lab_markers: lab, inspection_markers: insp, unreadable_share: share };
  if (share >= cfg.unreadableShare) return { kind: "unclear", ...base };
  if (insp >= cfg.minInsp) return { kind: "inspection_report", ...base };
  if (lab >= cfg.minLab && insp <= cfg.maxInspForLab) return { kind: "lab_only", ...base };
  return { kind: "unclear", ...base };
}
