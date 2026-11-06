import type { SummaryRecord } from "./record.js";

export interface MonthlyCut { month: string; service_type: string }
export interface CodeCount { code: string; /** Records with this pattern, or null when fewer than the minimum. */ records: number | null }
export interface QuestionCount { question: string; records: number }
export type MonthlyReport =
  | { suppressed: true; min_group_size: number }
  | {
      suppressed: false; min_group_size: number; records: number;
      patterns: CodeCount[]; questions: QuestionCount[];
      items_resolved_later: number; items_changed_by_reviewer: number; items_with_wording_withheld: number;
    };

const norm = (q: string) => q.trim().replace(/\s+/g, " ").toLowerCase();

/**
 * One month, one service type, one cut at a time (see countPatterns on overlapping cuts).
 * If the cut holds fewer records than the minimum, nothing is returned but "suppressed".
 * A pattern seen in fewer records than the minimum is shown as hidden. A question seen in fewer is left out entirely, with no placeholder.
 * Reads only SummaryRecord fields. Record ids are never copied out. Nothing here changes a question or a library entry.
 */
export function monthlyPatternReport(records: readonly SummaryRecord[], minGroupSize: number, cut: MonthlyCut): MonthlyReport {
  if (!Number.isInteger(minGroupSize) || minGroupSize < 2) throw new Error("A minimum group size of 2 or more is required.");
  if (!/^\d{4}-\d{2}$/.test(cut.month)) throw new Error("The month must look like 2026-11 (month only, never a date).");
  const inCut = records.filter((r) => r.release_month === cut.month && r.service_type === cut.service_type);
  if (inCut.length < minGroupSize) return { suppressed: true, min_group_size: minGroupSize };

  const patterns = new Map<string, number>();
  const questions = new Map<string, { text: string; n: number }>();
  let resolved = 0, changed = 0, withheld = 0;
  for (const r of inCut) {
    for (const code of new Set(r.items.flatMap((i) => (i.pattern_code ? [i.pattern_code] : [])))) patterns.set(code, (patterns.get(code) ?? 0) + 1);
    const seen = new Set<string>();
    for (const i of r.items) {
      if (i.resolved_later) resolved++;
      if (i.reviewer_changed) changed++;
      if (i.wording_withheld) withheld++;
      if (!i.question) continue;
      const key = norm(i.question);
      if (seen.has(key)) continue;
      seen.add(key);
      const cur = questions.get(key);
      if (cur) cur.n++; else questions.set(key, { text: i.question.trim().replace(/\s+/g, " "), n: 1 });
    }
  }
  const show = (n: number) => (n >= minGroupSize ? n : null);
  return {
    suppressed: false, min_group_size: minGroupSize, records: inCut.length,
    patterns: [...patterns.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([code, n]) => ({ code, records: show(n) })),
    questions: [...questions.values()]
      .sort((a, b) => b.n - a.n || a.text.localeCompare(b.text))
      .flatMap((q) => (q.n >= minGroupSize ? [{ question: q.text, records: q.n }] : [])),
    items_resolved_later: resolved, items_changed_by_reviewer: changed, items_with_wording_withheld: withheld,
  };
}

/** A plain markdown view for Cory. */
export function monthlyReportMarkdown(r: MonthlyReport, month: string, serviceType: string): string {
  const head = `# Pattern report: ${month}, ${serviceType}`;
  if (r.suppressed) return `${head}\n\nToo few reviews this month to show anything (minimum ${r.min_group_size}).\n`;
  const n = (v: number | null) => (v === null ? "hidden (few)" : String(v));
  return [
    head, "", `Reviews counted: ${r.records}`, "",
    "## Common flaw patterns", ...r.patterns.map((p) => `- ${p.code}: ${n(p.records)}`), "",
    "## Common questions", ...r.questions.map((q) => `- ${q.question}: ${n(q.records)}`), "",
    "## Review notes",
    `- Items resolved later by new information: ${r.items_resolved_later}`,
    `- Items the reviewer changed: ${r.items_changed_by_reviewer}`,
    `- Items whose wording was withheld by the scrub: ${r.items_with_wording_withheld}`, "",
  ].join("\n");
}
