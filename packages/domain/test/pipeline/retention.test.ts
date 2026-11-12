import { describe, it, expect } from "vitest";
import { releaseAutomatically } from "../../src/pipeline/autoRelease.js";
import { purgeExpired, loadRetentionDays } from "../../src/pipeline/retention.js";
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

  it("stamps created_at when a case starts, and a customer cannot change it", async () => {
    const { svc, id } = await reviewReady();
    const rec = (await svc.repo.get(sys, id))!;
    expect(rec.created_at).toMatch(/^2026-11-03T/);
    const mine = (await svc.repo.get(alice, id))!;
    await expect(svc.repo.save(alice, { ...mine, created_at: "2020-01-01T00:00:00.000Z" })).rejects.toThrow(/refused/i);
  });

  it("deletes a case that was never delivered 90 days after it was started, and not before", async () => {
    const { svc, id } = await reviewReady();
    const made = (await svc.repo.get(sys, id))!.created_at!;
    expect((await purgeExpired(svc, { days: 90, now: after(made, 89) })).purged).toBe(0);
    expect(await svc.repo.get(sys, id)).not.toBeNull();
    const r = await purgeExpired(svc, { days: 90, now: after(made, 91) });
    expect(r).toEqual({ purged: 1, files_deleted: 1, files_kept_shared: 0 });
    expect(await svc.repo.get(sys, id)).toBeNull();
  });

  it("a delivered case is timed from delivery, not from when it was started", async () => {
    const { svc, id } = await reviewReady();
    await releaseAutomatically(svc, id);
    const rec = (await svc.repo.get(sys, id))!;
    // Pretend it was started long ago but delivered recently.
    rec.created_at = "2026-01-01T00:00:00.000Z";
    (svc.repo as any).rows.set(id, structuredClone(rec));
    expect((await purgeExpired(svc, { days: 90, now: after(rec.released!.delivered_at!, 30) })).purged).toBe(0);
    expect((await purgeExpired(svc, { days: 90, now: after(rec.released!.delivered_at!, 91) })).purged).toBe(1);
  });

  it("keeps a file that another live case still uses", async () => {
    const { svc, id, bytes } = await reviewReady();
    await releaseAutomatically(svc, id);
    const other = await readyCase(svc, bytes, bob);
    const ref = (await svc.repo.get(sys, id))!.source!.file_ref;
    expect((await svc.repo.get(sys, other))!.source!.file_ref).toBe(ref);
    const at = (await svc.repo.get(sys, id))!.released!.delivered_at!;
    // The second customer started their case recently, so it is still live at day 91.
    const o = (await svc.repo.get(sys, other))!; o.created_at = after(at, 60);
    (svc.repo as any).rows.set(other, structuredClone(o));
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

describe("the retention period is data, not code (E18)", () => {
  it("is two years", () => { expect(loadRetentionDays()).toBe(730); });
  it("a case is kept at 729 days and deleted at 730", async () => {
    const { svc, id } = await reviewReady();
    await releaseAutomatically(svc, id);
    const at = (await svc.repo.get(sys, id))!.released!.delivered_at!;
    expect(await purgeExpired(svc, { days: loadRetentionDays(), now: after(at, 729) })).toMatchObject({ purged: 0 });
    expect(await purgeExpired(svc, { days: loadRetentionDays(), now: after(at, 730) })).toMatchObject({ purged: 1 });
  });
});
