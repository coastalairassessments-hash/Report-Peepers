import { describe, it, expect } from "vitest";
import { startCase, answerFirstLookStep, chooseLabOnlyStep, deliverOutlineStep, canCharge, verifyEntitlementStep, confirmScopeStep } from "../../src/pipeline/intake.js";
import { makeServices, answerAll, alice, bob, sys } from "./helpers.js";
import { makePdf } from "../ingest/fixtures.js";
import { loadDocumentKindConfig } from "../../src/ingest/documentKind.js";
import { parseFirstLook } from "../../src/ingest/firstLook.js";
import { readFileSync } from "node:fs";
import { parseOutlineRules } from "../../src/ingest/outline.js";
import { loadChecklist } from "../../src/inspection/checklist.js";
import type { PageSpec } from "../ingest/fixtures.js";

const raw = JSON.parse(readFileSync(new URL("../../../../data/rules/first_look_messages.json", import.meta.url), "utf8"));
const approved = parseFirstLook({ ...raw, messages: Object.fromEntries(Object.entries(raw.messages).map(([k, v]) => [k, { ...(v as object), approved: true }])) });
const page = (ls: string[]): PageSpec => ({ puts: ls.map((text, i) => ({ text, x: 40, y: 740 - i * 13, size: 9 })) });
const LAB = ["Laboratory Report", "Chain of Custody", "Analytical Results", "Aspergillus 85 spores/m3", "Analyst: J. Smith"];
const INSP = ["Scope of Work", "Visual Inspection and Observations", "Findings and Recommendations", "Limitations of this assessment", "Moisture readings were taken."];
const withLook = () => makeServices([], { firstLook: { kind: loadDocumentKindConfig(), rules: approved } });
const start = async (svc: ReturnType<typeof withLook>, lines: string[]) => { const s = await startCase(svc, alice, { name: "r.pdf", bytes: await makePdf([page(lines)]) }); if (!s.ok) throw new Error(s.reason); return s.case_id; };

describe("first look at upload", () => {
  it("a full inspection report is classified and not asked anything", async () => {
    const svc = withLook(); const id = await start(svc, INSP);
    const rec = (await svc.repo.get(sys, id))!;
    expect(rec.document_kind).toBe("inspection_report");
    expect(canCharge(svc, rec)).toBe(true);
  });
  it("a lab-only file must be asked, and cannot be charged before it is answered", async () => {
    const svc = withLook(); const id = await start(svc, LAB);
    const rec = (await svc.repo.get(sys, id))!;
    expect(rec.document_kind).toBe("lab_only");
    expect(canCharge(svc, rec)).toBe(false);
  });
  it("'this is all I have' offers the choice, and the review cannot be charged", async () => {
    const svc = withLook(); const id = await start(svc, LAB);
    const r = await answerFirstLookStep(svc, alice, id, "yes");
    expect(r).toMatchObject({ ok: true, outcome: "offer_choice" });
    expect((r as { message: string }).message).toMatch(/half the review fee/i);
    await answerAll(svc, alice, id);
    await confirmScopeStep(svc, alice, id);
    const v = await verifyEntitlementStep(svc, alice, id);
    expect(v.ok).toBe(false);
    expect((await svc.repo.get(sys, id))!.state).not.toBe("ready_for_analysis");
  });
  it("'I have more' asks for the rest and still cannot be charged", async () => {
    const svc = withLook(); const id = await start(svc, LAB);
    expect(await answerFirstLookStep(svc, alice, id, "no")).toMatchObject({ ok: true, outcome: "ask_more" });
    expect(canCharge(svc, (await svc.repo.get(sys, id))!)).toBe(false);
  });
  it("an unclear file where the customer says it is all they have goes on to the normal steps", async () => {
    const svc = withLook(); const id = await start(svc, ["Invoice 1234", "Thank you."]);
    expect(await answerFirstLookStep(svc, alice, id, "yes")).toMatchObject({ ok: true, outcome: "continue" });
    expect(canCharge(svc, (await svc.repo.get(sys, id))!)).toBe(true);
  });
  it("only the owner of the case can answer", async () => {
    const svc = withLook(); const id = await start(svc, LAB);
    expect((await answerFirstLookStep(svc, bob, id, "yes")).ok).toBe(false);
  });
  it("with the first look switched off nothing changes", async () => {
    const svc = makeServices(); const s = await startCase(svc, alice, { name: "r.pdf", bytes: await makePdf([page(LAB)]) });
    if (!s.ok) throw new Error("x");
    const rec = (await svc.repo.get(sys, s.case_id))!;
    expect(rec.document_kind ?? null).toBeNull();
    expect(canCharge(svc, rec)).toBe(true);
  });
  it("draft messages are never shown, but the case is still not charged", async () => {
    const svc = makeServices([], { firstLook: { kind: loadDocumentKindConfig(), rules: parseFirstLook(raw) } });
    const id = await start(svc, LAB);
    const r = await answerFirstLookStep(svc, alice, id, "yes");
    expect(r).toMatchObject({ ok: true, outcome: "offer_choice", message: null });
  });
});

