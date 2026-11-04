import { createHash } from "node:crypto";
import { canon } from "../revision.js";
import type { ModelReply, StageRequest } from "./port.js";

/** One line per model call (spec 15.1). No reasoning, no secrets, no reply text: only versions, hashes, times, counts. */
export interface AuditRecord {
  stage: string;
  model_name: string;
  model_version: string;
  prompt_version: string;
  input_hash: string;
  output_hash: string;
  started_at: string;
  finished_at: string;
  tokens_in: number;
  tokens_out: number;
}

export const hashOf = (v: unknown): string => createHash("sha256").update(canon(v)).digest("hex");

export function makeAudit(req: StageRequest, reply: ModelReply, started_at: string, finished_at: string): AuditRecord {
  return {
    stage: req.stage, model_name: reply.model.name, model_version: reply.model.version, prompt_version: req.promptVersion,
    input_hash: hashOf(req), output_hash: hashOf(reply.text), started_at, finished_at, tokens_in: reply.tokens.in, tokens_out: reply.tokens.out,
  };
}
