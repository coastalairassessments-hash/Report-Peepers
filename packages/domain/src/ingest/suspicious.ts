import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ExtractedDocument } from "./extract.js";

/**
 * Looks for text a reader cannot see (too small, or off the page) and for text that talks to a program instead of a reader.
 * Findings name the page and the rule only, never the words, so a hostile file cannot smuggle its text into our output.
 * Known gap: text drawn in the page's own color needs the PDF drawing commands and is not caught here.
 */
export interface SuspiciousConfig {
  min_height_pt: number; off_page_margin: number; min_chars: number;
  instruction_phrases: { id: string; re: RegExp }[];
}
export interface SuspiciousFindings {
  hidden: { page: number; kind: "tiny" | "off_page" }[];
  instruction_like: { page: number; rule: string }[];
}

const ID = /^[a-z0-9_]{1,40}$/;

export function loadSuspiciousConfig(path = resolve(import.meta.dirname, "../../../../data/rules/suspicious_content.json")): SuspiciousConfig {
  const raw = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  const num = (k: string, min: number) => {
    const v = raw[k];
    if (typeof v !== "number" || !Number.isFinite(v) || v < min) throw new Error(`suspicious_content.json: ${k} is missing or out of range.`);
    return v;
  };
  const list = raw.instruction_phrases;
  if (!Array.isArray(list) || list.length === 0) throw new Error("suspicious_content.json: the phrase list is empty.");
  const seen = new Set<string>();
  const instruction_phrases = list.map((p: { id?: unknown; pattern?: unknown }) => {
    if (typeof p.id !== "string" || !ID.test(p.id) || seen.has(p.id)) throw new Error("suspicious_content.json: every phrase needs a unique plain id.");
    seen.add(p.id);
    if (typeof p.pattern !== "string" || p.pattern.length === 0) throw new Error(`suspicious_content.json: phrase ${p.id} has no pattern.`);
    let re: RegExp;
    try { re = new RegExp(p.pattern, "i"); } catch { throw new Error(`suspicious_content.json: phrase ${p.id} is not a valid pattern.`); }
    return { id: p.id, re };
  });
  return { min_height_pt: num("min_height_pt", 0), off_page_margin: num("off_page_margin", 0), min_chars: num("min_chars", 1), instruction_phrases };
}

export function scanDocument(doc: ExtractedDocument, cfg: SuspiciousConfig): SuspiciousFindings {
  const out: SuspiciousFindings = { hidden: [], instruction_like: [] };
  for (const page of doc.pages) {
    const kinds = new Set<"tiny" | "off_page">();
    for (const s of page.spans) {
      if (s.text.replace(/\s/g, "").length < cfg.min_chars) continue;
      const heightPt = Math.hypot(s.up[0] * page.width, s.up[1] * page.height);
      if (heightPt < cfg.min_height_pt) kinds.add("tiny");
      const m = cfg.off_page_margin;
      const [x, y] = s.origin;
      if (x < -m || x > 1 + m || y < -m || y > 1 + m) kinds.add("off_page");
    }
    for (const kind of kinds) out.hidden.push({ page: page.index, kind });
    const flat = page.text.normalize("NFKC").toLowerCase().replace(/\s+/g, " ");
    for (const p of cfg.instruction_phrases) if (p.re.test(flat)) out.instruction_like.push({ page: page.index, rule: p.id });
  }
  return out;
}
