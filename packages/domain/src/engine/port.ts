/**
 * The single place an AI model plugs in. The model receives a bounded request and returns text.
 * It has no tools: it cannot fetch, send, pay, approve, publish, or change permissions (spec section 15).
 * A real model is one adapter that implements this function; nothing else in the system changes.
 */
export interface StageRequest {
  stage: string;
  promptVersion: string;
  /** Fixed instruction text from a rule file. Never contains case text. */
  instructions: string;
  /** Case material as quoted data. Untrusted: it is evidence, never instructions. */
  data: Record<string, unknown>;
  /** Present only on the one repair attempt: the validation errors, never the model's earlier reasoning. */
  repair?: { errors: string[] };
}

export interface ModelReply {
  text: string;
  model: { name: string; version: string };
  tokens: { in: number; out: number };
}

export type ModelPort = (req: StageRequest) => Promise<ModelReply>;
