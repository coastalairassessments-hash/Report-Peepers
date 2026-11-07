import { transition, type CaseState, type Facts } from "../caseStateMachine.js";
import { preflight } from "../ingest/preflight.js";
import { buildScope, confirmScope, nextQuestion, recordScopeConflict, resolveScopeConflict, type Answer, type QuestionDef, type RestrictionKind } from "../intake.js";
import type { Actor, CaseRecord, ProcessingIssue, Services } from "./types.js";

export type StepFailure = { ok: false; reason: string; detail?: string; missing?: string[] };

/** Moves a record along the state machine or throws. Callers check the guard facts first and report a refusal instead. */
export function move(rec: CaseRecord, to: CaseState, facts: Facts = {}): { ok: true } | { ok: false; reason: string; missing?: string[] } {
  const t = transition(rec.state, to, facts);
  if (!t.ok) return { ok: false, reason: t.reason, ...(t.missing ? { missing: t.missing } : {}) };
  rec.state = t.to;
  return { ok: true };
}

const asCustomer = (a: Actor) => (a.role === "customer" ? a : null);

/**
 * Accepts an upload. A file that fails the preflight never enters a case and is never stored.
 * Scripts, launch actions, and embedded files are noticed and listed, never run.
 */
export async function startCase(svc: Services, actor: Actor, file: { name: string; bytes: Uint8Array }): Promise<{ ok: true; case_id: string } | StepFailure> {
  const c = asCustomer(actor);
  if (!c) return { ok: false, reason: "customers_only" };
  const pf = await preflight(file.bytes, file.name, svc.limits);
  if (!pf.ok) return { ok: false, reason: `file_${pf.reason}` };
  const file_ref = await svc.files.put(file.bytes);
  const issues: ProcessingIssue[] = pf.flags.map((f) => ({ id: svc.newId("ISS"), stage: "upload", code: f, detail: `The file contains ${f.replace("has_", "").replace(/_/g, " ")}. It was noticed and not run.`, acknowledged: false }));
  const rec: CaseRecord = {
    id: svc.newId("CASE"), owner_id: c.id, created_at: svc.now(), reviewer_id: null, state: "draft", answers: {}, scope: null,
    source: { file_ref, sha256: pf.content_sha256, byte_size: pf.byte_size, page_count: pf.page_count, display_name: file.name },
    snapshot: null, issues, attempts: 0, published_fingerprint: null, released: null,
  };
  await svc.repo.create(actor, rec);
  for (const to of ["preflight", "scope_intake"] as const) {
    const m = move(rec, to);
    if (!m.ok) throw new Error(`Unexpected: ${m.reason}`);
    await svc.repo.save(actor, rec);
  }
  return { ok: true, case_id: rec.id };
}

export async function answerQuestion(svc: Services, actor: Actor, caseId: string, questionId: string, answer: Answer): Promise<{ ok: true; next: QuestionDef | null } | StepFailure> {
  const rec = await svc.repo.get(actor, caseId);
  if (!rec) return { ok: false, reason: "not_found" };
  if (rec.state !== "scope_intake") return { ok: false, reason: "wrong_state", detail: rec.state };
  const next = nextQuestion(rec.answers);
  if (!next || next.id !== questionId) return { ok: false, reason: "not_the_next_question", detail: next?.id };
  rec.answers = { ...rec.answers, [questionId]: answer };
  await svc.repo.save(actor, rec);
  return { ok: true, next: nextQuestion(rec.answers) };
}

/** Builds the scope from the answers and confirms it. Unknown limits need the client to choose a conditional review. */
export async function confirmScopeStep(svc: Services, actor: Actor, caseId: string, opts: { conditional?: boolean } = {}): Promise<{ ok: true; status: "confirmed" | "conditional" } | StepFailure> {
  const rec = await svc.repo.get(actor, caseId);
  if (!rec) return { ok: false, reason: "not_found" };
  if (rec.state !== "scope_intake") return { ok: false, reason: "wrong_state", detail: rec.state };
  if (nextQuestion(rec.answers)) return { ok: false, reason: "questions_remaining" };
  const built = { ...buildScope(rec.answers), included_areas: [svc.pipeline.whole_report_area.id] };
  const res = confirmScope(built, { conditional: opts.conditional ?? false, now: svc.now() });
  if (!res.ok) return { ok: false, reason: res.reason, ...(res.unknownKinds ? { missing: res.unknownKinds } : {}) };
  rec.scope = res.scope;
  for (const to of ["scope_confirmation", "awaiting_payment"] as const) {
    const m = move(rec, to);
    if (!m.ok) throw new Error(`Unexpected: ${m.reason}`);
    await svc.repo.save(actor, rec);
  }
  return { ok: true, status: res.scope.confirmation_status as "confirmed" | "conditional" };
}

/** The client reports that the agreement and their memory disagree about a limit. Both accounts are kept; the case cannot proceed until it is resolved. */
export async function reportScopeConflict(svc: Services, actor: Actor, caseId: string, kind: RestrictionKind, accounts: { agreement: string; client: string }): Promise<{ ok: true } | StepFailure> {
  const rec = await svc.repo.get(actor, caseId);
  if (!rec?.scope) return { ok: false, reason: "not_found" };
  if (rec.state !== "awaiting_payment") return { ok: false, reason: "wrong_state", detail: rec.state };
  try { rec.scope = recordScopeConflict(rec.scope, kind, accounts); } catch (e) { return { ok: false, reason: "invalid", detail: e instanceof Error ? e.message : String(e) }; }
  await svc.repo.save(actor, rec);
  return { ok: true };
}

export async function resolveScopeConflictStep(svc: Services, actor: Actor, caseId: string, kind: RestrictionKind, decision: Parameters<typeof resolveScopeConflict>[2]): Promise<{ ok: true } | StepFailure> {
  const rec = await svc.repo.get(actor, caseId);
  if (!rec?.scope) return { ok: false, reason: "not_found" };
  if (rec.state !== "awaiting_payment") return { ok: false, reason: "wrong_state", detail: rec.state };
  try { rec.scope = resolveScopeConflict(rec.scope, kind, decision); } catch (e) { return { ok: false, reason: "invalid", detail: e instanceof Error ? e.message : String(e) }; }
  await svc.repo.save(actor, rec);
  return { ok: true };
}

const openConflict = (rec: CaseRecord) => (rec.scope?.conflict_accounts ?? []).some((c) => c.status === "open");

/** Checks the three facts the state machine requires before analysis. Payment is only a yes/no fact here. */
export async function verifyEntitlementStep(svc: Services, actor: Actor, caseId: string): Promise<{ ok: true } | StepFailure> {
  const rec = await svc.repo.get(actor, caseId);
  if (!rec) return { ok: false, reason: "not_found" };
  if (rec.state !== "awaiting_payment") return { ok: false, reason: "wrong_state", detail: rec.state };
  const facts: Facts = {
    entitlementVerified: await svc.entitlement.verified(rec.id, rec.owner_id),
    scopeConfirmedOrConditional: !!rec.scope && ["confirmed", "conditional"].includes(rec.scope.confirmation_status) && !openConflict(rec),
    preflightComplete: !!rec.source,
  };
  const m = move(rec, "ready_for_analysis", facts);
  if (!m.ok) return { ok: false, reason: m.reason, ...(m.missing ? { missing: m.missing } : {}) };
  await svc.repo.save(actor, rec);
  return { ok: true };
}
