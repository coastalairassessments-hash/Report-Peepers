import { transition, type CaseState, type Facts } from "../caseStateMachine.js";
import { preflight } from "../ingest/preflight.js";
import { extractDocument } from "../ingest/extract.js";
import { classifyDocument } from "../ingest/documentKind.js";
import { afterChoice, messageFor, nextStep, type Answer as FlAnswer, type LabOnlyChoice, type Outcome } from "../ingest/firstLook.js";
import { buildOutline, type Outline } from "../ingest/outline.js";
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
/** May this case be charged and sent on? A file that looks like lab results only, or is unclear, must be asked first; only "continue" proceeds. */
export function canCharge(svc: Pick<Services, "firstLook">, rec: Pick<CaseRecord, "document_kind" | "first_look">): boolean {
  if (!svc.firstLook) return true;
  const kind = rec.document_kind ?? "unclear";
  return nextStep(kind, rec.first_look?.answer ?? null).outcome === "continue";
}

export async function answerFirstLookStep(svc: Services, actor: Actor, caseId: string, answer: FlAnswer): Promise<{ ok: true; outcome: Outcome; message: string | null } | StepFailure> {
  if (!svc.firstLook) return { ok: false, reason: "not_enabled" };
  if (!["yes", "no", "unsure"].includes(answer)) return { ok: false, reason: "bad_answer" };
  const rec = await svc.repo.get(actor, caseId);
  if (!rec) return { ok: false, reason: "not_found" };
  if (rec.state === "draft" || rec.state === "ready_for_analysis" || rec.state === "analysis") return { ok: false, reason: "wrong_state", detail: rec.state };
  const step = nextStep(rec.document_kind ?? "unclear", answer);
  if (!step.outcome) return { ok: false, reason: "not_asked" };
  rec.first_look = { answer, outcome: step.outcome };
  await svc.repo.save({ role: "system" }, rec); // the customer proved ownership by reading the case; only the system writes this field
  return { ok: true, outcome: step.outcome, message: messageFor(svc.firstLook.rules, step.outcome) };
}

export async function chooseLabOnlyStep(svc: Services, actor: Actor, caseId: string, choice: LabOnlyChoice): Promise<{ ok: true; outcome: Outcome; message: string | null } | StepFailure> {
  if (!svc.firstLook) return { ok: false, reason: "not_enabled" };
  if (choice !== "take_back" && choice !== "buy_outline") return { ok: false, reason: "bad_choice" };
  const rec = await svc.repo.get(actor, caseId);
  if (!rec) return { ok: false, reason: "not_found" };
  if (rec.document_kind !== "lab_only" || rec.first_look?.outcome !== "offer_choice") return { ok: false, reason: "not_offered" };
  const outcome = afterChoice(choice);
  rec.first_look = { ...rec.first_look, outcome, choice };
  await svc.repo.save({ role: "system" }, rec);
  return { ok: true, outcome, message: messageFor(svc.firstLook.rules, outcome) };
}

/** The general outline, only for a customer who chose it, only once the outline fee is paid, and only once its wording is approved. */
export async function deliverOutlineStep(svc: Services, actor: Actor, caseId: string): Promise<{ ok: true; outline: Outline } | StepFailure> {
  if (!svc.outline) return { ok: false, reason: "not_enabled" };
  const rec = await svc.repo.get(actor, caseId);
  if (!rec) return { ok: false, reason: "not_found" };
  if (rec.first_look?.choice !== "buy_outline") return { ok: false, reason: "not_chosen" };
  if (!(await svc.outline.paid(rec.id, rec.owner_id))) return { ok: false, reason: "not_paid" };
  const outline = buildOutline(svc.outline.rules, svc.outline.checklist);
  return outline ? { ok: true, outline } : { ok: false, reason: "wording_not_approved" };
}

export async function startCase(svc: Services, actor: Actor, file: { name: string; bytes: Uint8Array; acknowledged?: string[] }): Promise<{ ok: true; case_id: string } | StepFailure> {
  const c = asCustomer(actor);
  if (!c) return { ok: false, reason: "customers_only" };
  // E17: every acknowledgment must be accepted before anything is stored.
  if (svc.acknowledgments) {
    const have = new Set(file.acknowledged ?? []);
    const missing = svc.acknowledgments.items.map((i) => i.id).filter((id) => !have.has(id));
    if (missing.length) return { ok: false, reason: "acknowledgments_required", missing };
  }
  const pf = await preflight(file.bytes, file.name, svc.limits);
  if (!pf.ok) return { ok: false, reason: `file_${pf.reason}` };
  const file_ref = await svc.files.put(file.bytes);
  const issues: ProcessingIssue[] = pf.flags.map((f) => ({ id: svc.newId("ISS"), stage: "upload", code: f, detail: `The file contains ${f.replace("has_", "").replace(/_/g, " ")}. It was noticed and not run.`, acknowledged: false }));
  const rec: CaseRecord = {
    id: svc.newId("CASE"), owner_id: c.id, created_at: svc.now(), reviewer_id: null, state: "draft", answers: {}, scope: null,
    source: { file_ref, sha256: pf.content_sha256, byte_size: pf.byte_size, page_count: pf.page_count, display_name: file.name },
    snapshot: null, issues, attempts: 0, published_fingerprint: null, released: null,
    ...(svc.acknowledgments ? { acknowledged: { version: svc.acknowledgments.version, ids: svc.acknowledgments.items.map((i) => i.id), at: svc.now() } } : {}),
  };
  // A free first look: what kind of document is this? Any trouble reading means "unclear", never a guess.
  if (svc.firstLook) {
    try {
      const doc = svc.worker ? await svc.worker.extract(file.bytes) : await extractDocument(file.bytes);
      rec.document_kind = classifyDocument(doc, svc.firstLook.kind).kind;
    } catch { rec.document_kind = "unclear"; }
  }
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
  if (!canCharge(svc, rec)) return { ok: false, reason: "first_look_not_cleared" };
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
