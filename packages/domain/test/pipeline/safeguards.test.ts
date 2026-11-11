import { describe, it, expect } from "vitest";
import { startCase } from "../../src/pipeline/intake.js";
import { releaseAutomatically } from "../../src/pipeline/autoRelease.js";
import { purgeExpired } from "../../src/pipeline/retention.js";
import { placeLegalHold, liftLegalHold } from "../../src/pipeline/legalHold.js";
import { loadAcknowledgments } from "../../src/pipeline/acknowledgments.js";
import { makeServices, alice, bob, sys } from "./helpers.js";
import { reviewReady } from "./slice-fixtures.js";
import { makePdf } from "../ingest/fixtures.js";

const DAY = 86_400_000;
const after = (iso: string, days: number) => new Date(Date.parse(iso) + days * DAY).toISOString();
const pdf = async () => makePdf([{ puts: [{ text: "Moisture readings were taken in the kitchen.", x: 40, y: 740, size: 10 }] }]);

describe("upload acknowledgments (E17)", () => {
  const acks = loadAcknowledgments();
  it("the committed list has the four required items, each in plain words", () => {
    expect(acks.items.map((i) => i.id)).toEqual(["lawful_copy", "software_review", "no_person_review", "terms_read"]);
    for (const i of acks.items) expect(i.text.length).toBeGreaterThan(20);
  });
  it("a case cannot start until every required item is accepted, and the refusal names what is missing", async () => {
    const svc = makeServices([], { acknowledgments: acks });
    const r = await startCase(svc, alice, { name: "r.pdf", bytes: await pdf(), acknowledged: ["lawful_copy", "terms_read"] });
    expect(r).toMatchObject({ ok: false, reason: "acknowledgments_required", missing: ["software_review", "no_person_review"] });
    expect(await svc.repo.list({ role: "system" })).toHaveLength(0);
  });
  it("when all are accepted the case starts and records which version, which items and when", async () => {
    const svc = makeServices([], { acknowledgments: acks });
    const r = await startCase(svc, alice, { name: "r.pdf", bytes: await pdf(), acknowledged: acks.items.map((i) => i.id) });
    expect(r.ok).toBe(true);
    const rec = (await svc.repo.get(sys, (r as { case_id: string }).case_id))!;
    expect(rec.acknowledged).toMatchObject({ version: acks.version, ids: acks.items.map((i) => i.id) });
    expect(rec.acknowledged!.at).toMatch(/^\d{4}-/);
  });
  it("the customer cannot edit the record of what they accepted", async () => {
    const svc = makeServices([], { acknowledgments: acks });
    const r = await startCase(svc, alice, { name: "r.pdf", bytes: await pdf(), acknowledged: acks.items.map((i) => i.id) });
    const rec = (await svc.repo.get(alice, (r as { case_id: string }).case_id))!;
    rec.acknowledged = { version: "x", ids: [], at: "2020-01-01T00:00:00Z" };
    await expect(svc.repo.save(alice, rec)).rejects.toThrow(/cannot change acknowledged/);
  });
});

describe("legal hold: deletion pauses while a dispute is open (E17)", () => {
  it("a held case is not deleted after 90 days; once lifted it is", async () => {
    const { svc, id } = await reviewReady();
    await releaseAutomatically(svc, id);
    const at = (await svc.repo.get(sys, id))!.released!.delivered_at!;
    expect(await placeLegalHold(svc, id, "dispute_notice")).toMatchObject({ ok: true });
    expect(await purgeExpired(svc, { days: 90, now: after(at, 400) })).toMatchObject({ purged: 0 });
    expect(await svc.repo.get(sys, id)).not.toBeNull();
    expect(await liftLegalHold(svc, id)).toMatchObject({ ok: true });
    expect(await purgeExpired(svc, { days: 90, now: after(at, 400) })).toMatchObject({ purged: 1 });
  });
  it("the customer cannot place, lift or alter a hold, and a released case accepts nothing else from the system", async () => {
    const svc = makeServices();
    const started = await startCase(svc, alice, { name: "r.pdf", bytes: await pdf() });
    const rec = (await svc.repo.get(sys, (started as { case_id: string }).case_id))!;
    rec.legal_hold = { at: "2026-11-11T00:00:00Z", reason: "x" };
    await expect(svc.repo.save(alice, rec)).rejects.toThrow(/cannot change legal_hold/);
    void bob;
    const { svc: s2, id } = await reviewReady();
    await releaseAutomatically(s2, id);
    const released = (await s2.repo.get(sys, id))!;
    released.attempts += 1;
    await expect(s2.repo.save(sys, released)).rejects.toThrow(/read-only/);
  });
});
