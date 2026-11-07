import { describe, it, expect } from "vitest";
import { loadLibrary } from "../../src/knowledge/library.js";
import { currentVersion, type Decision, type Edit } from "../../src/knowledge/status.js";
import { contentHash, isLiveBound, runFixtures } from "../../src/knowledge/fixtureRunner.js";
import type { ReviewerRegistry } from "../../src/knowledge/reviewers.js";

const base = loadLibrary().entries.find((e) => e.id === "IEP-K-001")!;
const reg: ReviewerRegistry = { reviewers: [{ name: "Cory", roles: ["iep", "owner"], active: true }, { name: "Second", roles: ["iep"], active: true }] };
const NOW = { rule_hash: "rules-A", engine_version: "e1" };
const dec = (v: string): Decision[] => ["Cory", "Second"].map((r) => ({ entry_id: base.id, version: v, reviewer: r, role: "iep", decision: "accept", reason_code: null, comment: "", answer: "", seconds: 1, at: "2026-11-07T12:00:00Z" } as Decision)).concat([{ entry_id: base.id, version: v, reviewer: "Cory", role: "owner", decision: "approve", reason_code: null, comment: "", answer: "", seconds: 1, at: "2026-11-07T12:01:00Z" }]);
const approved = dec(currentVersion(base, []));

describe("results are tied to the exact text, rules and engine", () => {
  it("runs every fixture and records what it was run against", async () => {
    const r = await runFixtures(base, NOW, () => true);
    expect(r).toHaveLength(4);
    expect(r.every((x) => x.content_hash === contentHash(base) && x.rule_hash === "rules-A" && x.engine_version === "e1")).toBe(true);
  });
  it("a thrown error is a fail, never a pass", async () => {
    const r = await runFixtures(base, NOW, () => { throw new Error("boom"); });
    expect(r.every((x) => !x.passed)).toBe(true);
  });
  it("approved with fresh passing results is live", async () => {
    expect(isLiveBound(base, [], approved, await runFixtures(base, NOW, () => true), NOW, reg)).toBe(true);
  });
  it("one failing fixture keeps it off", async () => {
    let n = 0;
    expect(isLiveBound(base, [], approved, await runFixtures(base, NOW, () => ++n !== 2), NOW, reg)).toBe(false);
  });
  it("results from before an edit no longer count", async () => {
    const results = await runFixtures(base, NOW, () => true);
    const edit: Edit = { entry_id: base.id, author: "Cory", at: "2026-11-07T14:00:00Z", note: "n", fields: { principle: "Changed." } };
    const afterEdit = dec(currentVersion(base, [edit]));
    expect(isLiveBound(base, [edit], afterEdit, results, NOW, reg)).toBe(false);
  });
  it("results for other rules or another engine do not count", async () => {
    const results = await runFixtures(base, NOW, () => true);
    expect(isLiveBound(base, [], approved, results, { ...NOW, rule_hash: "rules-B" }, reg)).toBe(false);
    expect(isLiveBound(base, [], approved, results, { ...NOW, engine_version: "e2" }, reg)).toBe(false);
  });
  it("not approved is not live however good the results", async () => {
    expect(isLiveBound(base, [], approved.slice(0, 1), await runFixtures(base, NOW, () => true), NOW, reg)).toBe(false);
  });
  it("the content hash ignores bookkeeping but not wording", () => {
    expect(contentHash({ ...base, status: "approved" })).toBe(contentHash(base));
    expect(contentHash({ ...base, principle: base.principle + "!" })).not.toBe(contentHash(base));
  });
});
