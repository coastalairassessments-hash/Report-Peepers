import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { wordingProblems } from "../integrity.js";
import { citationProblems } from "../inspection/noCitations.js";
import type { DocumentKind } from "./documentKind.js";

export type Answer = "yes" | "no" | "unsure";
export type MessageKey = "ask_more" | "close_lab_only" | "unsure";
export interface FirstLookRules { question: { id: string; text: string; why: string; options: Answer[] }; messages: Record<MessageKey, { approved: boolean; text: string }> }

const fail = (m: string): never => { throw new Error(`first_look_messages.json: ${m}`); };
export function parseFirstLook(raw: unknown): FirstLookRules {
  const r = raw as { question?: FirstLookRules["question"]; messages?: Record<string, { approved?: unknown; text?: unknown }> };
  if (!r?.question || !r.messages) return fail("question and messages are required");
  const ok = (t: unknown, w: string): string => { if (typeof t !== "string" || t.length < 10) return fail(`${w} needs a sentence`); if (wordingProblems(t).length || citationProblems(t).length) fail(`${w} breaks the customer-wording rules`); return t; };
  ok(r.question.text, "question"); ok(r.question.why, "question.why");
  if (r.question.options.join() !== "yes,no,unsure") fail("options must be yes, no, unsure");
  const messages = {} as FirstLookRules["messages"];
  for (const k of ["ask_more", "close_lab_only", "unsure"] as const) {
    const m = r.messages[k]; if (!m || typeof m.approved !== "boolean") return fail(`${k} needs an approved flag`);
    messages[k] = { approved: m.approved, text: ok(m.text, k) };
  }
  return { question: r.question, messages };
}
export const loadFirstLook = (path = resolve(import.meta.dirname, "../../../../data/rules/first_look_messages.json")): FirstLookRules => parseFirstLook(JSON.parse(readFileSync(path, "utf8")));

export type Outcome = "continue" | "ask_more" | "close_lab_only" | "unsure";
/** What happens next. Only a file that looks like lab results, or is unclear, is asked. A full report never is. */
export function nextStep(kind: DocumentKind, answer: Answer | null): { ask: boolean; outcome: Outcome | null } {
  if (kind === "inspection_report") return { ask: false, outcome: "continue" };
  if (answer === null) return { ask: true, outcome: null };
  if (answer === "no") return { ask: false, outcome: "ask_more" };
  if (answer === "unsure") return { ask: false, outcome: "unsure" };
  // They say it is all they have. A lab-only file closes without charge. An unclear file goes on to the normal intake: the program was not sure, so it does not turn the customer away.
  return kind === "lab_only" ? { ask: false, outcome: "close_lab_only" } : { ask: false, outcome: "continue" };
}
/** The fixed message for an outcome, or null when there is none or it is not yet approved. Never charges: a closing or waiting outcome has no payment step. */
export function messageFor(rules: FirstLookRules, outcome: Outcome | null): string | null {
  if (outcome === null || outcome === "continue") return null;
  const m = rules.messages[outcome];
  return m.approved ? m.text : null;
}
export const chargesCustomer = (outcome: Outcome | null): boolean => outcome === "continue";
