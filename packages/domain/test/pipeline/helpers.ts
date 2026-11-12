import { loadSuspiciousConfig } from "../../src/ingest/suspicious.js";
import { fakeModel, type FakeModel, type ScriptItem } from "../../src/engine/fakeModel.js";
import { InMemoryCaseRepository, InMemoryFileStore } from "../../src/pipeline/repository.js";
import { InMemoryRecordStore } from "../../src/analysis/store.js";
import { loadLimits } from "../../src/ingest/preflight.js";
import { loadPatterns } from "../../src/analysis/patterns.js";
import { loadExtractionConfig } from "../../src/engine/extractEvidence.js";
import { loadMarkupConfig } from "../../src/render/plan.js";
import { loadPipelineConfig } from "../../src/pipeline/config.js";
import { startCase, answerQuestion, confirmScopeStep, verifyEntitlementStep } from "../../src/pipeline/intake.js";
import type { Actor, Services } from "../../src/pipeline/types.js";
import type { Answer } from "../../src/intake.js";

export const alice: Actor = { role: "customer", id: "alice" };
export const bob: Actor = { role: "customer", id: "bob" };
export const rev1: Actor = { role: "reviewer", id: "rev1" };
export const sys: Actor = { role: "system" };

export interface TestServices extends Services { model: FakeModel; entitled: { value: boolean }; ticks: { n: number } }

/** Everything in memory, a scripted model, a clock that moves one minute per call, and ids that count. */
export function makeServices(script: ScriptItem[] = [], over: Partial<Services> = {}): TestServices {
  const entitled = { value: true }, ticks = { n: 0 }, counters = new Map<string, number>();
  return {
    repo: new InMemoryCaseRepository(), files: new InMemoryFileStore(), entitlement: { verified: async () => entitled.value },
    model: fakeModel(script), records: new InMemoryRecordStore(),
    now: () => new Date(Date.UTC(2026, 10, 3, 14, ticks.n++)).toISOString(),
    newId: (p) => { const n = (counters.get(p) ?? 0) + 1; counters.set(p, n); return `${p}-${String(n).padStart(3, "0")}`; },
    limits: loadLimits(), patterns: loadPatterns(), extraction: loadExtractionConfig(), suspicious: loadSuspiciousConfig(), markup: loadMarkupConfig(), pipeline: loadPipelineConfig(),
    ...over, entitled, ticks,
  } as TestServices;
}

/** Answers every question in turn: no limits reported, the service named, a goal stated. */
export const NO_LIMITS: Record<string, Answer> = {
  Q01: { text: "I want to know if the cause stated in the report is supported." },
  Q02: { choice: "no" },
  Q03: { service: "Limited assessment" },
  Q15: { choice: "no" },
  Q11: { choice: "no" },
  Q12: { text: "Is the duration estimate supported?" },
  Q13: { records: [] },
};

export async function answerAll(svc: Services, actor: Actor, caseId: string, answers: Record<string, Answer> = NO_LIMITS): Promise<void> {
  for (let i = 0; i < 20; i++) {
    const rec = (await svc.repo.get(actor, caseId))!;
    const { nextQuestion } = await import("../../src/intake.js");
    const q = nextQuestion(rec.answers);
    if (!q) return;
    const a = answers[q.id];
    if (!a) throw new Error(`Test setup: no answer for ${q.id}`);
    const r = await answerQuestion(svc, actor, caseId, q.id, a);
    if (!r.ok) throw new Error(`Test setup: ${r.reason}`);
  }
}

/** A case all the way to ready_for_analysis. */
export async function readyCase(svc: Services, bytes: Uint8Array, actor: Actor = alice): Promise<string> {
  const s = await startCase(svc, actor, { name: "report.pdf", bytes });
  if (!s.ok) throw new Error(`Test setup: ${s.reason}`);
  await answerAll(svc, actor, s.case_id);
  const c = await confirmScopeStep(svc, actor, s.case_id);
  if (!c.ok) throw new Error(`Test setup: ${c.reason}`);
  const e = await verifyEntitlementStep(svc, actor, s.case_id);
  if (!e.ok) throw new Error(`Test setup: ${e.reason}`);
  return s.case_id;
}
