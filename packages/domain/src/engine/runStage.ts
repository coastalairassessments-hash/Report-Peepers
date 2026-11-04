import { Ajv2020 } from "ajv/dist/2020.js";
import type { ValidateFunction } from "ajv/dist/2020.js";
import { makeAudit, type AuditRecord } from "./audit.js";
import type { ModelPort, StageRequest } from "./port.js";

/** A reply longer than this is refused before parsing. A technical bound, not a scientific threshold. */
export const MAX_REPLY_CHARS = 200_000;
const MAX_ERRORS = 20;

/**
 * One typed stage (spec section 15). The allow-list `buildData` decides what the model may see;
 * the schema decides what it may say. Nothing outside either reaches or leaves the model.
 */
export interface Stage<I, T> {
  name: string;
  promptVersion: string;
  /** Fixed text from a rule file. Never contains case material. */
  instructions: string;
  buildData: (input: I) => Record<string, unknown>;
  schema: object;
}

export type StageOutcome<T> =
  | { ok: true; value: T; audit: AuditRecord[] }
  | { ok: false; issue: "invalid_output" | "model_error"; errors: string[]; audit: AuditRecord[] };

const ajv = new Ajv2020({ allErrors: true, strict: false });
const compiled = new WeakMap<object, ValidateFunction>();
const validatorFor = (schema: object): ValidateFunction => {
  let v = compiled.get(schema);
  if (!v) { v = ajv.compile(schema); compiled.set(schema, v); }
  return v;
};

/** Strict JSON only. One markdown fence around the whole reply is tolerated; nothing else is repaired by code. */
function parseReply(text: string): { ok: true; value: unknown } | { ok: false; errors: string[] } {
  if (text.length > MAX_REPLY_CHARS) return { ok: false, errors: ["The reply is too large"] };
  let body = text.trim();
  if (body === "") return { ok: false, errors: ["The reply is empty"] };
  const fence = /^```(?:json)?[ \t]*\r?\n([\s\S]*?)\r?\n?```$/.exec(body);
  if (fence) body = fence[1]!.trim();
  try { return { ok: true, value: JSON.parse(body) }; }
  catch { return { ok: false, errors: ["The reply is not valid JSON"] }; }
}

/**
 * Builds the bounded request, calls the model, validates the reply, allows one repair, otherwise stops.
 * A failure is a processing issue; it never becomes a guessed result.
 */
export async function runStage<I, T>(port: ModelPort, stage: Stage<I, T>, input: I, now: () => string = () => new Date().toISOString()): Promise<StageOutcome<T>> {
  const audit: AuditRecord[] = [];
  const base: StageRequest = { stage: stage.name, promptVersion: stage.promptVersion, instructions: stage.instructions, data: stage.buildData(input) };
  const validate = validatorFor(stage.schema);
  let errors: string[] = [];

  for (let attempt = 0; attempt < 2; attempt++) {
    const req: StageRequest = attempt === 0 ? base : { ...base, repair: { errors } };
    const started = now();
    let reply;
    try { reply = await port(structuredClone(req)); }
    catch (e) { return { ok: false, issue: "model_error", errors: [e instanceof Error ? e.message : String(e)], audit }; }
    audit.push(makeAudit(req, reply, started, now()));

    const parsed = parseReply(reply.text);
    if (parsed.ok) {
      if (validate(parsed.value)) return { ok: true, value: parsed.value as T, audit };
      errors = (validate.errors ?? []).slice(0, MAX_ERRORS).map((e) => `${e.instancePath || "/"} ${e.message ?? "invalid"}`);
    } else errors = parsed.errors;
  }
  return { ok: false, issue: "invalid_output", errors, audit };
}
