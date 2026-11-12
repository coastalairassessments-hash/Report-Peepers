import type { Actor, Services } from "./types.js";
import type { StepFailure } from "./intake.js";

const actor: Actor = { role: "system" };

/**
 * Pauses deletion of one case while a dispute or legal notice is open (E17). Only the system calls this, after a person at ArcSys decides.
 * A held case is skipped by the retention purge. The reason is a short code, never the dispute's details.
 */
export async function placeLegalHold(svc: Services, caseId: string, reason: string): Promise<{ ok: true } | StepFailure> {
  if (!/^[a-z0-9_]{1,40}$/.test(reason)) return { ok: false, reason: "bad_reason_code" };
  const rec = await svc.repo.get(actor, caseId);
  if (!rec) return { ok: false, reason: "not_found" };
  rec.legal_hold = { at: svc.now(), reason };
  await svc.repo.save(actor, rec);
  return { ok: true };
}

export async function liftLegalHold(svc: Services, caseId: string): Promise<{ ok: true } | StepFailure> {
  const rec = await svc.repo.get(actor, caseId);
  if (!rec) return { ok: false, reason: "not_found" };
  rec.legal_hold = null;
  await svc.repo.save(actor, rec);
  return { ok: true };
}
