import { describe, it, expect } from "vitest";
import { loadLibrary } from "../../src/knowledge/library.js";
import { currentVersion, currentEntry, statusOf, isLive, type Decision, type Edit } from "../../src/knowledge/status.js";

const base = loadLibrary().entries.find((e) => e.id === "IEP-K-001")!;
const v0 = currentVersion(base, []);
const d = (o: Partial<Decision>): Decision => ({ entry_id: base.id, version: v0, reviewer: "Cory", role: "iep", decision: "accept", reason_code: null, comment: "", answer: "", seconds: 30, at: "2026-11-05T12:00:00Z", ...o });

describe("status of an entry", () => {
  it("starts as a draft", () => { expect(statusOf(base, [], [])).toBe("ai_draft"); });
  it("is in review once someone saves input", () => { expect(statusOf(base, [], [d({ decision: "discuss" })])).toBe("discussion"); });
  it("revise, discuss and reject set their own status", () => {
    expect(statusOf(base, [], [d({ decision: "revise" })])).toBe("revise");
    expect(statusOf(base, [], [d({ decision: "reject", reason_code: "low_value" })])).toBe("rejected");
  });
  it("one accept is iep_accepted", () => { expect(statusOf(base, [], [d({})])).toBe("iep_accepted"); });
  it("the same person accepting twice is still one accept", () => { expect(statusOf(base, [], [d({}), d({ at: "2026-11-05T13:00:00Z" })])).toBe("iep_accepted"); });
  it("two different people accepting is not yet approved without the owner", () => {
    expect(statusOf(base, [], [d({}), d({ reviewer: "Second", at: "2026-11-05T13:00:00Z" })])).toBe("iep_accepted");
  });
  it("two different accepts plus the owner's approval is approved", () => {
    expect(statusOf(base, [], [d({}), d({ reviewer: "Second" }), d({ reviewer: "Cory", role: "owner", decision: "approve" })])).toBe("approved");
  });
  it("the owner's approval alone does not approve", () => { expect(statusOf(base, [], [d({ role: "owner", decision: "approve" })])).not.toBe("approved"); });
  it("a later revise from the same person replaces their earlier accept", () => {
    expect(statusOf(base, [], [d({}), d({ decision: "revise", at: "2026-11-05T14:00:00Z" })])).toBe("revise");
  });
});

describe("editing resets approval", () => {
  const edit: Edit = { entry_id: base.id, author: "Cory", at: "2026-11-05T15:00:00Z", note: "tightened", fields: { principle: "New wording." } };
  it("an edit makes a new version with the edited text and keeps the original", () => {
    const cur = currentEntry(base, [edit]);
    expect(cur.principle).toBe("New wording.");
    expect(base.principle).not.toBe("New wording.");
    expect(currentVersion(base, [edit])).not.toBe(v0);
  });
  it("approvals for the old version no longer count", () => {
    const approvals = [d({}), d({ reviewer: "Second" }), d({ reviewer: "Cory", role: "owner", decision: "approve" })];
    expect(statusOf(base, [], approvals)).toBe("approved");
    expect(statusOf(base, [edit], approvals)).toBe("in_review");
  });
});

describe("only approved, fully tested entries go live", () => {
  const approved = [d({}), d({ reviewer: "Second" }), d({ reviewer: "Cory", role: "owner", decision: "approve" })];
  const pass = Object.fromEntries(base.fixtures.map((f) => [f.id, { executed: true, passed: true }]));
  it("approved and all four tests passed is live", () => { expect(isLive(base, [], approved, pass)).toBe(true); });
  it("approved with a test not run is not live", () => { expect(isLive(base, [], approved, { ...pass, [base.fixtures[0]!.id]: { executed: false, passed: false } })).toBe(false); });
  it("approved with a failed test is not live", () => { expect(isLive(base, [], approved, { ...pass, [base.fixtures[1]!.id]: { executed: true, passed: false } })).toBe(false); });
  it("not approved is not live even if the tests pass", () => { expect(isLive(base, [], [d({})], pass)).toBe(false); });
  it("a parked family is never live", () => {
    const parked = loadLibrary().entries.find((e) => e.family === "F10")!;
    const dec = [d({ entry_id: parked.id, version: currentVersion(parked, []) }), d({ entry_id: parked.id, version: currentVersion(parked, []), reviewer: "Second" }), d({ entry_id: parked.id, version: currentVersion(parked, []), role: "owner", decision: "approve" })];
    const res = Object.fromEntries(parked.fixtures.map((f) => [f.id, { executed: true, passed: true }]));
    expect(isLive(parked, [], dec, res)).toBe(false);
    expect(statusOf(parked, [], [])).toBe("parked");
  });
});
