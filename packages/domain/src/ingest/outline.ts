import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { wordingProblems } from "../integrity.js";
import { citationProblems } from "../inspection/noCitations.js";
import type { Checklist } from "../inspection/checklist.js";

export interface OutlineRules { approved: boolean; fee_share: number; title: string; intro: string; footer: string; group_labels: Record<string, string> }
export interface Outline { title: string; intro: string; sections: { heading: string; points: string[] }[]; footer: string }

const fail = (m: string): never => { throw new Error(`outline.json: ${m}`); };
const clean = (t: unknown, w: string): string => {
  if (typeof t !== "string" || t.length < 10) return fail(`${w} needs a sentence`);
  if (wordingProblems(t).length || citationProblems(t).length) fail(`${w} breaks the customer-wording rules`);
  return t;
};
export function parseOutlineRules(raw: unknown): OutlineRules {
  const r = raw as Partial<OutlineRules> & { group_labels?: Record<string, unknown> };
  if (typeof r?.approved !== "boolean") return fail("approved flag is required");
  if (typeof r.fee_share !== "number" || !(r.fee_share > 0 && r.fee_share <= 1)) fail("fee_share must be above 0 and at most 1");
  if (!r.group_labels || typeof r.group_labels !== "object") return fail("group_labels are required");
  const labels: Record<string, string> = {};
  for (const [k, v] of Object.entries(r.group_labels)) labels[k] = clean(v === undefined ? "" : (v as string) + " (label)", `label ${k}`).replace(/ \(label\)$/, "");
  return { approved: r.approved, fee_share: r.fee_share!, title: clean(r.title, "title"), intro: clean(r.intro, "intro"), footer: clean(r.footer, "footer"), group_labels: labels };
}
export const loadOutlineRules = (path = resolve(import.meta.dirname, "../../../../data/rules/outline.json")): OutlineRules => parseOutlineRules(JSON.parse(readFileSync(path, "utf8")));

/**
 * A general list of what reports of this kind commonly cover, built from the checklist items that apply to every report.
 * It never refers to the customer's file. Nothing is produced until the wording is approved, and every line is re-checked against the wording rules.
 */
export function buildOutline(rules: OutlineRules, checklist: Checklist): Outline | null {
  if (!rules.approved) return null;
  const retired = new Set(checklist.retired_ids ?? []);
  const sections: Outline["sections"] = [];
  for (const g of checklist.groups) {
    const points = checklist.items.filter((i) => i.group === g && i.applies_when === "always" && !retired.has(i.id)).map((i) => i.looks_for);
    const heading = rules.group_labels[g];
    if (!points.length || !heading) continue;
    if (points.some((p) => wordingProblems(p).length || citationProblems(p).length)) return null; // fail closed: never ship a line that breaks the rules
    sections.push({ heading, points });
  }
  return sections.length ? { title: rules.title, intro: rules.intro, sections, footer: rules.footer } : null;
}
