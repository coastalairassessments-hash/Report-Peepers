import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Lou's conversation (E25). Asked after payment, while the report is being read.
 * The question list is data (`data/rules/lou_conversation.json`). Plain code walks it: which question is next, whether an answer is allowed, what the record says.
 * Typed answers are kept exactly as written (trimmed). They are never sent to a model and never change the report's evidence; they are a second record kept beside it.
 */
export type ConvKind = "yes_no_unsure" | "multi" | "text" | "choice";
export interface ConvWhen { id: string; equals?: string; includes?: string; includes_any?: string[] }
export interface ConvNode { id: string; group: string; bone: string; kind: ConvKind; text: string; why: string; options?: string[]; max_chars?: number; optional?: boolean; when?: ConvWhen }
export interface ConvAnswer { id: string; choice?: "yes" | "no" | "unsure"; picks?: string[]; text?: string; skipped?: boolean; at: string }
export interface ConvState { answers: ConvAnswer[]; stopped: boolean }
export type ConvInput = { choice?: "yes" | "no" | "unsure"; picks?: string[]; text?: string; skipped?: boolean };
export type ConvChange = { ok: true; state: ConvState } | { ok: false; reason: string };

export const emptyConversation = (): ConvState => ({ answers: [], stopped: false });
const DEFAULT_MAX = 600;
const KINDS: readonly ConvKind[] = ["yes_no_unsure", "multi", "text", "choice"];
const CHOICES = ["yes", "no", "unsure"] as const;

/** Loads and checks the list. A bad file stops the program at start-up; it never lets a half-working conversation through. */
export function parseConversation(raw: unknown): ConvNode[] {
  const list = (raw as { nodes?: unknown })?.nodes;
  if (!Array.isArray(list) || list.length === 0) throw new Error("conversation: at least one question is required");
  const bones = (raw as { bones?: { id: string }[] }).bones;
  if (!Array.isArray(bones) || bones.length === 0) throw new Error("conversation: at least one bone (area) is required");
  const seen: string[] = [];
  for (const n of list as ConvNode[]) {
    if (!bones.some((b) => b.id === n.bone)) throw new Error(`conversation: ${n.id} belongs to a bone that does not exist`);
    if (!n || typeof n.id !== "string" || !n.id || typeof n.text !== "string" || !n.text.trim() || typeof n.why !== "string" || typeof n.group !== "string") throw new Error("conversation: each question needs an id, group, text and why");
    if (seen.includes(n.id)) throw new Error(`conversation: duplicate id ${n.id}`);
    if (!KINDS.includes(n.kind)) throw new Error(`conversation: ${n.id} has an unknown kind`);
    if ((n.kind === "multi" || n.kind === "choice") && (!Array.isArray(n.options) || n.options.length < 2 || new Set(n.options).size !== n.options.length)) throw new Error(`conversation: ${n.id} needs two or more distinct options`);
    if (n.max_chars !== undefined && (!Number.isInteger(n.max_chars) || n.max_chars < 1 || n.max_chars > 2000)) throw new Error(`conversation: ${n.id} max_chars must be 1 to 2000`);
    if (n.when) {
      const parent = (list as ConvNode[]).find((m) => m.id === n.when!.id);
      if (!seen.includes(n.when.id) || !parent) throw new Error(`conversation: ${n.id} must follow an earlier question`);
      const w = n.when; const given = [w.equals, w.includes, w.includes_any].filter((x) => x !== undefined).length;
      if (given !== 1) throw new Error(`conversation: ${n.id} needs exactly one condition`);
      if (w.equals !== undefined && parent.kind === "yes_no_unsure" && !CHOICES.includes(w.equals as never)) throw new Error(`conversation: ${n.id} waits for a choice that does not exist`);
      for (const o of [w.includes, ...(w.includes_any ?? [])]) if (o !== undefined && !(parent.options ?? []).includes(o)) throw new Error(`conversation: ${n.id} waits for an option that does not exist`);
    }
    seen.push(n.id);
  }
  return list as ConvNode[];
}
export const loadConversation = (path = resolve(import.meta.dirname, "../../../../data/rules/lou_conversation.json")): ConvNode[] => parseConversation(JSON.parse(readFileSync(path, "utf8")));

const find = (s: ConvState, id: string) => s.answers.find((a) => a.id === id);

