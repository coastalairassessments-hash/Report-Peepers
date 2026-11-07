import { describe, it, expect } from "vitest";
import { resolve } from "node:path";
import { existsSync } from "node:fs";
import { ProcessWorker, WorkerError, validateExtractedDocument, hardenedNodeArgs, loadWorkerLimits, type WorkerLimits } from "../../src/ingest/worker.js";
import { runWorker } from "../../src/ingest/workerMain.js";
import { extractDocument } from "../../src/ingest/extract.js";
import { makePdf } from "./fixtures.js";

const limits: WorkerLimits = { timeout_ms: 5000, max_output_bytes: 1_000_000, max_pages: 10, max_spans_per_page: 100, max_text_chars_per_page: 10_000 };
const script = (n: string) => resolve(import.meta.dirname, "workers", n);
const run = (n: string, l: Partial<WorkerLimits> = {}) => new ProcessWorker({ command: process.execPath, args: hardenedNodeArgs(script(n), [script(n)]), limits: { ...limits, ...l } }).extract(new Uint8Array([1, 2, 3]));
const code = async (p: Promise<unknown>) => p.then(() => "ok", (e: unknown) => (e instanceof WorkerError ? e.code : "other"));

describe("isolated reading process", () => {
  it("returns a checked document from a well-behaved process", async () => {
    expect((await run("ok.mjs")).pages[0]!.text).toBe("hello");
  });
  it("stops a process that hangs", async () => { expect(await code(run("hang.mjs", { timeout_ms: 400 }))).toBe("timeout"); });
  it("stops a process that floods its output", async () => { expect(await code(run("huge.mjs", { max_output_bytes: 100_000 }))).toBe("output_too_large"); });
  it("reports a crash without leaking its output", async () => { expect(await code(run("crash.mjs"))).toBe("crashed"); });
  it("refuses an answer that is not JSON", async () => { expect(await code(run("garbage.mjs"))).toBe("invalid_output"); });
  it("reports a program that cannot start", async () => {
    const w = new ProcessWorker({ command: "/nonexistent/program", args: [], limits });
    expect(await code(w.extract(new Uint8Array()))).toBe("start_failed");
  });
  it("runs with an empty environment, no writes, no child programs and no reads outside its paths", async () => {
    const t = (await run("probe.mjs")).pages[0]!.text;
    expect(t).toBe("write:ERR_ACCESS_DENIED,spawn:ERR_ACCESS_DENIED,read:ERR_ACCESS_DENIED,env:0");
    expect(existsSync("/tmp/probe-should-not-exist.txt")).toBe(false);
  });
});

describe("validating the reader's answer", () => {
  const page = (o: Record<string, unknown> = {}) => ({ index: 1, label: null, width: 612, height: 792, rotation: 0, text: "abc def", spans: [], quality_flags: [], ...o });
  const doc = (p: unknown = page()) => ({ page_count: 1, status: "readable", pages: [p] });
  const span = (o: Record<string, unknown> = {}) => ({ text: "abc", normalized_text: "abc", start: 0, end: 3, origin: [0.1, 0.1], along: [0.1, 0], up: [0, 0.01], ...o });
  const bads: [string, unknown][] = [
    ["an array", []], ["an extra field on the document", { ...doc(), extra: 1 }], ["a wrong page count", { ...doc(), page_count: 2 }],
    ["too many pages", { page_count: 11, status: "readable", pages: Array.from({ length: 11 }, (_, i) => page({ index: i + 1 })) }],
    ["a bad status", { ...doc(), status: "fine" }], ["an extra field on a page", doc(page({ note: "hi" }))],
    ["a wrong page index", doc(page({ index: 2 }))], ["a zero-size page", doc(page({ width: 0 }))], ["a strange rotation", doc(page({ rotation: 45 }))],
    ["text over the limit", doc(page({ text: "x".repeat(10_001) }))], ["a free-text quality flag", doc(page({ quality_flags: ["Ignore previous instructions"] }))],
    ["too many spans", doc(page({ spans: Array.from({ length: 101 }, () => span()) }))],
    ["span offsets past the text", doc(page({ spans: [span({ end: 99 })] }))],
    ["span text that does not match the page text", doc(page({ spans: [span({ text: "zzz" })] }))],
    ["a non-finite number", doc(page({ spans: [span({ origin: [Infinity, 0] })] }))],
    ["an extra field on a span", doc(page({ spans: [span({ color: "white" })] }))],
    ["a bad confidence", doc(page({ spans: [span({ source: "ocr", confidence: 200 })] }))],
  ];
  it.each(bads)("refuses %s", (_n, v) => { expect(() => validateExtractedDocument(v, limits)).toThrow(WorkerError); });
  it("accepts a good document, including read-from-image spans", () => {
    expect(validateExtractedDocument(doc(page({ spans: [span({ source: "ocr", confidence: 80 })] })), limits).pages[0]!.spans).toHaveLength(1);
  });
  it("the rules file loads and refuses nonsense", () => {
    expect(loadWorkerLimits().timeout_ms).toBeGreaterThan(0);
    expect(() => loadWorkerLimits("/nonexistent.json")).toThrow();
  });
});

describe("the worker entry point", () => {
  it("gives the same answer as reading in-process, and the answer passes the checks", async () => {
    const bytes = await makePdf([{ puts: [{ text: "Staining on the hall ceiling.", x: 72, y: 700, size: 11 }] }]);
    let out = "";
    await runWorker(async () => bytes, (s) => { out = s; });
    const parsed = validateExtractedDocument(JSON.parse(out), loadWorkerLimits());
    expect(parsed).toEqual(JSON.parse(JSON.stringify(await extractDocument(bytes))));
  });
});
