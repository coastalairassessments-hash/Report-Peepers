import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { compileTypst, type CompileResult } from "./typst.js";
import type { MarkupPlan } from "./plan.js";

const TEMPLATE = readFileSync(resolve(import.meta.dirname, "markup.typ"), "utf8");

export type RenderResult = CompileResult;

/**
 * Draws the plan onto the customer's own report with the pinned Typst program: the original pages first, marks and
 * notes in red handwriting, then the typed summary and (if needed) the notes sheet. Drawing only: where things go was
 * decided by the planner. A bad plan or a missing source page fails the build and returns no file.
 */
export function renderMarkup(sourcePdf: Uint8Array, plan: MarkupPlan, opts: { createdAt?: number } = {}): Promise<RenderResult> {
  return compileTypst({ template: TEMPLATE, files: { "plan.json": JSON.stringify(plan), "source.pdf": sourcePdf }, ...(opts.createdAt !== undefined ? { createdAt: opts.createdAt } : {}) });
}
