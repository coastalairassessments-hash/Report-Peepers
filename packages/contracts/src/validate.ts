import { Ajv2020 } from "ajv/dist/2020.js";
import schemaV01 from "../../../docs/spec/review_contract.schema.json" with { type: "json" };
import schemaV02 from "../../../docs/spec/review_contract.v0.2.schema.json" with { type: "json" };
import type { EnvironmentalReviewCaseSnapshotVersion02 as V02 } from "./types02.js";

/** A snapshot of either version. A v0.1 snapshot is a v0.2 snapshot that uses none of the optional additions. */
export type CaseSnapshot = Omit<V02, "schema_version"> & { schema_version: "0.1" | "0.2" };

const ajv = new Ajv2020({ allErrors: true, strict: false });
const checkV01 = ajv.compile(schemaV01);
const checkV02 = ajv.compile(schemaV02);

export type ValidationResult =
  | { ok: true; value: CaseSnapshot }
  | { ok: false; errors: string[] };

/** Validate unknown input against the contract named by its own schema_version ("0.1" or "0.2"). */
export function validateCaseSnapshot(input: unknown): ValidationResult {
  const version = typeof input === "object" && input !== null ? (input as { schema_version?: unknown }).schema_version : undefined;
  if (version !== "0.1" && version !== "0.2") return { ok: false, errors: [`/schema_version must be "0.1" or "0.2"`] };
  const check = version === "0.1" ? checkV01 : checkV02;
  if (check(input)) return { ok: true, value: input as unknown as CaseSnapshot };
  const errors = (check.errors ?? []).map((e) => `${e.instancePath || "/"} ${e.message ?? "invalid"}`);
  return { ok: false, errors };
}
