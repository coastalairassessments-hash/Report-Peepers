import { emptyConversation, nextConversationQuestion, answerConversation, stopConversation, boneCoverage, conversationSummary, type ConvInput, type ConvNode } from "../interview/conversation.js";
import type { Actor, Services } from "./types.js";
import type { StepFailure } from "./intake.js";

/** Lou's conversation is open from payment until the review is released. Before payment the scope questions run instead. */
const OPEN_STATES = ["ready_for_analysis", "analysis", "awaiting_client", "awaiting_reviewer", "needs_attention"];

type Seen = { ok: true; question: ConvNode | null; coverage: ReturnType<typeof boneCoverage>; finished: boolean };

async function open(svc: Services, actor: Actor, caseId: string): Promise<{ ok: true } | StepFailure> {
  if (!svc.conversations) return { ok: false, reason: "not_available" };
  if (actor.role !== "customer") return { ok: false, reason: "customers_only" };
  const rec = await svc.repo.get(actor, caseId);
  if (!rec) return { ok: false, reason: "not_found" };
  if (!OPEN_STATES.includes(rec.state)) return { ok: false, reason: "not_open", detail: "Lou's conversation opens after payment and closes when the review is delivered." };
  return { ok: true };
}

const view = async (svc: Services, caseId: string): Promise<Seen> => {
  const st = (await svc.conversations!.get(caseId)) ?? emptyConversation();
  const q = nextConversationQuestion(svc.conversations!.nodes, st);
  return { ok: true, question: q, coverage: boneCoverage(svc.conversations!.nodes, svc.conversations!.bones, st), finished: q === null };
};

export async function conversationStep(svc: Services, actor: Actor, caseId: string): Promise<Seen | StepFailure> {
  const o = await open(svc, actor, caseId); if (!o.ok) return o;
  return view(svc, caseId);
}

export async function answerConversationStep(svc: Services, actor: Actor, caseId: string, questionId: string, input: ConvInput): Promise<Seen | StepFailure> {
  const o = await open(svc, actor, caseId); if (!o.ok) return o;
  const st = (await svc.conversations!.get(caseId)) ?? emptyConversation();
  const r = answerConversation(svc.conversations!.nodes, st, questionId, input, svc.now());
  if (!r.ok) return { ok: false, reason: r.reason };
  await svc.conversations!.put(caseId, r.state);
  return view(svc, caseId);
}

export async function stopConversationStep(svc: Services, actor: Actor, caseId: string): Promise<Seen | StepFailure> {
  const o = await open(svc, actor, caseId); if (!o.ok) return o;
  const st = (await svc.conversations!.get(caseId)) ?? emptyConversation();
  await svc.conversations!.put(caseId, stopConversation(st));
  return view(svc, caseId);
}

/** What the client told Lou, for the case record. The system and the owner can read it; nothing here is sent to a model. */
export async function conversationRecord(svc: Services, actor: Actor, caseId: string): Promise<{ ok: true; summary: ReturnType<typeof conversationSummary> } | StepFailure> {
  if (!svc.conversations) return { ok: false, reason: "not_available" };
  const rec = await svc.repo.get(actor, caseId);
  if (!rec) return { ok: false, reason: "not_found" };
  const st = (await svc.conversations.get(caseId)) ?? emptyConversation();
  return { ok: true, summary: conversationSummary(svc.conversations.nodes, st) };
}
