import { describe, it, expect } from "vitest";
import { runAnalysis } from "../../src/pipeline/analyze.js";
import { extractDocument } from "../../src/ingest/extract.js";
import { WorkerError, type ExtractionWorker } from "../../src/ingest/worker.js";
import { releaseAutomatically } from "../../src/pipeline/autoRelease.js";
import { reviewReady, P1 } from "./slice-fixtures.js";
import { makeServices, readyCase, sys } from "./helpers.js";
import { makePdf } from "../ingest/fixtures.js";

describe("the isolated reader is used when one is set", () => {
  it("reads through the worker, and the case behaves the same", async () => {
    let calls = 0;
    const worker: ExtractionWorker = { extract: async (b) => { calls++; return extractDocument(b); } };
    const { svc, id } = await reviewReady();
    svc.worker = worker;
    expect(await releaseAutomatically(svc, id)).toMatchObject({ ok: true });
    expect(calls).toBeGreaterThan(0);
  });

  it("a worker failure fails the analysis and never falls back to reading in this process", async () => {
    const svc = makeServices();
    svc.worker = { extract: async () => { throw new WorkerError("timeout", "The reading process took too long and was stopped."); } };
    const id = await readyCase(svc, await makePdf([P1]));
    const r = await runAnalysis(svc, id);
    expect(r).toMatchObject({ ok: false });
    expect((await svc.repo.get(sys, id))!.state).toBe("failed");
  });

  it("a worker failure at release time holds the case instead of releasing", async () => {
    const { svc, id } = await reviewReady();
    svc.worker = { extract: async () => { throw new WorkerError("crashed", "x"); } };
    expect(await releaseAutomatically(svc, id)).toMatchObject({ ok: false, reason: "needs_attention" });
  });
});
