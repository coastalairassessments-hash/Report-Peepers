import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawn } from "node:child_process";
import type { ExtractedDocument, ExtractedPage, Span } from "./extract.js";

/**
 * Reading a stranger's PDF happens in a separate, locked-down process. Bytes go in, plain JSON comes out, and the JSON is checked
 * against a strict shape and size limits before anything uses it. The process gets no environment variables (no secrets), cannot write
 * files, cannot start other programs and can read only the paths it is given (Node permission mode).
 * Not done here: cutting off the network. Node's permission mode does not do that in this version, so the hosting setup must (Johnathan).
 */
export interface WorkerLimits { timeout_ms: number; max_output_bytes: number; max_pages: number; max_spans_per_page: number; max_text_chars_per_page: number }
export interface ExtractionWorker { extract(bytes: Uint8Array): Promise<ExtractedDocument> }

export type WorkerErrorCode = "timeout" | "output_too_large" | "crashed" | "invalid_output" | "start_failed";
export class WorkerError extends Error {
  constructor(public readonly code: WorkerErrorCode, message: string) { super(message); this.name = "WorkerError"; }
}

export function loadWorkerLimits(path = resolve(import.meta.dirname, "../../../../data/rules/worker.json")): WorkerLimits {
  const raw = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  const out = {} as Record<string, number>;
  for (const k of ["timeout_ms", "max_output_bytes", "max_pages", "max_spans_per_page", "max_text_chars_per_page"]) {
    const v = raw[k];
    if (!Number.isInteger(v) || (v as number) < 1) throw new Error(`worker.json: ${k} must be a whole number of 1 or more.`);
    out[k] = v as number;
  }
  return out as unknown as WorkerLimits;
}

const bad = (why: string): never => { throw new WorkerError("invalid_output", `The reader's answer was refused: ${why}.`); };
const isObj = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const num = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);
const pair = (x: unknown): x is [number, number] => Array.isArray(x) && x.length === 2 && x.every(num);
const only = (o: Record<string, unknown>, allowed: string[], what: string) => { for (const k of Object.keys(o)) if (!allowed.includes(k)) bad(`${what} has an unexpected field`); };

/** Checks the worker's answer. Unknown fields, wrong types, impossible offsets and oversize values are all refused. */
export function validateExtractedDocument(x: unknown, lim: WorkerLimits): ExtractedDocument {
  if (!isObj(x)) return bad("not an object");
  only(x, ["page_count", "status", "pages"], "the document");
  if (!Number.isInteger(x.page_count) || (x.page_count as number) < 0 || (x.page_count as number) > lim.max_pages) bad("page count out of range");
  if (x.status !== "readable" && x.status !== "partially_readable") bad("status");
  if (!Array.isArray(x.pages) || x.pages.length !== x.page_count) bad("pages do not match the page count");
  const pages: ExtractedPage[] = (x.pages as unknown[]).map((p, n) => {
    if (!isObj(p)) return bad("a page is not an object");
    only(p, ["index", "label", "width", "height", "rotation", "text", "spans", "quality_flags"], "a page");
    if (p.index !== n + 1) bad("page index");
    if (p.label !== null && (typeof p.label !== "string" || p.label.length > 40)) bad("page label");
    if (!num(p.width) || !num(p.height) || p.width <= 0 || p.height <= 0 || p.width > 20000 || p.height > 20000) bad("page size");
    if (![0, 90, 180, 270].includes(p.rotation as number)) bad("rotation");
    if (typeof p.text !== "string" || p.text.length > lim.max_text_chars_per_page) bad("page text");
    if (!Array.isArray(p.quality_flags) || p.quality_flags.length > 20 || !p.quality_flags.every((f) => typeof f === "string" && /^[a-z0-9_]{1,40}$/.test(f))) bad("quality flags");
    if (!Array.isArray(p.spans) || p.spans.length > lim.max_spans_per_page) bad("too many spans");
    const text = p.text as string;
    const spans: Span[] = (p.spans as unknown[]).map((s) => {
      if (!isObj(s)) return bad("a span is not an object");
      only(s, ["text", "normalized_text", "start", "end", "origin", "along", "up", "source", "confidence"], "a span");
      if (typeof s.text !== "string" || typeof s.normalized_text !== "string") bad("span text");
      if (!Number.isInteger(s.start) || !Number.isInteger(s.end) || (s.start as number) < 0 || (s.end as number) < (s.start as number) || (s.end as number) > text.length) bad("span offsets");
      if (text.slice(s.start as number, s.end as number) !== s.text) bad("span text does not match the page text");
      if (!pair(s.origin) || !pair(s.along) || !pair(s.up)) bad("span geometry");
      if ("source" in s && s.source !== "ocr") bad("span source");
      if ("confidence" in s && (!num(s.confidence) || s.confidence < 0 || s.confidence > 100)) bad("span confidence");
      return s as unknown as Span;
    });
    return { index: p.index, label: p.label, width: p.width, height: p.height, rotation: p.rotation, text, spans, quality_flags: p.quality_flags } as ExtractedPage;
  });
  return { page_count: x.page_count as number, status: x.status as ExtractedDocument["status"], pages };
}

/** The arguments for a locked-down Node process: no writes, no child programs, and reads only from the listed paths. */
export function hardenedNodeArgs(script: string, readPaths: string[]): string[] {
  return ["--permission", ...readPaths.map((p) => `--allow-fs-read=${p}`), script];
}

export interface ProcessWorkerOptions { command: string; args: string[]; limits: WorkerLimits }

/** Runs one reading job in a fresh process. The environment is empty on purpose. */
export class ProcessWorker implements ExtractionWorker {
  constructor(private readonly o: ProcessWorkerOptions) {}

  extract(bytes: Uint8Array): Promise<ExtractedDocument> {
    const { limits } = this.o;
    return new Promise((resolveP, reject) => {
      let child;
      try { child = spawn(this.o.command, this.o.args, { env: {}, stdio: ["pipe", "pipe", "ignore"], shell: false, windowsHide: true }); }
      catch { reject(new WorkerError("start_failed", "The reading process could not be started.")); return; }
      const chunks: Buffer[] = [];
      let size = 0, settled = false;
      const done = (fn: () => void) => { if (settled) return; settled = true; clearTimeout(timer); child.kill("SIGKILL"); fn(); };
      const timer = setTimeout(() => done(() => reject(new WorkerError("timeout", "The reading process took too long and was stopped."))), limits.timeout_ms);
      child.on("error", () => done(() => reject(new WorkerError("start_failed", "The reading process could not be started."))));
      child.stdin.on("error", () => { /* A process that dies early is reported by its exit. */ });
      child.stdout.on("data", (c: Buffer) => {
        size += c.length;
        if (size > limits.max_output_bytes) { done(() => reject(new WorkerError("output_too_large", "The reading process returned more than the limit."))); return; }
        chunks.push(c);
      });
      child.on("close", (code) => {
        if (settled) return;
        if (code !== 0) { done(() => reject(new WorkerError("crashed", "The reading process stopped with an error."))); return; }
        done(() => {
          try { resolveP(validateExtractedDocument(JSON.parse(Buffer.concat(chunks).toString("utf8")), limits)); }
          catch (e) { reject(e instanceof WorkerError ? e : new WorkerError("invalid_output", "The reader's answer was not valid JSON.")); }
        });
      });
      child.stdin.end(Buffer.from(bytes));
    });
  }
}
