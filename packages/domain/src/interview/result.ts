import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { wordingProblems } from "../integrity.js";
import { citationProblems } from "../inspection/noCitations.js";
import type { Gap, InterviewRules } from "./gaps.js";
import { summaryOf, type InterviewState } from "./flow.js";

/**
 * The client's result (PLAN_INTERVIEW 22c). For each question: where it stands, and what the report may need because of the answer.
 * The notes are fixed wording from data/rules/interview_outcomes.json. A gap's notes are shown only once Cory marks them approved.
 * Nothing here changes the report, its evidence or the release gates. An answer is a second source, and the report stays as it was written.
 */
export type Need = "amendment" | "attachment" | "narrower_conclusion" | "nothing_further";
const NEEDS: readonly Need[] = ["amendment", "attachment", "narrower_conclusion", "nothing_further"];
const SHOWN_ORDER: readonly Exclude<Need, "nothing_further">[] = ["amendment", "attachment", "narrower_conclusion"];

export interface Note { needs: Need; text: string }
export interface GapOutcome { status: "ai_draft" | "approved"; open: Note; unknown: Note; choices: Map<string, Note> }
export interface InterviewOutcomes { told_text: string; gaps: Map<string, GapOutcome> }

export interface ResultGap {
  key: string; gap_id: string; area_id: string | null; status: "answered" | "unknown" | "open";
  /** The question as asked, and the homeowner's own answer, to show side by side. The answer is theirs, labeled as such, and is shown whether or not the notes are approved. */
  question: string; your_answer: { choices: string[]; how_known: "saw" | "told" | "unknown" } | null;
  needs: Exclude<Need, "nothing_further">[]; notes: string[]; pending_wording: boolean;
  /** Always false. An answer never edits the report. */
  report_changed: false;
}
export interface InterviewResult { gaps: ResultGap[]; needs: Exclude<Need, "nothing_further">[]; pending_wording: number }

const fail = (m: string): never => { throw new Error(`interview_outcomes.json: ${m}`); };
const isObj = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);

export function parseInterviewOutcomes(raw: unknown, rules: InterviewRules): InterviewOutcomes {
  if (!isObj(raw)) return fail("not an object");
  const checkText = (t: unknown, where: string): string => {
    if (typeof t !== "string" || t.length < 5) return fail(`${where} needs a sentence`);
    const lower = t.toLowerCase();
    if (rules.leading_phrases.some((p) => lower.includes(p))) fail(`${where} has leading wording`);
    if (wordingProblems(t).length || citationProblems(t).length) fail(`${where} breaks the customer-wording rules`);
    return t;
  };
  const note = (x: unknown, where: string): Note => {
    if (!isObj(x)) return fail(`${where} is not a note`);
    if (!NEEDS.includes(x.needs as Need)) fail(`${where}: needs must be one of ${NEEDS.join(", ")}`);
    return { needs: x.needs as Need, text: checkText(x.text, where) };
  };
  const told_text = checkText(raw.told_text, "told_text");
  if (!Array.isArray(raw.gaps)) return fail("gaps must be a list");
  const gaps = new Map<string, GapOutcome>();
  for (const g of raw.gaps as unknown[]) {
    if (!isObj(g) || typeof g.gap_id !== "string") return fail("every entry needs a gap_id");
    const rule = rules.gaps.find((r) => r.id === g.gap_id);
    if (!rule) return fail(`gap ${g.gap_id} is not in the interview rules`);
    if (gaps.has(g.gap_id)) fail(`gap ${g.gap_id} may appear once`);
    if (g.status !== "ai_draft" && g.status !== "approved") fail(`gap ${g.gap_id}: status must be ai_draft or approved`);
    if (!isObj(g.choices)) return fail(`gap ${g.gap_id}: choices missing`);
    const given = Object.keys(g.choices).sort(), want = [...rule.options].sort();
    if (given.length !== want.length || given.some((k, i) => k !== want[i])) fail(`gap ${g.gap_id}: choices must match the question's options exactly`);
    gaps.set(g.gap_id, {
      status: g.status as GapOutcome["status"], open: note(g.open, `${g.gap_id}.open`), unknown: note(g.unknown, `${g.gap_id}.unknown`),
      choices: new Map(rule.options.map((o) => [o, note((g.choices as Record<string, unknown>)[o], `${g.gap_id}.${o}`)])),
    });
  }
  return { told_text, gaps };
}

export function loadInterviewOutcomes(rules: InterviewRules, path = resolve(import.meta.dirname, "../../../../data/rules/interview_outcomes.json")): InterviewOutcomes {
  return parseInterviewOutcomes(JSON.parse(readFileSync(path, "utf8")), rules);
}

const shown = (needs: Iterable<Need>): ResultGap["needs"] => { const s = new Set(needs); return SHOWN_ORDER.filter((n) => s.has(n)); };

export function interviewResult(gaps: readonly Gap[], state: InterviewState, outcomes: InterviewOutcomes): InterviewResult {
  const out: ResultGap[] = summaryOf(gaps, state).map((s) => {
    const gap = gaps.find((g) => g.key === s.key)!;
    const base = { key: s.key, gap_id: s.gap_id, area_id: s.area_id, status: s.status, question: gap.question, your_answer: s.tag ? { choices: [...s.choices], how_known: s.tag } : null, report_changed: false as const };
    const o = outcomes.gaps.get(s.gap_id);
    // Fail closed: no entry, or wording not yet approved, shows nothing.
    if (!o || o.status !== "approved") return { ...base, needs: [], notes: [], pending_wording: true };
    if (s.status === "open") return { ...base, needs: shown([o.open.needs]), notes: [o.open.text], pending_wording: false };
    if (s.status === "unknown") return { ...base, needs: shown([o.unknown.needs]), notes: [o.unknown.text], pending_wording: false };
    const picked = gap.options.filter((opt) => s.choices.includes(opt)).map((opt) => o.choices.get(opt)!);
    const notes = picked.map((n) => n.text);
    if (s.tag === "told") notes.push(outcomes.told_text);
    return { ...base, needs: shown(picked.map((n) => n.needs)), notes, pending_wording: false };
  });
  return { gaps: out, needs: shown(out.flatMap((g) => g.needs)), pending_wording: out.filter((g) => g.pending_wording).length };
}
