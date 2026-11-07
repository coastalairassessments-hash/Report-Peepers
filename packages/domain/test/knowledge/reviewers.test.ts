import { describe, it, expect } from "vitest";
import { loadLibrary } from "../../src/knowledge/library.js";
import { currentVersion, statusOf, type Decision } from "../../src/knowledge/status.js";
import { countsFor, loadReviewers, type ReviewerRegistry } from "../../src/knowledge/reviewers.js";

const base = loadLibrary().entries.find((e) => e.id === "IEP-K-001")!;
const v0 = currentVersion(base, []);
const d = (o: Partial<Decision>): Decision => ({ entry_id: base.id, version: v0, reviewer: "Cory", role: "iep", decision: "accept", reason_code: null, comment: "", answer: "", seconds: 30, at: "2026-11-07T12:00:00Z", ...o });
const reg: ReviewerRegistry = { reviewers: [{ name: "Cory", roles: ["iep", "owner"], active: true }, { name: "Second", roles: ["iep"], active: true }, { name: "Gone", roles: ["iep"], active: false }] };

describe("only registered reviewers count", () => {
  it("a decision by an unregistered name is ignored", () => {
    expect(statusOf(base, [], [d({ reviewer: "Stranger" })], reg)).toBe("ai_draft");
  });
  it("an inactive reviewer is ignored", () => { expect(countsFor(reg, d({ reviewer: "Gone" }))).toBe(false); });
  it("a reviewer counts only in a role they are listed for", () => {
    expect(countsFor(reg, d({ reviewer: "Second", role: "owner", decision: "approve" }))).toBe(false);
    expect(countsFor(reg, d({ reviewer: "Cory", role: "owner", decision: "approve" }))).toBe(true);
  });
  it("two accepts from one registered reviewer count once", () => {
    expect(statusOf(base, [], [d({}), d({ at: "2026-11-07T13:00:00Z" }), d({ role: "owner", decision: "approve" })], reg)).not.toBe("approved");
  });
  it("one IEP accept plus the owner's approval is not approved", () => {
    expect(statusOf(base, [], [d({}), d({ role: "owner", decision: "approve" })], reg)).toBe("iep_accepted");
  });
  it("two registered accepts plus the owner's approval is approved", () => {
    expect(statusOf(base, [], [d({}), d({ reviewer: "Second" }), d({ role: "owner", decision: "approve" })], reg)).toBe("approved");
  });
  it("a fake second reviewer cannot complete an approval", () => {
    expect(statusOf(base, [], [d({}), d({ reviewer: "Made Up" }), d({ role: "owner", decision: "approve" })], reg)).toBe("iep_accepted");
  });
  it("without a registry the older behavior is unchanged", () => {
    expect(statusOf(base, [], [d({}), d({ reviewer: "Anyone" }), d({ role: "owner", decision: "approve" })])).toBe("approved");
  });
});

describe("the committed registry", () => {
  it("loads and lists only the owner for now, so nothing can be approved", () => {
    const r = loadReviewers();
    expect(r.reviewers.map((x) => x.name)).toEqual(["Cory"]);
    expect(statusOf(base, [], [d({}), d({ reviewer: "Second" }), d({ role: "owner", decision: "approve" })], r)).not.toBe("approved");
  });
});
