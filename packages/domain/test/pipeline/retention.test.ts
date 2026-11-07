import { describe, it, expect } from "vitest";
import { releaseAutomatically } from "../../src/pipeline/autoRelease.js";
import { purgeExpired } from "../../src/pipeline/retention.js";
import { InMemoryGrantStore, createAccess, loadAccessConfig } from "../../src/access/access.js";
import { reviewReady } from "./slice-fixtures.js";
import { readyCase, alice, bob, sys } from "./helpers.js";
import { createHash } from "node:crypto";

const DAY = 86_400_000;
const after = (iso: string, days: number) => new Date(Date.parse(iso) + days * DAY).toISOString();

describe("retention: delete 90 days after delivery", () => {
  it("stamps delivered_at when a case is released", async () => {
    const { svc, id } = await reviewReady();
    await releaseAutomatically(svc, id);
    const rec = (await svc.repo.get(sys, id))!;
    expect(rec.released!.delivered_at).toMatch(/^2026-11-03T/);
  });

  it("deletes the case, its uploaded file and its links after 90 days, and keeps the anonymous record", async () => {
    const { svc, id } = await reviewReady();
    await releaseAutomatically(svc, id);
    const rec = (await svc.repo.get(sys, id))!;
    const ref = rec.source!.file_ref;
    const grants = new InMemoryGrantStore();
    const access = createAccess({ now: svc.now, randomBytes: (n) => new Uint8Array(n).map((_, i) => i + 1), hash: (s) => createHash("sha256").update(s).digest("hex") }, grants, loadAccessConfig());
    const { token } = await access.issueLink(id, "pat@example.com");

    const r = await purgeExpired(svc, { days: 90, now: after(rec.released!.delivered_at!, 91), access });
    expect(r).toEqual({ purged: 1, files_deleted: 1, files_kept_shared: 0 });
    expect(await svc.repo.get(sys, id)).toBeNull();
    expect(await svc.repo.get(alice, id)).toBeNull();
    await expect(svc.files.get(ref)).rejects.toThrow();
    expect((await access.requestCode(token)).ok).toBe(false);
    expect(await svc.records.all()).toHaveLength(1);
  });

  it("does nothing before 90 days, and exactly at 90 days it does delete", async () => {
    const { svc, id } = await reviewReady();
    await releaseAutomatically(svc, id);
    const at = (await svc.repo.get(sys, id))!.released!.delivered_at!;
    expect((await purgeExpired(svc, { days: 90, now: after(at, 89) })).purged).toBe(0);
    expect((await svc.repo.get(sys, id))).not.toBeNull();
    expect((await purgeExpired(svc, { days: 90, now: after(at, 90) })).purged).toBe(1);
  });

  it("never touches a case that was not delivered", async () => {
    const { svc, id } = await reviewReady();
    const r = await purgeExpired(svc, { days: 90, now: after("2026-11-03T00:00:00.000Z", 500) });
    expect(r.purged).toBe(0);
    expect(await svc.repo.get(sys, id)).not.toBeNull();
  });

  it("keeps a file that another live case still uses", async () => {
    const { svc, id, bytes } = await reviewReady();
    await releaseAutomatically(svc, id);
    const other = await readyCase(svc, bytes, bob);
    const ref = (await svc.repo.get(sys, id))!.source!.file_ref;
    expect((await svc.repo.get(sys, other))!.source!.file_ref).toBe(ref);
    const at = (await svc.repo.get(sys, id))!.released!.delivered_at!;
    const r = await purgeExpired(svc, { days: 90, now: after(at, 91) });
    expect(r).toEqual({ purged: 1, files_deleted: 0, files_kept_shared: 1 });
    expect((await svc.files.get(ref)).length).toBeGreaterThan(0);
    expect(await svc.repo.get(sys, other)).not.toBeNull();
  });

  it("only the system may purge, and a bad number of days is refused", async () => {
    const { svc, id } = await reviewReady();
    await expect(svc.repo.purge(alice, id)).rejects.toThrow(/refused/i);
    await expect(purgeExpired(svc, { days: 0, now: "2026-11-03T00:00:00.000Z" })).rejects.toThrow(/days/);
    await expect(purgeExpired(svc, { days: 90, now: "not a date" })).rejects.toThrow(/now/);
  });
});
