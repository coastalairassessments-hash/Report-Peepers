import { describe, it, expect } from "vitest";
import { InMemoryCaseRepository, InMemoryFileStore } from "../../src/pipeline/repository.js";
import type { Actor, CaseRecord } from "../../src/pipeline/types.js";

const alice: Actor = { role: "customer", id: "alice" }, bob: Actor = { role: "customer", id: "bob" };
const rev1: Actor = { role: "reviewer", id: "rev1" }, rev2: Actor = { role: "reviewer", id: "rev2" }, sys: Actor = { role: "system" };
export const blank = (id: string, owner: string, over: Partial<CaseRecord> = {}): CaseRecord => ({
  id, owner_id: owner, reviewer_id: null, state: "draft", answers: {}, scope: null, source: null, snapshot: null, issues: [], attempts: 0, published_fingerprint: null, released: null, ...over,
});

describe("case repository: who can see and change what", () => {
  it("a customer sees only their own cases; a missing case and someone else's look the same", async () => {
    const r = new InMemoryCaseRepository();
    await r.create(alice, blank("c1", "alice")); await r.create(bob, blank("c2", "bob"));
    expect((await r.list(alice)).map((c) => c.id)).toEqual(["c1"]);
    expect(await r.get(alice, "c2")).toBeNull();
    expect(await r.get(alice, "nope")).toBeNull();
    expect(await r.get(sys, "c2")).not.toBeNull();
  });

  it("a customer cannot start a case for someone else, or in a later state", async () => {
    const r = new InMemoryCaseRepository();
    await expect(r.create(alice, blank("c1", "bob"))).rejects.toThrow(/Access refused/);
    await expect(r.create(rev1, blank("c1", "alice"))).rejects.toThrow(/Access refused/);
    await expect(r.create(alice, blank("c1", "alice", { state: "released" }))).rejects.toThrow(/draft/);
  });

  it("another customer cannot save someone else's case", async () => {
    const r = new InMemoryCaseRepository();
    await r.create(alice, blank("c1", "alice"));
    await expect(r.save(bob, blank("c1", "alice", { state: "preflight" }))).rejects.toThrow(/Access refused/);
  });

  it("a reviewer sees only cases assigned to them", async () => {
    const r = new InMemoryCaseRepository();
    await r.create(alice, blank("c1", "alice"));
    await r.save(sys, blank("c1", "alice", { reviewer_id: "rev1" }));
    expect(await r.get(rev1, "c1")).not.toBeNull();
    expect(await r.get(rev2, "c1")).toBeNull();
    expect(await r.list(rev2)).toEqual([]);
  });

  it("the state can only move along the allowed transitions", async () => {
    const r = new InMemoryCaseRepository();
    await r.create(alice, blank("c1", "alice"));
    await expect(r.save(sys, blank("c1", "alice", { state: "released" }))).rejects.toThrow(/cannot go from draft to released/);
    await r.save(sys, blank("c1", "alice", { state: "preflight" }));
    expect((await r.get(sys, "c1"))!.state).toBe("preflight");
  });

  it("a customer cannot change system fields, assign a reviewer, or touch a case once analysis has started", async () => {
    const r = new InMemoryCaseRepository();
    await r.create(alice, blank("c1", "alice"));
    await expect(r.save(alice, blank("c1", "alice", { reviewer_id: "rev1" }))).rejects.toThrow(/reviewer_id/);
    await expect(r.save(alice, blank("c1", "alice", { attempts: 5 }))).rejects.toThrow(/attempts/);
    await r.save(sys, blank("c1", "alice", { state: "preflight" }));
    await r.save(sys, blank("c1", "alice", { state: "scope_intake" }));
    await r.save(sys, blank("c1", "alice", { state: "scope_confirmation" }));
    await r.save(sys, blank("c1", "alice", { state: "awaiting_payment" }));
    await r.save(sys, blank("c1", "alice", { state: "ready_for_analysis" }));
    await r.save(sys, blank("c1", "alice", { state: "analysis" }));
    await expect(r.save(alice, blank("c1", "alice", { state: "analysis", answers: { Q01: { text: "changed" } } }))).rejects.toThrow(/cannot change the case in this state/);
  });

  it("a reviewer can act only on a case awaiting review and cannot reassign it", async () => {
    const r = new InMemoryCaseRepository();
    await r.create(alice, blank("c1", "alice"));
    for (const s of ["preflight", "scope_intake", "scope_confirmation", "awaiting_payment", "ready_for_analysis", "analysis"] as const) await r.save(sys, blank("c1", "alice", { state: s, reviewer_id: "rev1" }));
    await expect(r.save(rev1, blank("c1", "alice", { state: "awaiting_reviewer", reviewer_id: "rev1" }))).rejects.toThrow(/only act on a case awaiting review/);
    await r.save(sys, blank("c1", "alice", { state: "awaiting_reviewer", reviewer_id: "rev1" }));
    await expect(r.save(rev1, blank("c1", "alice", { state: "awaiting_reviewer", reviewer_id: "rev2" }))).rejects.toThrow(/reassign/);
    await expect(r.save(rev1, blank("c1", "alice", { state: "awaiting_reviewer", reviewer_id: "rev1", attempts: 9 }))).rejects.toThrow(/attempts/);
  });

  it("a released case is read-only for everyone, including the system", async () => {
    const r = new InMemoryCaseRepository();
    await r.create(alice, blank("c1", "alice"));
    for (const s of ["preflight", "scope_intake", "scope_confirmation", "awaiting_payment", "ready_for_analysis", "analysis", "awaiting_reviewer", "released"] as const) await r.save(sys, blank("c1", "alice", { state: s, reviewer_id: "rev1" }));
    for (const who of [alice, rev1, sys]) await expect(r.save(who, blank("c1", "alice", { state: "released", reviewer_id: "rev1" }))).rejects.toThrow(/read-only/);
  });

  it("a returned case is a copy; changing it changes nothing stored", async () => {
    const r = new InMemoryCaseRepository();
    await r.create(alice, blank("c1", "alice"));
    const got = (await r.get(alice, "c1"))!; got.answers["Q01"] = { text: "x" }; got.state = "released";
    expect((await r.get(alice, "c1"))).toMatchObject({ state: "draft", answers: {} });
  });
});

