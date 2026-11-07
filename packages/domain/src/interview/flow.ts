import type { Gap } from "./gaps.js";

/**
 * The interview flow (PLAN_INTERVIEW 22b). Pure functions over a small state: nothing changes in place.
 * One question at a time, in a fixed order. A question can be skipped and come back when the client asks. The client can stop at any time.
 * Answers are choices from the fixed list plus a tag (saw, told, unknown). There is no free text, so nothing a person types can reach a model.
 * An answer is a second source kept beside the report. It never edits the report's evidence and never closes a gap by itself.
 */
export type Tag = "saw" | "told" | "unknown";
const TAGS: readonly Tag[] = ["saw", "told", "unknown"];

export interface AnswerRecord { key: string; gap_id: string; area_id: string | null; choices: string[]; tag: Tag; answered_at: string }
export interface InterviewState { answers: AnswerRecord[]; skipped: string[]; stopped: boolean }

export const emptyState = (): InterviewState => ({ answers: [], skipped: [], stopped: false });

export type Step =
  | { kind: "question"; gap: Gap; position: number; total: number }
  | { kind: "paused"; skipped: number; answered: number }
  | { kind: "done"; answered: number; unknown: number };

export type Change = { ok: true; state: InterviewState } | { ok: false; reason: string };

const counts = (gaps: readonly Gap[], s: InterviewState) => {
  const live = new Set(gaps.map((g) => g.key));
  const mine = s.answers.filter((a) => live.has(a.key));
  return { answered: mine.filter((a) => a.tag !== "unknown").length, unknown: mine.filter((a) => a.tag === "unknown").length };
};

export function nextStep(gaps: readonly Gap[], s: InterviewState): Step {
  const c = counts(gaps, s);
  if (s.stopped) return { kind: "done", ...c };
  const answered = new Set(s.answers.map((a) => a.key));
  const open = gaps.map((gap, i) => ({ gap, i })).filter((x) => !answered.has(x.gap.key));
  const first = open.find((x) => !s.skipped.includes(x.gap.key));
  if (first) return { kind: "question", gap: first.gap, position: first.i + 1, total: gaps.length };
  const skipped = open.length;
  return skipped > 0 ? { kind: "paused", skipped, answered: c.answered } : { kind: "done", ...c };
}

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
const no = (reason: string): Change => ({ ok: false, reason });

export function answerGap(gaps: readonly Gap[], s: InterviewState, key: string, choices: string[], tag: Tag, now: string): Change {
  if (s.stopped) return no("stopped");
  const gap = gaps.find((g) => g.key === key);
  if (!gap) return no("unknown_question");
  if (!TAGS.includes(tag)) return no("unknown_tag");
  if (!ISO.test(now) || !Number.isFinite(Date.parse(now))) return no("bad_time");
  if (!Array.isArray(choices) || new Set(choices).size !== choices.length || !choices.every((c) => gap.options.includes(c))) return no("bad_choice");
  if (tag !== "unknown") {
    if (choices.length < 1) return no("choice_needed");
    if (gap.select === "one" && choices.length !== 1) return no("one_choice_only");
  } else if (choices.length > 0) return no("unknown_takes_no_choice");
  const rec: AnswerRecord = { key, gap_id: gap.gap_id, area_id: gap.area_id, choices: [...choices], tag, answered_at: now };
  return { ok: true, state: { answers: [...s.answers.filter((a) => a.key !== key), rec], skipped: s.skipped.filter((k) => k !== key), stopped: false } };
}

export function skipGap(gaps: readonly Gap[], s: InterviewState, key: string): Change {
  if (s.stopped) return no("stopped");
  if (!gaps.some((g) => g.key === key)) return no("unknown_question");
  if (s.answers.some((a) => a.key === key) || s.skipped.includes(key)) return { ok: true, state: structuredClone(s) };
  return { ok: true, state: { ...structuredClone(s), skipped: [...s.skipped, key] } };
}

/** Brings skipped questions back. Does not undo a stop. */
export const resumeSkipped = (s: InterviewState): InterviewState => ({ ...structuredClone(s), skipped: [] });
export const stopInterview = (s: InterviewState): InterviewState => ({ ...structuredClone(s), stopped: true });

export interface GapStatus { key: string; gap_id: string; area_id: string | null; status: "answered" | "unknown" | "open"; tag: Tag | null; choices: string[] }
/** Where each current question stands. A question with no answer is open, never guessed. */
export function summaryOf(gaps: readonly Gap[], s: InterviewState): GapStatus[] {
  return gaps.map((g) => {
    const a = s.answers.find((x) => x.key === g.key);
    return { key: g.key, gap_id: g.gap_id, area_id: g.area_id, status: a ? (a.tag === "unknown" ? "unknown" : "answered") : "open", tag: a?.tag ?? null, choices: a ? [...a.choices] : [] };
  });
}

export interface InterviewStore { get(caseId: string): Promise<InterviewState | null>; save(caseId: string, s: InterviewState): Promise<void>; delete(caseId: string): Promise<void> }

const same = (a: string[], b: string[]) => a.join() === b.join();
const REC_KEYS = ["answered_at", "area_id", "choices", "gap_id", "key", "tag"];

/** Keeps interviews by case. Refuses any field or value that is not allowed, so no free text can be stored. */
export class InMemoryInterviewStore implements InterviewStore {
  private rows = new Map<string, InterviewState>();
  async get(caseId: string) { const r = this.rows.get(caseId); return r ? structuredClone(r) : null; }
  async save(caseId: string, s: InterviewState) {
    const ok = same(Object.keys(s).sort(), ["answers", "skipped", "stopped"]) && typeof s.stopped === "boolean" &&
      Array.isArray(s.skipped) && s.skipped.every((k) => typeof k === "string") && Array.isArray(s.answers) &&
      s.answers.every((a) => same(Object.keys(a).sort(), REC_KEYS) && TAGS.includes(a.tag) && Array.isArray(a.choices) && a.choices.every((c) => typeof c === "string") &&
        typeof a.key === "string" && typeof a.gap_id === "string" && (a.area_id === null || typeof a.area_id === "string") && ISO.test(a.answered_at));
    if (!ok) throw new Error("Interview refused: it holds a field or value that is not allowed.");
    this.rows.set(caseId, structuredClone(s));
  }
  async delete(caseId: string) { this.rows.delete(caseId); }
}
