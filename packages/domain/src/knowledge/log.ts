import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadLibrary } from "./library.js";
import { EDITABLE, type Decision, type Edit } from "./status.js";

/** Append-only logs, one file per entry, so every change shows in git. */
const ID = /^IEP-K-\d{3}$/;
const TEXT_MAX = 2000;
const clean = (s: string) => s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").slice(0, TEXT_MAX);
const file = (dir: string, kind: "decisions" | "edits", id: string) => { if (!ID.test(id)) throw new Error(`bad entry id: ${id}`); return join(dir, kind, `${id}.json`); };
const read = <T,>(dir: string, kind: "decisions" | "edits", id: string): T[] => { const f = file(dir, kind, id); return existsSync(f) ? (JSON.parse(readFileSync(f, "utf8")) as T[]) : []; };
const append = <T,>(dir: string, kind: "decisions" | "edits", id: string, row: T) => {
  const rows = read<T>(dir, kind, id); rows.push(row);
  mkdirSync(join(dir, kind), { recursive: true });
  writeFileSync(file(dir, kind, id), JSON.stringify(rows, null, 1) + "\n");
};

export const readDecisions = (dir: string, id: string) => read<Decision>(dir, "decisions", id);
export const readEdits = (dir: string, id: string) => read<Edit>(dir, "edits", id);

export function recordDecision(dir: string, d: Decision): void {
  if (!d.reviewer.trim()) throw new Error("reviewer name required");
  const codes = loadLibrary().reviewer_reason_codes;
  if (d.reason_code !== null && !codes.includes(d.reason_code)) throw new Error(`reason code not on the list: ${d.reason_code}`);
  if (d.decision === "reject" && d.reason_code === null) throw new Error("reason code required for reject");
  append(dir, "decisions", d.entry_id, { ...d, reviewer: d.reviewer.trim(), comment: clean(d.comment), answer: clean(d.answer) });
}

export function recordEdit(dir: string, e: Edit): void {
  if (!e.author.trim()) throw new Error("author required");
  for (const k of Object.keys(e.fields)) if (!(EDITABLE as readonly string[]).includes(k)) throw new Error(`field not editable: ${k}`);
  append(dir, "edits", e.entry_id, { ...e, note: clean(e.note) });
}
