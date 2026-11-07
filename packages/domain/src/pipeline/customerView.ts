import type { CaseRecord, Services } from "./types.js";
import { downloadRelease } from "./release.js";

/**
 * What a customer may see of a case. Drafts, issues, the inspection review, the reviewer and the fingerprint never appear.
 * The review itself appears only after release.
 */
export interface CustomerView {
  id: string; state: string; display_name: string | null; page_count: number | null;
  review: { pdf: Uint8Array; text: string; delivered_at: string | null } | null;
}

export function customerViewOf(rec: CaseRecord): CustomerView {
  const released = rec.state === "released" && rec.released;
  return {
    id: rec.id, state: rec.state, display_name: rec.source?.display_name ?? null, page_count: rec.source?.page_count ?? null,
    review: released ? { pdf: new Uint8Array(rec.released!.markup_pdf), text: rec.released!.text, delivered_at: rec.released!.delivered_at ?? null } : null,
  };
}

/** Reads the released review for the case a verified session covers. Any problem looks the same. */
export async function readReleasedBySession(svc: Services, access: { sessionCase(s: string): Promise<string | null> }, session: string): Promise<{ ok: true; view: CustomerView } | { ok: false }> {
  const caseId = await access.sessionCase(session);
  if (!caseId) return { ok: false };
  const sys = { role: "system" } as const;
  const rec = await svc.repo.get(sys, caseId);
  if (!rec || rec.state !== "released") return { ok: false };
  const d = await downloadRelease(svc, sys, caseId);
  if (!d.ok) return { ok: false };
  return { ok: true, view: customerViewOf(rec) };
}