describe("lab-only choice: take it back, or buy the general outline", () => {
  const oraw = JSON.parse(readFileSync(new URL("../../../../data/rules/outline.json", import.meta.url), "utf8"));
  const withOutline = (paid: boolean, ok = true) => makeServices([], { firstLook: { kind: loadDocumentKindConfig(), rules: approved }, outline: { rules: parseOutlineRules({ ...oraw, approved: ok }), checklist: loadChecklist(), paid: async () => paid } });
  const toChoice = async (svc: ReturnType<typeof withOutline>) => { const id = await start(svc as never, LAB); await answerFirstLookStep(svc, alice, id, "yes"); return id; };

  it("taking the file back closes with the approved message and no charge", async () => {
    const svc = withOutline(false); const id = await toChoice(svc);
    expect(await chooseLabOnlyStep(svc, alice, id, "take_back")).toMatchObject({ ok: true, outcome: "close_lab_only" });
    expect(canCharge(svc, (await svc.repo.get(sys, id))!)).toBe(false);
    expect(await deliverOutlineStep(svc, alice, id)).toMatchObject({ ok: false });
  });
  it("buying the outline: nothing is delivered until it is paid, and the review is still never charged", async () => {
    const svc = withOutline(false); const id = await toChoice(svc);
    expect(await chooseLabOnlyStep(svc, alice, id, "buy_outline")).toMatchObject({ ok: true, outcome: "outline_purchase" });
    expect(await deliverOutlineStep(svc, alice, id)).toMatchObject({ ok: false, reason: "not_paid" });
    expect(canCharge(svc, (await svc.repo.get(sys, id))!)).toBe(false);
  });
  it("once paid, the general outline is delivered, and it never mentions the file", async () => {
    const svc = withOutline(true); const id = await toChoice(svc);
    await chooseLabOnlyStep(svc, alice, id, "buy_outline");
    const r = await deliverOutlineStep(svc, alice, id);
    expect(r.ok).toBe(true);
    if (r.ok) { expect(r.outline.sections.length).toBeGreaterThan(5); expect(JSON.stringify(r.outline)).not.toMatch(/Aspergillus|85 spores|Smith/); }
  });
  it("draft outline wording is never delivered, even when paid", async () => {
    const svc = withOutline(true, false); const id = await toChoice(svc);
    await chooseLabOnlyStep(svc, alice, id, "buy_outline");
    expect(await deliverOutlineStep(svc, alice, id)).toMatchObject({ ok: false, reason: "wording_not_approved" });
  });
  it("the choice can only be made after the offer, only by the owner, and only for a lab-only file", async () => {
    const svc = withOutline(true); const id = await start(svc as never, LAB);
    expect((await chooseLabOnlyStep(svc, alice, id, "buy_outline")).ok).toBe(false);
    await answerFirstLookStep(svc, alice, id, "yes");
    expect((await chooseLabOnlyStep(svc, bob, id, "buy_outline")).ok).toBe(false);
    const full = await start(svc as never, INSP);
    expect((await chooseLabOnlyStep(svc, alice, full, "buy_outline")).ok).toBe(false);
  });
});
