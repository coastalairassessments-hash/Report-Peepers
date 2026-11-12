import { describe, it, expect } from "vitest";
import { startCase } from "../../src/pipeline/intake.js";
import { releaseAutomatically } from "../../src/pipeline/autoRelease.js";
import { purgeExpired, loadRetentionDays } from "../../src/pipeline/retention.js";
import { placeLegalHold } from "../../src/pipeline/legalHold.js";
import { conversationStep, answerConversationStep, stopConversationStep, conversationRecord } from "../../src/pipeline/conversation.js";
import { InMemoryConversationStore } from "../../src/pipeline/conversationStore.js";
import { loadConversation, loadBones } from "../../src/interview/conversation.js";
import { reviewReady } from "./slice-fixtures.js";
import { makeServices, alice, bob, sys } from "./helpers.js";
import { makePdf } from "../ingest/fixtures.js";

const store = () => new InMemoryConversationStore(loadConversation(), loadBones());
const DAY = 86_400_000;

describe("Lou's conversation in the pipeline (E25)", () => {
  it("is closed before payment, where the scope questions run instead", async () => {
    const svc = makeServices([], { conversations: store() });
    const s = await startCase(svc, alice, { name: "r.pdf", bytes: await makePdf([{ puts: [{ text: "Moisture readings.", x: 40, y: 740, size: 10 }] }]) });
    const id = (s as { case_id: string }).case_id;
    expect(await conversationStep(svc, alice, id)).toMatchObject({ ok: false, reason: "not_open" });
  });
  it("opens after payment: asks the first question, saves each answer, shows coverage, and finishes", async () => {
    const { svc, id } = await reviewReady();
    svc.conversations = store();
    const first = await conversationStep(svc, alice, id);
    expect(first).toMatchObject({ ok: true, finished: false });
    expect((first as { question: { id: string } }).question.id).toBe("C01");
    const r = await answerConversationStep(svc, alice, id, "C01", { choice: "no" });
    expect(r).toMatchObject({ ok: true });
    expect((r as { coverage: { id: string; answered: number }[] }).coverage.find((c) => c.id === "agreement")!.answered).toBe(1);
    const stopped = await stopConversationStep(svc, alice, id);
    expect(stopped).toMatchObject({ ok: true, finished: true, question: null });
    const rec = await conversationRecord(svc, sys, id);
    expect(rec).toMatchObject({ ok: true });
    expect((rec as { summary: { answer: string }[] }).summary[0]!.answer).toBe("No");
  });
  it("only the owner can answer; a bad answer is refused and nothing is saved", async () => {
    const { svc, id } = await reviewReady();
    svc.conversations = store();
    expect(await answerConversationStep(svc, bob, id, "C01", { choice: "yes" })).toMatchObject({ ok: false, reason: "not_found" });
    expect(await answerConversationStep(svc, sys, id, "C01", { choice: "yes" })).toMatchObject({ ok: false, reason: "customers_only" });
    expect(await answerConversationStep(svc, alice, id, "C01", { choice: "maybe" as never })).toMatchObject({ ok: false, reason: "bad_choice" });
    expect((await conversationRecord(svc, sys, id) as { summary: unknown[] }).summary).toHaveLength(0);
  });
  it("closes when the review is delivered", async () => {
    const { svc, id } = await reviewReady();
    svc.conversations = store();
    await releaseAutomatically(svc, id);
    expect(await answerConversationStep(svc, alice, id, "C01", { choice: "yes" })).toMatchObject({ ok: false, reason: "not_open" });
  });
  it("is deleted with the case after the retention period, and kept while a legal hold is on", async () => {
    const { svc, id } = await reviewReady();
    svc.conversations = store();
    await answerConversationStep(svc, alice, id, "C01", { choice: "no" });
    await releaseAutomatically(svc, id);
    const at = (await svc.repo.get(sys, id))!.released!.delivered_at!;
    const later = new Date(Date.parse(at) + (loadRetentionDays() + 1) * DAY).toISOString();
    await placeLegalHold(svc, id, "dispute_notice");
    await purgeExpired(svc, { days: loadRetentionDays(), now: later });
    expect(await svc.conversations.get(id)).not.toBeNull();
    const { liftLegalHold } = await import("../../src/pipeline/legalHold.js");
    await liftLegalHold(svc, id);
    await purgeExpired(svc, { days: loadRetentionDays(), now: later });
    expect(await svc.conversations.get(id)).toBeNull();
  });
  it("is simply off when no store is wired", async () => {
    const { svc, id } = await reviewReady();
    expect(await conversationStep(svc, alice, id)).toMatchObject({ ok: false, reason: "not_available" });
  });
});
