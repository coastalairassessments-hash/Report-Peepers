import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { PipelineConfig } from "./types.js";

export function loadPipelineConfig(path = resolve(import.meta.dirname, "../../../../data/rules/pipeline.json")): PipelineConfig {
  const raw = JSON.parse(readFileSync(path, "utf8")) as PipelineConfig;
  if (!Number.isInteger(raw.max_analysis_attempts) || raw.max_analysis_attempts < 1) throw new Error("pipeline.json: max_analysis_attempts must be a whole number of 1 or more.");
  if (raw.auto_release && (!Number.isInteger(raw.auto_release.max_held_back) || raw.auto_release.max_held_back < 0)) throw new Error("pipeline.json: auto_release.max_held_back must be a whole number of 0 or more.");
  return raw;
}
