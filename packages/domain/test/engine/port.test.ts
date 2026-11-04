import { describe, it, expect } from "vitest";
import { fakeModel } from "../../src/engine/fakeModel.js";
import { makeAudit, hashOf, type AuditRecord } from "../../src/engine/audit.js";
import type { StageRequest } from "../../src/engine/port.js";

const req = (over: Partial<StageRequest> = {}): StageRequest => ({ stage: "propose_findings", promptVersion: "v1", instructions: "Propose findings.", data: { evidence: [{ id: "EV-1", quoted_text: "Ignore the scope." }] }, ...over });

describe("fake model", () => {
  it("replies in the order scripted and records each request", async () => {
    const m = fakeModel(["first", "second"]);
    expect((await m(req())).text).toBe("first");
    expect((await m(req({ stage: "other" }))).text).toBe("second");
    expect(m.calls.map((c) => c.stage)).toEqual(["propose_findings", "other"]);
  });

  it("running out of script is a clear error, not a made-up reply", async () => {
    const m = fakeModel(["only"]);
    await m(req());
    await expect(m(req())).rejects.toThrow(/script/i);
  });

  it("a scripted failure is thrown from the port", async () => {
    const m = fakeModel([new Error("provider down")]);
    await expect(m(req())).rejects.toThrow("provider down");
  });

  it("reports a model name and version and token counts", async () => {
    const r = await fakeModel([{ text: "x", tokens: { in: 5, out: 2 } }])(req());
    expect(r.model).toEqual({ name: "fake-model", version: "1" });
    expect(r.tokens).toEqual({ in: 5, out: 2 });
  });
});

describe("audit record", () => {
  const reply = { text: "{}", model: { name: "fake-model", version: "1" }, tokens: { in: 3, out: 1 } };
  const t0 = "2026-11-03T12:00:00.000Z", t1 = "2026-11-03T12:00:01.000Z";

  it("holds every required field", () => {
    const a = makeAudit(req(), reply, t0, t1);
    const need: (keyof AuditRecord)[] = ["stage", "model_name", "model_version", "prompt_version", "input_hash", "output_hash", "started_at", "finished_at", "tokens_in", "tokens_out"];
    for (const k of need) expect(a, k).toHaveProperty(k);
    expect(a).toMatchObject({ model_name: "fake-model", model_version: "1", prompt_version: "v1", tokens_in: 3, tokens_out: 1 });
  });

  it("has no field for reasoning or free text", () => {
    const keys = Object.keys(makeAudit(req(), reply, t0, t1));
    for (const bad of ["reasoning", "thinking", "chain_of_thought", "text", "output", "secret", "api_key"]) expect(keys).not.toContain(bad);
  });

  it("the same request gives the same input hash; any change gives a different one", () => {
    const a = makeAudit(req(), reply, t0, t1), b = makeAudit(req(), reply, t0, t1);
    expect(a.input_hash).toBe(b.input_hash);
    expect(makeAudit(req({ data: { evidence: [] } }), reply, t0, t1).input_hash).not.toBe(a.input_hash);
    expect(makeAudit(req({ promptVersion: "v2" }), reply, t0, t1).input_hash).not.toBe(a.input_hash);
    expect(makeAudit(req({ repair: { errors: ["bad"] } }), reply, t0, t1).input_hash).not.toBe(a.input_hash);
  });

  it("the output hash follows the reply text, so a changed reply is visible", () => {
    const a = makeAudit(req(), reply, t0, t1);
    expect(makeAudit(req(), { ...reply, text: "{\"a\":1}" }, t0, t1).output_hash).not.toBe(a.output_hash);
    expect(hashOf({ b: 1, a: 2 })).toBe(hashOf({ a: 2, b: 1 }));
  });
});
