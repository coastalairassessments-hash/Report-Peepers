import { describe, it, expect } from "vitest";
import { startCase, answerQuestion, confirmScopeStep, verifyEntitlementStep, reportScopeConflict, resolveScopeConflictStep } from "../../src/pipeline/intake.js";
import { makeServices, answerAll, alice, bob, rev1, sys, NO_LIMITS } from "./helpers.js";
import { dense } from "../render/helpers.js";
import { makePdf, bytesOf, concat } from "../ingest/fixtures.js";

const pdf = () => makePdf([dense(6)]);
const stateOf = async (svc: ReturnType<typeof makeServices>, id: string) => (await svc.repo.get(sys, id))!.state;

describe("from upload to ready for analysis", () => {
  it("walks the real states in order and ends ready, with the scope confirmed", async () => {
    const svc = makeServices();
    const s = await startCase(svc, alice, { name: "report.pdf", bytes: await pdf() });
    expect(s.ok).toBe(true);
    if (!s.ok) return;
    expect(await stateOf(svc, s.case_id)).toBe("scope_intake");
    await answerAll(svc, alice, s.case_id);
    expect(await confirmScopeStep(svc, alice, s.case_id)).toEqual({ ok: true, status: "confirmed" });
    expect(await stateOf(svc, s.case_id)).toBe("awaiting_payment");
    expect(await verifyEntitlementStep(svc, alice, s.case_id)).toEqual({ ok: true });
    const rec = (await svc.repo.get(alice, s.case_id))!;
    expect(rec.state).toBe("ready_for_analysis");
    expect(rec.scope).toMatchObject({ confirmation_status: "confirmed", service_label: "limited_assessment", included_areas: ["AREA-001"] });
    expect(rec.source).toMatchObject({ display_name: "report.pdf", page_count: 1 });
  });

  it("a file that fails the preflight never becomes a case or gets stored", async () => {
    const svc = makeServices();
    for (const [bytes, reason] of [[new Uint8Array(0), "file_empty"], [new TextEncoder().encode("hello, not a pdf"), "file_not_a_pdf"], [new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]), "file_zip_or_office_container"]] as const) {
      expect(await startCase(svc, alice, { name: "x.pdf", bytes })).toEqual({ ok: false, reason });
    }
    expect(await svc.repo.list(alice)).toEqual([]);
  });

  it("a script inside the PDF is noticed and listed, never run", async () => {
    const svc = makeServices();
    const bytes = concat(await pdf(), bytesOf("\n% /JavaScript (app.alert(1)) /JS\n"));
    const s = await startCase(svc, alice, { name: "r.pdf", bytes });
    expect(s.ok).toBe(true);
    if (s.ok) expect((await svc.repo.get(alice, s.case_id))!.issues.map((i) => i.code)).toContain("has_javascript");
  });

  it("only a customer can start a case", async () => {
    const svc = makeServices();
    expect(await startCase(svc, rev1, { name: "r.pdf", bytes: await pdf() })).toEqual({ ok: false, reason: "customers_only" });
    expect(await startCase(svc, sys, { name: "r.pdf", bytes: await pdf() })).toEqual({ ok: false, reason: "customers_only" });
  });

  it("questions are answered one at a time, in order", async () => {
    const svc = makeServices();
    const s = await startCase(svc, alice, { name: "r.pdf", bytes: await pdf() });
    if (!s.ok) throw new Error("setup");
    expect(await answerQuestion(svc, alice, s.case_id, "Q05", { choice: "yes" })).toMatchObject({ ok: false, reason: "not_the_next_question", detail: "Q01" });
    const r = await answerQuestion(svc, alice, s.case_id, "Q01", NO_LIMITS["Q01"]!);
    expect(r).toMatchObject({ ok: true, next: { id: "Q02" } });
  });

  it("steps out of order are refused with the state they found", async () => {
    const svc = makeServices();
    const s = await startCase(svc, alice, { name: "r.pdf", bytes: await pdf() });
    if (!s.ok) throw new Error("setup");
    expect(await confirmScopeStep(svc, alice, s.case_id)).toEqual({ ok: false, reason: "questions_remaining" });
    expect(await verifyEntitlementStep(svc, alice, s.case_id)).toEqual({ ok: false, reason: "wrong_state", detail: "scope_intake" });
    await answerAll(svc, alice, s.case_id);
    expect(await answerQuestion(svc, alice, s.case_id, "Q01", { text: "again" })).toMatchObject({ ok: false });
    await confirmScopeStep(svc, alice, s.case_id);
    expect(await answerQuestion(svc, alice, s.case_id, "Q01", { text: "late change" })).toEqual({ ok: false, reason: "wrong_state", detail: "awaiting_payment" });
  });

  it("someone else's case looks like it does not exist", async () => {
    const svc = makeServices();
    const s = await startCase(svc, alice, { name: "r.pdf", bytes: await pdf() });
    if (!s.ok) throw new Error("setup");
    expect(await answerQuestion(svc, bob, s.case_id, "Q01", NO_LIMITS["Q01"]!)).toEqual({ ok: false, reason: "not_found" });
    expect(await confirmScopeStep(svc, bob, s.case_id)).toEqual({ ok: false, reason: "not_found" });
  });

  it("unknown limits need the client to choose a conditional review, and that choice is recorded", async () => {
    const svc = makeServices();
    const s = await startCase(svc, alice, { name: "r.pdf", bytes: await pdf() });
    if (!s.ok) throw new Error("setup");
    await answerAll(svc, alice, s.case_id, { ...NO_LIMITS, Q02: { choice: "unsure" }, Q04: { choice: "unsure" }, Q05: { choice: "unsure" }, Q06: { choice: "unsure" }, Q07: { choice: "unsure" }, Q08: { choice: "unsure" }, Q09: { choice: "unsure" } });
    const refused = await confirmScopeStep(svc, alice, s.case_id);
    expect(refused).toMatchObject({ ok: false, reason: "unknown_limits_need_conditional" });
    expect(await stateOf(svc, s.case_id)).toBe("scope_intake");
    expect(await confirmScopeStep(svc, alice, s.case_id, { conditional: true })).toEqual({ ok: true, status: "conditional" });
    expect(await verifyEntitlementStep(svc, alice, s.case_id)).toEqual({ ok: true });
  });

  it("without entitlement the case waits, and says which fact is missing", async () => {
    const svc = makeServices();
    svc.entitled.value = false;
    const s = await startCase(svc, alice, { name: "r.pdf", bytes: await pdf() });
    if (!s.ok) throw new Error("setup");
    await answerAll(svc, alice, s.case_id); await confirmScopeStep(svc, alice, s.case_id);
    expect(await verifyEntitlementStep(svc, alice, s.case_id)).toEqual({ ok: false, reason: "guard_failed", missing: ["entitlementVerified"] });
    expect(await stateOf(svc, s.case_id)).toBe("awaiting_payment");
    svc.entitled.value = true;
    expect(await verifyEntitlementStep(svc, alice, s.case_id)).toEqual({ ok: true });
  });

  it("a scope conflict blocks the case until it is resolved", async () => {
    const svc = makeServices();
    const s = await startCase(svc, alice, { name: "r.pdf", bytes: await pdf() });
    if (!s.ok) throw new Error("setup");
    await answerAll(svc, alice, s.case_id, { ...NO_LIMITS, Q02: { choice: "yes" }, Q04: { choice: "yes", text: "About one hour", value: 1, unit: "hour", proposedBy: "package" }, Q05: { choice: "no" }, Q06: { choice: "no" }, Q07: { choice: "no" }, Q08: { choice: "no" }, Q09: { choice: "no" }, Q10: { text: "I thought it was two hours." } });
    expect(await confirmScopeStep(svc, alice, s.case_id)).toEqual({ ok: true, status: "confirmed" });
    expect(await reportScopeConflict(svc, alice, s.case_id, "time", { agreement: "One hour visit", client: "Two hours promised" })).toEqual({ ok: true });
    expect(await verifyEntitlementStep(svc, alice, s.case_id)).toEqual({ ok: false, reason: "guard_failed", missing: ["scopeConfirmedOrConditional"] });
    expect(await resolveScopeConflictStep(svc, alice, s.case_id, "time", { choice: "agreement", outcome: "present", note: "The signed agreement says one hour." })).toEqual({ ok: true });
    expect(await verifyEntitlementStep(svc, alice, s.case_id)).toEqual({ ok: true });
  });
});
