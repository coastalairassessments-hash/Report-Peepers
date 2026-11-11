import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export interface Acknowledgments { version: string; items: { id: string; text: string }[] }

/** Loads and checks the list. A bad file stops the program at start-up, never lets a case through. */
export function parseAcknowledgments(raw: unknown): Acknowledgments {
  const r = raw as { version?: unknown; items?: unknown };
  if (typeof r?.version !== "string" || !r.version) throw new Error("acknowledgments: version is required");
  if (!Array.isArray(r.items) || r.items.length === 0) throw new Error("acknowledgments: at least one item is required");
  const seen = new Set<string>();
  const items = r.items.map((i: { id?: unknown; text?: unknown }) => {
    if (typeof i?.id !== "string" || !i.id || typeof i?.text !== "string" || !i.text.trim()) throw new Error("acknowledgments: each item needs an id and text");
    if (seen.has(i.id)) throw new Error(`acknowledgments: duplicate id ${i.id}`);
    seen.add(i.id);
    return { id: i.id, text: i.text };
  });
  return { version: r.version, items };
}
export const loadAcknowledgments = (path = resolve(import.meta.dirname, "../../../../data/rules/acknowledgments.json")): Acknowledgments => parseAcknowledgments(JSON.parse(readFileSync(path, "utf8")));
