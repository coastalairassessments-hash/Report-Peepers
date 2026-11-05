import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/** Context questions for the report recipient. Buttons (one or several) plus an optional note. Everything is past tense; answers are the client's own statements. */
export interface ContextQuestion {
  id: string; section: string; text: string; options: string[];
  select: "single" | "multi";
  /** Skip this question when the earlier answer picked only these options. */
  skip_if?: { q: string; only: string[] };
}
export interface ContextBank { sections: { id: string; title: string }[]; questions: ContextQuestion[] }
export interface ContextAnswer { picks: string[]; note?: string }
export interface ContextState { answers: Record<string, ContextAnswer>; skipped_sections: string[] }
export interface ExpectationRow { id: string; topic: string; when: { q: string; any: string[] }[]; report_patterns: string[]; text: string; why: string }
export interface Expectations { rows: ExpectationRow[] }
export interface ExpectedQuestion { id: string; topic: string; text: string; why: string }

const dataPath = (f: string) => resolve(import.meta.dirname, "../../../data/rules", f);
export const loadContextBank = (path = dataPath("context_questions.json")): ContextBank => JSON.parse(readFileSync(path, "utf8")) as ContextBank;
export const loadExpectations = (path = dataPath("context_expectations.json")): Expectations => JSON.parse(readFileSync(path, "utf8")) as Expectations;

export const NOTE_MAX = 1000;
/** Notes are untrusted text: control characters removed, length capped. They are stored as the client's words and never read as instructions. */
export function cleanNote(s: string): string {
  return s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").slice(0, NOTE_MAX);
}

const EXCLUSIVE = /^(Not sure|None|Nothing|No deadline|Prefer not)/;

/** Problems with an answer; empty list means it is acceptable. */
export function validateContextAnswer(def: ContextQuestion, a: ContextAnswer): string[] {
  const out: string[] = [];
  for (const p of a.picks) if (!def.options.includes(p)) out.push(`unknown_option:${p}`);
  if (def.select === "single" && a.picks.length > 1) out.push("single_choice_only");
  if (a.picks.length > 1 && a.picks.some((p) => EXCLUSIVE.test(p))) out.push("exclusive_pick");
  if ((a.note ?? "").length > NOTE_MAX) out.push("note_too_long");
  if (a.picks.length === 0 && !(a.note ?? "").trim()) out.push("empty_answer");
  return out;
}

const answered = (a?: ContextAnswer) => !!a && (a.picks.length > 0 || !!a.note?.trim());

function applicable(def: ContextQuestion, s: ContextState): boolean {
  if (s.skipped_sections.includes(def.section)) return false;
  if (def.skip_if) {
    const prior = s.answers[def.skip_if.q];
    if (prior && prior.picks.length > 0 && prior.picks.every((p) => def.skip_if!.only.includes(p))) return false;
  }
  return true;
}

/** The next unanswered, applicable question. null when done. One at a time. */
export function nextContextQuestion(bank: ContextBank, s: ContextState): ContextQuestion | null {
  return bank.questions.find((q) => applicable(q, s) && !answered(s.answers[q.id])) ?? null;
}

/**
 * Where the client's account sets an expectation the report does not meet, a question for the reviewer's list.
 * Silent when any page was not read. Health answers are never used. The report is judged only by its own words.
 */
export function contextExpectations(exp: Expectations, s: ContextState, reportText: string, allPagesRead: boolean): ExpectedQuestion[] {
  if (!allPagesRead) return [];
  const out: ExpectedQuestion[] = [];
  for (const row of exp.rows) {
    const triggered = row.when.some((w) => s.answers[w.q]?.picks.some((p) => w.any.includes(p)));
    if (!triggered) continue;
    if (row.report_patterns.some((p) => new RegExp(p, "i").test(reportText))) continue;
    out.push({ id: row.id, topic: row.topic, text: row.text, why: row.why });
  }
  return out;
}
