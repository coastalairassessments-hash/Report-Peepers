import { describe, it, expect } from "vitest";
import { loadFirstLook, messageFor, nextStep, parseFirstLook, chargesCustomer, afterChoice } from "../../src/ingest/firstLook.js";
import { readFileSync } from "node:fs";

const rules = loadFirstLook();
const raw = JSON.parse(readFileSync(new URL("../../../../data/rules/first_look_messages.json", import.meta.url), "utf8"));
const approvedRules = () => parseFirstLook({ ...raw, messages: Object.fromEntries(Object.entries(raw.messages).map(([k, v]) => [k, { ...(v as object), approved: true }])) });

describe("first look: what happens next", () => {
  it("a full report is never asked", () => { expect(nextStep("inspection_report", null)).toEqual({ ask: false, outcome: "continue" }); });
  it("lab only or unclear is asked first", () => {
    expect(nextStep("lab_only", null)).toEqual({ ask: true, outcome: null });
    expect(nextStep("unclear", null)).toEqual({ ask: true, outcome: null });
  });
  it("'no, I have more' asks for the rest; 'not sure' gets both paths", () => {
    expect(nextStep("lab_only", "no").outcome).toBe("ask_more");
    expect(nextStep("lab_only", "unsure").outcome).toBe("unsure");
  });
  it("'this is all I have' offers a lab-only file a choice, and neither choice starts a review", () => {
    expect(nextStep("lab_only", "yes").outcome).toBe("offer_choice");
    expect(afterChoice("take_back")).toBe("close_lab_only");
    expect(afterChoice("buy_outline")).toBe("outline_purchase");
    for (const o of ["offer_choice", "close_lab_only", "outline_purchase"] as const) expect(chargesCustomer(o)).toBe(false);
  });
  it("an unclear file is not turned away because the program was unsure", () => { expect(nextStep("unclear", "yes").outcome).toBe("continue"); });
  it("only 'continue' leads to a charge", () => {
    for (const o of ["ask_more", "offer_choice", "close_lab_only", "outline_purchase", "unsure"] as const) expect(chargesCustomer(o)).toBe(false);
    expect(chargesCustomer("continue")).toBe(true);
  });
});

describe("first look: the fixed messages", () => {
  it("a message switched off (approved:false) is never shown", () => {
    const off = { ...rules, messages: Object.fromEntries(Object.entries(rules.messages).map(([k, m]) => [k, { ...m, approved: false }])) } as typeof rules;
    for (const o of ["ask_more", "offer_choice", "close_lab_only", "outline_purchase", "unsure"] as const) expect(messageFor(off, o)).toBeNull();
  });
  it("approved messages are shown, and continue has none", () => {
    const a = approvedRules();
    expect(messageFor(a, "close_lab_only")).toMatch(/not been charged/i);
    expect(messageFor(a, "offer_choice")).toMatch(/half the review fee/i);
    expect(messageFor(a, "continue")).toBeNull();
    expect(messageFor(a, null)).toBeNull();
  });
  it("wording that breaks the customer rules is refused", () => {
    expect(() => parseFirstLook({ ...raw, messages: { ...raw.messages, ask_more: { approved: true, text: "The inspector was negligent, so please add the rest of the report." } } })).toThrow(/wording/);
  });
  it("a message without its approved flag is refused", () => {
    expect(() => parseFirstLook({ ...raw, messages: { ...raw.messages, unsure: { text: "That is fine, add the report whenever you have it." } } })).toThrow(/approved/);
  });
  it("no draft says anything fear-based or blames the customer", () => {
    for (const m of Object.values(rules.messages)) expect(m.text).not.toMatch(/\b(danger|unsafe|toxic|your fault|failed|invalid)\b/i);
  });
});