describe("file store", () => {
  it("returns the bytes it was given, by a reference made from their hash, as a copy", async () => {
    const f = new InMemoryFileStore(), bytes = new Uint8Array([1, 2, 3]);
    const ref = await f.put(bytes);
    expect(ref).toMatch(/^file:[0-9a-f]{64}$/);
    bytes[0] = 9;
    expect([...(await f.get(ref))]).toEqual([1, 2, 3]);
    await expect(f.get("file:none")).rejects.toThrow(/No such file/);
  });
});

describe("reviewer and issues", () => {
  it("a reviewer may acknowledge issues but not change, add, or un-acknowledge them", async () => {
    const repo = new InMemoryCaseRepository();
    const rec = { ...blank("C1", "alice"), state: "awaiting_reviewer" as const, reviewer_id: "rev1", issues: [{ id: "I1", stage: "extraction" as const, code: "x", detail: "d", acknowledged: false }] };
    await (repo as any).rows.set(rec.id, structuredClone(rec));
    const rev = { role: "reviewer" as const, id: "rev1" };
    await expect(repo.save(rev, { ...rec, issues: [{ ...rec.issues[0]!, detail: "other" }] })).rejects.toThrow(/only acknowledge/);
    await expect(repo.save(rev, { ...rec, issues: [] })).rejects.toThrow(/only acknowledge/);
    await repo.save(rev, { ...rec, issues: [{ ...rec.issues[0]!, acknowledged: true }] });
    const done = (await repo.get(rev, "C1"))!;
    await expect(repo.save(rev, { ...done, issues: [{ ...done.issues[0]!, acknowledged: false }] })).rejects.toThrow(/only acknowledge/);
  });
});
