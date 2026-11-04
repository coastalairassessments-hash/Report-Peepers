import type { CaseSnapshot } from "@report-peepers/contracts";

/** Words that appear in building reports and company names everywhere. A blocked name made of these is only matched as the whole phrase, never word by word. */
const COMMON = new Set(["the", "and", "of", "for", "inc", "llc", "ltd", "corp", "co", "company", "group", "services", "service", "solutions", "consulting", "environmental", "indoor", "air", "quality", "mold", "moisture", "water", "home", "house", "property", "inspection", "inspections", "inspector", "assessment", "assessments", "testing", "report", "reports", "final", "copy", "scan", "scanned", "draft", "pdf", "sample", "lab", "laboratory", "analysis", "results", "building", "residential"]);

export type ScrubReason = "email" | "phone" | "web_address" | "street_address" | "po_box" | "zip_code" | "license_or_permit" | "listed_name";
export type ScrubResult = { ok: true; text: string } | { ok: false; reasons: ScrubReason[] };

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const STREET = "street|st|avenue|ave|road|rd|boulevard|blvd|drive|dr|lane|ln|court|ct|way|place|pl|circle|cir|terrace|ter|highway|hwy|parkway|pkwy|trail|trl";
const PATTERNS: [ScrubReason, RegExp][] = [
  ["email", /[^\s@]+@[^\s@]+\.[^\s@]+/],
  ["web_address", /\b(?:https?:\/\/|www\.)\S+|\b[a-z0-9-]+\.(?:com|net|org|io|gov|edu|us|co)\b/i],
  ["phone", /(?:\+?1[\s.-]?)?\(?\b\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/],
  ["po_box", /\bp\.?\s?o\.?\s*box\s*\d+/i],
  ["street_address", new RegExp(`\\b\\d{1,6}\\s+(?:[A-Za-z0-9.'-]+\\s+){0,3}(?:${STREET})\\b`, "i")],
  ["zip_code", /\b\d{5}(?:-\d{4})?\b/],
  ["license_or_permit", /\b(?:licen[sc]e|lic|permit|cert(?:ificate)?|registration|reg)\b\W{0,3}(?:no\.?|number|#)?\W{0,2}[A-Za-z]*\d[\w-]*|\b[A-Z]{2,5}\d{3,}\b/i],
];

function nameRegexes(name: string): RegExp[] {
  const tokens = name.trim().split(/[\s,.;:/\\_-]+/).filter(Boolean);
  if (tokens.length === 0) return [];
  const gap = "[\\s,.;:/\\\\_-]*";
  const out = [new RegExp(`(?<![A-Za-z])${tokens.map(escape).join(gap)}(?![A-Za-z])`, "i")];
  if (tokens.length > 1 || !COMMON.has(tokens[0]!.toLowerCase())) {
    for (const t of tokens) if (t.length >= 3 && !COMMON.has(t.toLowerCase())) out.push(new RegExp(`(?<![A-Za-z])${escape(t)}(?![A-Za-z])`, "i"));
  }
  return out;
}

/**
 * Fails closed: if anything that could identify a person, company, or place is found, returns the categories (never the match) and no text.
 * Names to block come from the case itself (blockedNamesFrom plus what intake supplies).
 */
export function scrubText(text: string, blockedNames: string[]): ScrubResult {
  const reasons = new Set<ScrubReason>();
  for (const [reason, re] of PATTERNS) if (re.test(text)) reasons.add(reason);
  for (const n of blockedNames) if (nameRegexes(n).some((re) => re.test(text))) reasons.add("listed_name");
  return reasons.size ? { ok: false, reasons: [...reasons].sort() } : { ok: true, text };
}

/** Names the case lists: whatever intake supplies (client, property, inspector, company, lab, signers) plus the words in each document's file name. */
export function blockedNamesFrom(snapshot: Pick<CaseSnapshot, "documents">, supplied: string[] = []): string[] {
  const fromFiles = snapshot.documents.flatMap((d) => d.display_name.replace(/\.[A-Za-z0-9]{2,4}$/, "").split(/[\s_\-.()]+/)).filter((t) => /^[A-Za-z]{3,}$/.test(t) && !COMMON.has(t.toLowerCase()));
  return [...new Set([...supplied.map((s) => s.trim()).filter(Boolean), ...fromFiles])];
}
