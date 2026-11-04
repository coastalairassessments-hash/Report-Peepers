import type { ModelPort, ModelReply, StageRequest } from "./port.js";

export type ScriptItem = string | Error | { text: string; tokens?: { in: number; out: number } };
export type FakeModel = ModelPort & { calls: StageRequest[] };

/**
 * A scripted stand-in for a model. Replies come back in order; an Error item is thrown; running out is an error.
 * It exists so every rule around the model can be tested with no vendor, no network, and no real report.
 */
export function fakeModel(script: ScriptItem[], model = { name: "fake-model", version: "1" }): FakeModel {
  let i = 0;
  const calls: StageRequest[] = [];
  const port = (async (req: StageRequest): Promise<ModelReply> => {
    calls.push(structuredClone(req));
    if (i >= script.length) throw new Error(`Fake model script ran out after ${script.length} replies`);
    const item = script[i++]!;
    if (item instanceof Error) throw item;
    const { text, tokens } = typeof item === "string" ? { text: item, tokens: undefined } : item;
    return { text, model, tokens: tokens ?? { in: 0, out: 0 } };
  }) as FakeModel;
  port.calls = calls;
  return port;
}
