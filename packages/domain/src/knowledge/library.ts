import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { wordingProblems } from "../integrity.js";

/** The knowledge library: the rules the program uses, each decided once by licensed professionals. Customer words stay "common practice"; sources are internal only. */
export interface Fixture { id: string; type: string; given: string; expect: string; executed: boolean }
export interface Entry {
  id: string; family: string; title: string; category: "technical" | "document_clarification" | "output";
  principle: string; rationale: string; applies_to: string[]; not_applies_to: string[]; evidence_required: string[]; decision_steps: string[];
  exceptions: string[]; prohibited_inferences: string[]; homeowner_question: string; reviewer_action: string; example: string; counterexample: string;
  related: string[]; shared_controls: string[]; source_hints: string[]; iep_question: string;
  status: string; version: string; production_enabled: boolean; source_status: string; fixtures: Fixture[];
}
export interface Family { id: string; name: string; primary_iep_decision: string; entries: string[] }
export interface Library {
  library: string; version: string; families: Family[]; shared_controls: { id: string; name: string; text: string }[];
  evidence_states: { code: string; meaning: string }[]; reviewer_reason_codes: string[]; entries: Entry[];
}
export interface Problem { code: string; id: string; detail: string }

/** Residential MVP only. Entries stay in the file but are never live. */
export const PARKED_FAMILIES = ["F10", "F11"];

export const loadLibrary = (path = resolve(import.meta.dirname, "../../../../data/knowledge/seed_v2.1.json")): Library => JSON.parse(readFileSync(path, "utf8")) as Library;

export const NAMES_STANDARD = /\b(ASTM|IICRC|ANSI|ASHRAE|ACGIH|AIHA|OSHA|NIOSH|EPA|ISO ?\d|S500|S520|S530|D7338)\b|complian|conform(s|ity|ance)\b|meets? (the )?(industry )?standard|industry (guideline|standard)s?/i;
export const NUMERIC_LIMIT = /\b\d+(?:\.\d+)?\s*(?:%|(?:percent|ppm|spores|hours?|days?|µg|ug|mg|pg|rh)\b|°)/i;

/** Every check the library must pass on import and after any edit. */
export function validateLibrary(lib: Library): Problem[] {
  const out: Problem[] = [];
  const add = (code: string, id: string, detail = "") => out.push({ code, id, detail });
  const ids = new Set<string>(), fams = new Set(lib.families.map((f) => f.id)), controls = new Set(lib.shared_controls.map((c) => c.id));
  for (const e of lib.entries) { if (ids.has(e.id)) add("duplicate_id", e.id); ids.add(e.id); }
  for (const e of lib.entries) {
    if (!fams.has(e.family)) add("unknown_family", e.id, e.family);
    if (e.fixtures.length !== 4) add("fixture_count", e.id, String(e.fixtures.length));
    for (const r of e.related) if (!ids.has(r)) add("unknown_related", e.id, r);
    for (const c of e.shared_controls) if (!controls.has(c)) add("unknown_control", e.id, c);
    if (NAMES_STANDARD.test(e.homeowner_question)) add("customer_wording_names_standard", e.id);
    const w = wordingProblems(e.homeowner_question);
    if (w.length) add("customer_wording_rule", e.id, w.join("; "));
    if ([e.principle, e.homeowner_question, ...e.decision_steps].some((t) => NUMERIC_LIMIT.test(t))) add("outside_numeric_limit", e.id);
    if (e.status !== "ai_draft" || e.production_enabled) add("import_not_draft", e.id);
    if (e.fixtures.some((f) => f.executed)) add("import_test_already_run", e.id);
    if (e.source_status !== "research_hint_unverified") add("import_source_verified", e.id, e.source_status);
  }
  return out;
}
