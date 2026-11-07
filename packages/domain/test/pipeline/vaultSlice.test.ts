import { describe, it, expect } from "vitest";
import { run, THIN, thinScript } from "./inspection-fixtures.js";
import { loadLibrary } from "../../src/knowledge/library.js";
import { currentVersion, type Decision } from "../../src/knowledge/status.js";
import { runFixtures } from "../../src/knowledge/fixtureRunner.js";
import { buildPack, type Pack } from "../../src/knowledge/pack.js";
import { wordingProblems } from "../../src/integrity.js";

// One synthetic claim, end to end: approved entry -> pack -> report text -> question with the report's own quote.
const base = loadLibrary().entries.find((e) => e.id === "IEP-K-001")!;
const reg = { reviewers: [{ name: "Cory", roles: ["iep", "owner"] as ("iep" | "owner")[], active: true }, { name: "Second", roles: ["iep"] as ("iep" | "owner")[], active: true }] };
const NOW = { rule_hash: "rules-A", engine_version: "e1" };
const v = currentVersion(base, []);
const dec = (r: string, role: "iep" | "owner", decision: "accept" | "approve"): Decision => ({ entry_id: base.id, version: v, reviewer: r, role, decision, reason_code: null, comment: "", answer: "", seconds: 1, at: "2026-11-07T12:00:00Z" });
const source = { id: "SRC-SYN-1", publisher: "Synthetic Publisher", title: "Synthetic", edition: "1", official_url: "https://example.org", authority_type: "guidance", ai_use_status: "authorized", permission_record_id: "PERM-SYN", allowed_uses: ["metadata", "output_reference"], effective_context: "", reviewed_at: "2026-11-07" } as never;
const item = { claim_ids: ["CLM-SYN-7"], source_ids: ["SRC-SYN-1"], topic: "Surface wetness", question: "The report calls the material wet without showing a reading. Ask: What reading shows that?", why: "A wet or dry call is easier to follow with the reading shown.", detect: { trigger: "elevated water content", support: "surface reading" } };
async function makePack(): Promise<Pack> {
  const { pack, excluded } = buildPack({ candidates: [{ entry: base, edits: [], decisions: [dec("Cory", "iep", "accept"), dec("Second", "iep", "accept"), dec("Cory", "owner", "approve")], results: await runFixtures(base, NOW, () => true), item }], sources: [source], registry: reg, now: NOW, pack_version: "syn-1" });
  expect(excluded).toEqual([]);
  return pack;
}
const questionsOf = (rec: { inspection_review?: { questions: { kind: string }[] } | null }) => rec.inspection_review!.questions;

describe("a knowledge pack through the real pipeline", () => {
  it("off: nothing changes, and no pack is recorded", async () => {
    const plain = await run(THIN, thinScript);
    const pack = await makePack();
    const off = await run(THIN, thinScript, (s) => { s.pack = pack; s.packMode = "off"; });
    expect(JSON.stringify(off.rec.inspection_review)).toBe(JSON.stringify(plain.rec.inspection_review));
    expect(off.rec.pack_hash ?? null).toBeNull();
  });
  it("shadow: the customer-facing review is identical; the log shows what it would have asked", async () => {
    const plain = await run(THIN, thinScript);
    const pack = await makePack();
    const sh = await run(THIN, thinScript, (s) => { s.pack = pack; s.packMode = "shadow"; });
    expect(JSON.stringify(sh.rec.inspection_review)).toBe(JSON.stringify(plain.rec.inspection_review));
    expect(sh.rec.pack_hash).toBe(pack.hash);
    expect(sh.rec.pack_shadow!.questions.map((q) => q.id)).toEqual(["IEP-K-001"]);
  });
  it("on: the question joins the review with the report's own words quoted, and passes the wording rules", async () => {
    const pack = await makePack();
    const on = await run(THIN, thinScript, (s) => { s.pack = pack; s.packMode = "on"; });
    const q = questionsOf(on.rec).find((x) => x.kind === "pack") as unknown as { text: string; why: string; quotes: { page: number; text: string }[] };
    expect(q.quotes[0]!.text.toLowerCase()).toContain("elevated water content");
    expect([...wordingProblems(q.text), ...wordingProblems(q.why)]).toEqual([]);
    expect(on.rec.pack_hash).toBe(pack.hash);
    expect(JSON.stringify(on.rec)).not.toMatch(/SRC-SYN|CLM-SYN|PERM-SYN/);
  });
  it("a changed pack is ignored, recorded as an issue, and nothing is partly used", async () => {
    const pack = await makePack();
    const bad = { ...pack, items: [{ ...pack.items[0]!, question: "Changed after the build. Ask: What?" }] };
    const r = await run(THIN, thinScript, (s) => { s.pack = bad; s.packMode = "on"; });
    expect(questionsOf(r.rec).some((x) => x.kind === "pack")).toBe(false);
    expect(r.rec.issues.some((i) => i.code === "pack_unusable")).toBe(true);
    expect(r.rec.pack_hash ?? null).toBeNull();
  });
  it("the source ids and claim ids are never in the text export", async () => {
    const pack = await makePack();
    const on = await run(THIN, thinScript, (s) => { s.pack = pack; s.packMode = "on"; });
    expect(JSON.stringify(on.rec.inspection_review)).not.toMatch(/SRC-|CLM-/);
  });
});
