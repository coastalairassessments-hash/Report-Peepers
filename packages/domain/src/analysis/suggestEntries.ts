import type { SummaryRecord } from "./record.js";
import { NAMES_STANDARD, NUMERIC_LIMIT } from "../knowledge/library.js";
import { wordingProblems } from "../integrity.js";

/**
 * A proposed library entry, a stub only. It names the repeated question and a title. Everything else (principle, steps, fixtures, family)
 * is for the field expert to write, and it enters the library through the normal review: two licensed reviewers, then owner approval.
 * Code never publishes a stub and never gives it any other status.
 */
export interface SuggestedEntry {
  id: string; status: "ai_draft"; production_enabled: false;
  title: string; homeowner_question: string; seen_in_records: number;
}
export interface SuggestOptions { /** Records that must show the same question. Never below 2. */ min_records: number; /** Questions the library already asks. */ existing_questions: readonly string[] }

const norm = (q: string) => q.trim().replace(/\s+/g, " ").toLowerCase();
const clean = (q: string) => q.trim().replace(/\s+/g, " ");

/**
 * Looks at items tagged `other` (they fit no flaw pattern) and drafts a stub when the same question shows up in enough records.
 * Wording the scrub withheld is never used. Wording that names a standard, gives a numeric limit, or breaks the customer-wording rule is held back.
 */
export function suggestEntries(records: readonly SummaryRecord[], opts: SuggestOptions): SuggestedEntry[] {
  if (!Number.isInteger(opts.min_records) || opts.min_records < 2) throw new Error("A minimum record count of 2 or more is required.");
  const known = new Set(opts.existing_questions.map(norm));
  const groups = new Map<string, { question: string; titles: Map<string, number>; n: number }>();
  for (const r of records) {
    const seen = new Set<string>();
    for (const i of r.items) {
      if (i.pattern_code !== "other" || i.wording_withheld || !i.question || !i.title) continue;
      const key = norm(i.question);
      if (seen.has(key)) continue;
      seen.add(key);
      const g = groups.get(key) ?? { question: clean(i.question), titles: new Map(), n: 0 };
      g.n++; g.titles.set(clean(i.title), (g.titles.get(clean(i.title)) ?? 0) + 1);
      groups.set(key, g);
    }
  }
  const ok = (t: string) => !NAMES_STANDARD.test(t) && !NUMERIC_LIMIT.test(t) && wordingProblems(t).length === 0;
  return [...groups.entries()]
    .filter(([key, g]) => g.n >= opts.min_records && !known.has(key))
    .map(([, g]) => ({ g, title: [...g.titles.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]![0] }))
    .filter(({ g, title }) => ok(g.question) && ok(title))
    .sort((a, b) => b.g.n - a.g.n || a.g.question.localeCompare(b.g.question))
    .map(({ g, title }, idx): SuggestedEntry => ({ id: `SUG-${String(idx + 1).padStart(3, "0")}`, status: "ai_draft", production_enabled: false, title, homeowner_question: g.question, seen_in_records: g.n }));
}
