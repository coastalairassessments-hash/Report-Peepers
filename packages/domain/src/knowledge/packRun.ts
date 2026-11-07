import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ExtractedDocument } from "../ingest/extract.js";
import type { Pack } from "./pack.js";

export type PackMode = "off" | "shadow" | "on";
export const loadKnowledgeMode = (path = resolve(import.meta.dirname, "../../../../data/rules/knowledge_flags.json")): PackMode => {
  const m = (JSON.parse(readFileSync(path, "utf8")) as { mode: string }).mode;
  return m === "shadow" || m === "on" ? m : "off";
};

export interface PackQuestion { id: string; topic: string; text: string; why: string; quotes: { page: number; text: string }[] }

/** Runs a valid pack on a report's own text. Text in the report is only ever matched, never read as instructions. Silent unless the trigger is found and nothing supports it. */
export function runPack(pack: Pack, doc: ExtractedDocument): PackQuestion[] {
  const lines = doc.pages.flatMap((p) => p.text.split("\n").map((t) => ({ page: p.index, text: t.trim() })).filter((l) => l.text));
  const out: PackQuestion[] = [];
  for (const it of pack.items) {
    const trig = new RegExp(it.detect.trigger, "i"), sup = it.detect.support ? new RegExp(it.detect.support, "i") : null;
    const hit = lines.find((l) => trig.test(l.text));
    if (!hit || (sup && lines.some((l) => sup.test(l.text)))) continue;
    out.push({ id: it.id, topic: it.topic, text: it.question, why: it.why, quotes: [{ page: hit.page, text: hit.text.length > 300 ? `${hit.text.slice(0, 297)}...` : hit.text }] });
  }
  return out;
}
