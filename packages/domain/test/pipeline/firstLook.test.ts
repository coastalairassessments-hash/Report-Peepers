import { describe, it, expect } from "vitest";
import { startCase, answerFirstLookStep, canCharge, verifyEntitlementStep, confirmScopeStep } from "../../src/pipeline/intake.js";
import { makeServices, answerAll, alice, bob, sys } from "./helpers.js";
import { makePdf } from "../ingest/fixtures.js";
import { loadDocumentKindConfig } from "../../src/ingest/documentKind.js";
import { parseFirstLook } from "../../src/ingest/firstLook.js";
import { readFileSync } from "node:fs";
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
  it("'this is all I have' closes it with the approved message and no charge", async () => {
    const svc = withLook(); const id = await start(svc, LAB);
    const r = await answerFirstLookStep(svc, alice, id, "yes");
    expect(r).toMatchObject({ ok: true, outcome: "close_lab_only" });
    expect((r as { message: string }).message).toMatch(/not been charged/i);
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
    expect(r).toMatchObject({ ok: true, outcome: "close_lab_only", message: null });
  });
});
