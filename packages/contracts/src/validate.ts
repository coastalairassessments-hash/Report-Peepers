import { Ajv2020 } from "ajv/dist/2020.js";
import schema from "../../../docs/spec/review_contract.schema.json" with { type: "json" };
import type { EnvironmentalReviewCaseSnapshotVersion01 as CaseSnapshot } from "./types.js";

export type { CaseSnapshot };

const ajv = new Ajv2020({ allErrors: true, strict: false });
const check = ajv.compile(schema);

export type ValidationResult =
  | { ok: true; value: CaseSnapshot }
  | { ok: false; errors: string[] };

/** Validate unknown input against the v0.1 case snapshot contract. */
export function validateCaseSnapshot(input: unknown): ValidationResult {
  if (check(input)) return { ok: true, value: input as unknown as CaseSnapshot };
  const errors = (check.errors ?? []).map((e) => `${e.instancePath || "/"} ${e.message ?? "invalid"}`);
  return { ok: false, errors };
}