/** A follow-up is asked only when the answer it depends on was given (not skipped) and matches. */
export function isApplicable(n: ConvNode, s: ConvState): boolean {
  if (!n.when) return true;
  const a = find(s, n.when.id);
  if (!a || a.skipped) return false;
  const w = n.when;
  if (w.equals !== undefined) return a.choice === w.equals;
  const picks = a.picks ?? [];
  if (w.includes !== undefined) return picks.includes(w.includes);
  return (w.includes_any ?? []).some((o) => picks.includes(o));
}

/** The next question: the first applicable one not answered yet. null when the conversation is finished or the client stopped. */
export function nextConversationQuestion(nodes: readonly ConvNode[], s: ConvState): ConvNode | null {
  if (s.stopped) return null;
  return nodes.find((n) => isApplicable(n, s) && !find(s, n.id)) ?? null;
}

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;
const no = (reason: string): ConvChange => ({ ok: false, reason });

export function answerConversation(nodes: readonly ConvNode[], s: ConvState, id: string, input: ConvInput, now: string): ConvChange {
  if (s.stopped) return no("stopped");
  const n = nodes.find((x) => x.id === id);
  if (!n) return no("unknown_question");
  if (!ISO.test(now) || !Number.isFinite(Date.parse(now))) return no("bad_time");
  if (find(s, id)) return no("already_answered");
  if (!isApplicable(n, s)) return no("not_applicable");
  let rec: ConvAnswer;
  if (input.skipped) rec = { id, skipped: true, at: now };
  else if (n.kind === "yes_no_unsure") {
    if (!input.choice || !CHOICES.includes(input.choice)) return no("bad_choice");
    rec = { id, choice: input.choice, at: now };
  } else if (n.kind === "multi" || n.kind === "choice") {
    const p = input.picks;
    if (!Array.isArray(p) || p.length === 0) return no("choice_needed");
    if (new Set(p).size !== p.length || !p.every((o) => (n.options ?? []).includes(o))) return no("bad_choice");
    if (n.kind === "choice" && p.length !== 1) return no("one_choice_only");
    rec = { id, picks: [...p], at: now };
  } else {
    const t = (input.text ?? "").trim();
    if (!t) return no("text_needed");
    if (t.length > (n.max_chars ?? DEFAULT_MAX)) return no("too_long");
    if (CONTROL.test(t)) return no("bad_characters");
    rec = { id, text: t, at: now };
  }
  return { ok: true, state: { answers: [...s.answers, rec], stopped: false } };
}

export const stopConversation = (s: ConvState): ConvState => ({ answers: s.answers.map((a) => ({ ...a })), stopped: true });

const LABEL = { yes: "Yes", no: "No", unsure: "Not sure" } as const;
/** Each question asked, with what the client said, in the order asked. Skipped ones say so. */
export function conversationSummary(nodes: readonly ConvNode[], s: ConvState): { id: string; question: string; answer: string }[] {
  return s.answers.flatMap((a) => {
    const n = nodes.find((x) => x.id === a.id);
    if (!n) return [];
    const answer = a.skipped ? "Skipped" : a.choice ? LABEL[a.choice] : a.picks ? a.picks.join("; ") : a.text ?? "";
    return [{ id: a.id, question: n.text, answer }];
  });
}

export interface Bone { id: string; label: string }
export const loadBones = (path = resolve(import.meta.dirname, "../../../../data/rules/lou_conversation.json")): Bone[] => (JSON.parse(readFileSync(path, "utf8")) as { bones: Bone[] }).bones;

/**
 * The fishbone view (Cory, E25): the client's concern is the head, and each bone is one area of the story.
 * Coverage says, for each bone, how many questions were answered and how many could still be asked, so Lou can say "we've covered four of six areas".
 */
export function boneCoverage(nodes: readonly ConvNode[], bones: readonly Bone[], s: ConvState): { id: string; label: string; answered: number; open: number; covered: boolean }[] {
  return bones.map((b) => {
    const mine = nodes.filter((n) => n.bone === b.id);
    const answered = mine.filter((n) => find(s, n.id) && !find(s, n.id)!.skipped).length;
    const open = s.stopped ? 0 : mine.filter((n) => isApplicable(n, s) && !find(s, n.id)).length;
    return { id: b.id, label: b.label, answered, open, covered: open === 0 };
  });
}
