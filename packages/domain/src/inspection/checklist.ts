import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export type Materiality = "by_dependence" | "always_material" | "always_minor";
export interface ChecklistItem {
  /** Stable. Never reused, never renumbered: old reviews point at it. */
  id: string;
  group: string;
  topic: string;
  /** What the program looks for in the report. */
  looks_for: string;
  /** "report": checkable from the report alone. "record": needs a record the inspector holds. */
  needs: "report" | "record";
  /** The condition under which this item applies; "always" or a named condition. */
  applies_when: string;
  materiality: Materiality;
  /** What the homeowner is told, in the warm voice (docs/expert/VOICE_RULE.md). */
  leading_question: string;
  /** The "can you share it" line the homeowner may send. Empty when there is no record to ask for. */
  record_request: string;
}
export interface Checklist { version: number; status: string; groups: string[]; applies_when_values: string[]; items: ChecklistItem[] }

const MATERIALITY: Materiality[] = ["by_dependence", "always_material", "always_minor"];

/** Loads and validates the checklist. A bad entry stops the program rather than letting a malformed question reach a homeowner. Adding a question later is adding an entry. */
export function loadChecklist(path = resolve(import.meta.dirname, "../../../../data/rules/inspection_checklist.json")): Checklist {
  const raw = JSON.parse(readFileSync(path, "utf8")) as Checklist;
  const ids = new Set<string>();
  for (const it of raw.items) {
    const at = `inspection_checklist.json ${it.id ?? "(no id)"}`;
    if (!/^CK-\d{3,}$/.test(it.id)) throw new Error(`${at}: bad id.`);
    if (ids.has(it.id)) throw new Error(`${at}: duplicate id.`);
    ids.add(it.id);
    if (!raw.groups.includes(it.group)) throw new Error(`${at}: unknown group "${it.group}".`);
    if (!MATERIALITY.includes(it.materiality)) throw new Error(`${at}: unknown materiality "${it.materiality}".`);
    if (it.needs !== "report" && it.needs !== "record") throw new Error(`${at}: needs must be report or record.`);
    if (it.applies_when !== "always" && !raw.applies_when_values.includes(it.applies_when)) throw new Error(`${at}: unknown condition "${it.applies_when}".`);
    for (const f of ["topic", "looks_for", "leading_question"] as const) if (!it[f]?.trim()) throw new Error(`${at}: ${f} is empty.`);
    if (it.needs === "record" && !it.record_request?.trim()) throw new Error(`${at}: a record item needs a record request.`);
  }
  return raw;
}
