import type { Services } from "./types.js";

export interface PurgeOptions {
  /** Days after delivery. Decided with Cory: 90. */
  days: number;
  /** The current time, as an ISO string. */
  now: string;
  /** When given, the case's links, codes and sessions are removed too. */
  access?: { revokeCase(caseId: string): Promise<void> };
}
export interface PurgeResult { purged: number; files_deleted: number; files_kept_shared: number }

/**
 * Deletes delivered cases whose retention time has passed: the case content, the released copy, and the uploaded file.
 * Files are shared by content hash, so a file goes only when no other live case still points at it.
 * Cases that were never delivered are not touched (the abandoned-case rule is not decided yet).
 * The anonymous summary records are a separate store and are not touched.
 */
export async function purgeExpired(svc: Services, opts: PurgeOptions): Promise<PurgeResult> {
  if (!Number.isInteger(opts.days) || opts.days < 1) throw new Error("days must be a whole number of 1 or more.");
  const nowMs = Date.parse(opts.now);
  if (Number.isNaN(nowMs)) throw new Error("now must be an ISO date and time.");
  const cases = await svc.repo.list({ role: "system" });
  const expired = cases.filter((c) => {
    const at = c.released?.delivered_at;
    return at !== undefined && nowMs - Date.parse(at) >= opts.days * 86_400_000;
  });
  const expiredIds = new Set(expired.map((c) => c.id));
  const stillUsed = new Set(cases.filter((c) => !expiredIds.has(c.id) && c.source).map((c) => c.source!.file_ref));
  const result: PurgeResult = { purged: 0, files_deleted: 0, files_kept_shared: 0 };
  const seen = new Set<string>();
  for (const c of expired) {
    const ref = c.source?.file_ref;
    await svc.repo.purge({ role: "system" }, c.id);
    if (opts.access) await opts.access.revokeCase(c.id);
    result.purged++;
    if (ref && !seen.has(ref)) {
      seen.add(ref);
      if (stillUsed.has(ref)) result.files_kept_shared++;
      else { await svc.files.delete(ref); result.files_deleted++; }
    }
  }
  return result;
}
