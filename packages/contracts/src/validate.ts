import { Ajv2020 } from "ajv/dist/2020.js";
import schemaV01 from "../../../docs/spec/review_contract.schema.json" with { type: "json" };
import schemaV02 from "../../../docs/spec/review_contract.v0.2.schema.json" with { type: "json" };
import schemaV03 from "../../../docs/spec/review_contract.v0.3.schema.json" with { type: "json" };
import type { EnvironmentalReviewCaseSnapshotVersion03 as V03 } from "./types03.js";

/** A snapshot of any version. Each version is the one before it plus optional additions (v0.3: the automatic release mode). */
export type CaseSnapshot = Omit<V03, "schema_version"> & { schema_version: "0.1" | "0.2" | "0.3" };

const ajv = new Ajv2020({ allErrors: true, strict: false });
const checkV01 = ajv.compile(schemaV01);
const checkV02 = ajv.compile(schemaV02);
const checkV03 = ajv.compile(schemaV03);

export type ValidationResult =
  | { ok: true; value: CaseSnapshot }
  | { ok: false; errors: string[] };

/** Validate unknown input against the contract named by its own schema_version ("0.1", "0.2" or "0.3"). */
export function validateCaseSnapshot(input: unknown): ValidationResult {
  const version = typeof input === "object" && input !== null ? (input as { schema_version?: unknown }).schema_version : undefined;
  if (version !== "0.1" && version !== "0.2" && version !== "0.3") return { ok: false, errors: [`/schema_version must be "0.1", "0.2" or "0.3"`] };
  const check = version === "0.1" ? checkV01 : version === "0.2" ? checkV02 : checkV03;
  if (check(input)) return { ok: true, value: input as unknown as CaseSnapshot };
  const errors = (check.errors ?? []).map((e) => `${e.instancePath || "/"} ${e.message ?? "invalid"}`);
  return { ok: false, errors };
}
