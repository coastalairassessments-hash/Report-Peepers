import type { SummaryRecord } from "./record.js";
import type { MonthlyCut } from "./monthlyReport.js";

/** What is kept about one finished automatic run: month, service type, outcome, and the ids of the gates that stopped it. Never the gate detail text, which can carry names or places. */
export interface OutcomeRecord { release_month: string; service_type: string; outcome: "released" | "needs_attention"; failed_gates: string[] }

const MONTH = /^\d{4}-\d{2}$/;
const GATE_ID = /^[a-z0-9_]{1,60}$/;

/** Builds an outcome record from an automatic-release gate result. Gate ids must be plain codes, so free text cannot slip through. */
export function outcomeOf(facts: { release_month: string; service_type: string }, gates: { ok: boolean; failed: readonly { gate: string; detail?: string }[] }): OutcomeRecord {
  if (!MONTH.test(facts.release_month)) throw new Error("The month must look like 2026-11 (month only, never a date).");
  const ids = [...new Set(gates.failed.map((f) => f.gate))].sort();
  for (const id of ids) if (!GATE_ID.test(id)) throw new Error("A gate id must be a plain code (lowercase letters, digits, underscores).");
  return { release_month: facts.release_month, service_type: facts.service_type, outcome: gates.ok && ids.length === 0 ? "released" : "needs_attention", failed_gates: ids };
}

export type WeaknessReport =
  | { suppressed: true; min_group_size: number }
  | {
      suppressed: false; min_group_size: number; cases: number; released: number; needs_attention: number;
      /** Cases stopped by each gate, or null when fewer than the minimum. */
      gates: { gate: string; cases: number | null }[];
      items_wording_withheld: number; items_tagged_other: number;
    };

/** One month, one service type. Shows where the software is weak: what stops cases, what the scrub withholds, what fits no flaw pattern. Counts only. */
export function weaknessReport(outcomes: readonly OutcomeRecord[], records: readonly SummaryRecord[], minGroupSize: number, cut: MonthlyCut): WeaknessReport {
  if (!Number.isInteger(minGroupSize) || minGroupSize < 2) throw new Error("A minimum group size of 2 or more is required.");
  if (!MONTH.test(cut.month)) throw new Error("The month must look like 2026-11 (month only, never a date).");
  const os = outcomes.filter((o) => o.release_month === cut.month && o.service_type === cut.service_type);
  if (os.length < minGroupSize) return { suppressed: true, min_group_size: minGroupSize };
  const perGate = new Map<string, number>();
  for (const o of os) for (const g of new Set(o.failed_gates)) perGate.set(g, (perGate.get(g) ?? 0) + 1);
  const items = records.filter((r) => r.release_month === cut.month && r.service_type === cut.service_type).flatMap((r) => r.items);
  const needs = os.filter((o) => o.outcome === "needs_attention").length;
  return {
    suppressed: false, min_group_size: minGroupSize, cases: os.length, released: os.length - needs, needs_attention: needs,
    gates: [...perGate.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([gate, n]) => ({ gate, cases: n >= minGroupSize ? n : null })),
    items_wording_withheld: items.filter((i) => i.wording_withheld).length,
    items_tagged_other: items.filter((i) => i.pattern_code === "other").length,
  };
}

export function weaknessReportMarkdown(r: WeaknessReport, month: string, serviceType: string): string {
  const head = `# Software weakness report: ${month}, ${serviceType}`;
  if (r.suppressed) return `${head}\n\nToo few cases this month to show anything (minimum ${r.min_group_size}).\n`;
  return [
    head, "", `Cases: ${r.cases}`, `Released: ${r.released}`, `Needs attention: ${r.needs_attention}`, "",
    "## What stopped cases", ...(r.gates.length ? r.gates.map((g) => `- ${g.gate}: ${g.cases === null ? "hidden (few)" : g.cases}`) : ["- none"]), "",
    "## Where the wording or pattern list fell short",
    `- Items whose wording the scrub withheld: ${r.items_wording_withheld}`,
    `- Items that fit no flaw pattern (tagged other): ${r.items_tagged_other}`, "",
  ].join("\n");
}
