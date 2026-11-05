import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { extractDocument } from "../../src/ingest/extract.js";
import { releaseCase, reviewFingerprint, downloadRelease, type ReviewerDecision } from "../../src/pipeline/release.js";
import { reviewReady } from "./slice-fixtures.js";
import { alice, bob, rev1, sys } from "./helpers.js";
import type { TestServices } from "./helpers.js";

async function decision(svc: TestServices, id: string, over: Partial<ReviewerDecision> = {}): Promise<ReviewerDecision> {
  const rec = (await svc.repo.get(rev1, id))!;
  return {
    reviewer_id: "rev1", reviewer_scope: "Residential mold and moisture reports", reviewed_fingerprint: reviewFingerprint(rec.snapshot!),
    include_finding_ids: rec.snapshot!.findings.map((f) => f.id), pattern_tags: Object.fromEntries(rec.snapshot!.findings.map((f) => [f.id, "other"])),
    acknowledged_issue_ids: rec.issues.map((i) => i.id), conflict_disclosure: "None.", overview: "A document review of the supplied report.", ...over,
  };
}

describe("releaseCase", () => {
  it("a full decision releases: approved drafts, a verified marked-up PDF, the text, and one anonymous record", async () => {
    const { svc, id } = await reviewReady();
    const r = await releaseCase(svc, id, await decision(svc, id));
    expect(r).toMatchObject({ ok: true, record_saved: true });
    const rec = (await svc.repo.get(sys, id))!;
    expect(rec.state).toBe("released");
    expect(rec.snapshot!.release).toMatchObject({ status: "published", human_review_status: "approved", reviewer_id: "rev1", reviewer_conflict_disclosure: "None." });
    expect(rec.snapshot!.findings.every((f: any) => f.human_approved)).toBe(true);
    expect(rec.published_fingerprint).toBeTruthy();
    expect(createHash("sha256").update(rec.released!.markup_pdf).digest("hex")).toBe(rec.released!.hashes.output_sha256);
    const pdf = await extractDocument(rec.released!.markup_pdf);
    expect(pdf.page_count).toBeGreaterThan(1); // the source page plus a summary
    const records = await svc.records.all();
    expect(records).toHaveLength(1);
    expect(records[0]!.record_id).toBe(rec.released!.record_id);
    expect(JSON.stringify(records[0])).not.toContain(id);
  });

  it("someone who is not the assigned reviewer is refused, and so is a customer", async () => {
    const { svc, id } = await reviewReady();
    const d = await decision(svc, id);
    expect(await releaseCase(svc, id, { ...d, reviewer_id: "rev2" })).toMatchObject({ ok: false, reason: "not_found" });
    expect((await svc.repo.get(sys, id))!.state).toBe("awaiting_reviewer");
    expect(await svc.repo.get(bob, id)).toBeNull();
    expect(await releaseCase(svc, id, { ...d, reviewer_id: "alice" })).toMatchObject({ ok: false });
    expect((await svc.repo.get(sys, id))!.state).toBe("awaiting_reviewer");
  });

  it("every held-back item must be acknowledged", async () => {
    const { svc, id } = await reviewReady({ pages: [(await import("./slice-fixtures.js")).P1, { puts: [] }] });
    const rec = (await svc.repo.get(sys, id))!;
    expect(rec.issues.length).toBeGreaterThan(0);
    const d = await decision(svc, id, { acknowledged_issue_ids: [] });
    const r = await releaseCase(svc, id, d);
    expect(r).toMatchObject({ ok: false, reason: "unacknowledged_issues" });
    expect((r as any).missing).toEqual(rec.issues.map((i) => i.id));
    expect((await svc.repo.get(sys, id))!.state).toBe("awaiting_reviewer");
    expect(await svc.records.all()).toHaveLength(0);
  });

  it("partial release states its coverage limits in the text", async () => {
    const { svc, id } = await reviewReady({ pages: [(await import("./slice-fixtures.js")).P1, { puts: [] }] });
    expect(await releaseCase(svc, id, await decision(svc, id))).toMatchObject({ ok: true });
    expect((await svc.repo.get(sys, id))!.released!.text).toContain("Page 2 has no readable text");
  });

  it("an edit that breaks a wording rule is refused and nothing changes", async () => {
    const { svc, id } = await reviewReady();
    const fid = (await svc.repo.get(sys, id))!.snapshot!.findings[0]!.id;
    const r = await releaseCase(svc, id, await decision(svc, id, { edits: [{ finding_id: fid, title: "This proves the inspector was wrong" }] }));
    expect(r).toMatchObject({ ok: false, reason: "edit_breaks_rule" });
    expect((await svc.repo.get(sys, id))!.state).toBe("awaiting_reviewer");
  });

  it("a clean edit is applied and recorded as reviewer-changed", async () => {
    const { svc, id } = await reviewReady();
    const fid = (await svc.repo.get(sys, id))!.snapshot!.findings[0]!.id;
    const r = await releaseCase(svc, id, await decision(svc, id, { edits: [{ finding_id: fid, title: "Basis for the stated cause" }] }));
    expect(r.ok).toBe(true);
    expect((await svc.repo.get(sys, id))!.snapshot!.findings[0]!.title).toBe("Basis for the stated cause");
    expect((await svc.records.all())[0]!.items[0]!.reviewer_changed).toBe(true);
  });

  it("a stale decision is refused: the draft changed after it was reviewed", async () => {
    const { svc, id } = await reviewReady();
    const d = await decision(svc, id, { reviewed_fingerprint: "0".repeat(64) });
    expect(await releaseCase(svc, id, d)).toMatchObject({ ok: false, reason: "stale_review" });
  });

  it("the conflict disclosure, scope, overview, and at least one finding are required", async () => {
    const { svc, id } = await reviewReady();
    expect(await releaseCase(svc, id, await decision(svc, id, { conflict_disclosure: "  " }))).toMatchObject({ reason: "conflict_disclosure_required" });
    expect(await releaseCase(svc, id, await decision(svc, id, { reviewer_scope: "" }))).toMatchObject({ reason: "reviewer_scope_required" });
    expect(await releaseCase(svc, id, await decision(svc, id, { overview: "" }))).toMatchObject({ reason: "overview_required" });
    expect(await releaseCase(svc, id, await decision(svc, id, { include_finding_ids: [] }))).toMatchObject({ reason: "nothing_included" });
    expect(await releaseCase(svc, id, await decision(svc, id, { include_finding_ids: ["F-NOPE"] }))).toMatchObject({ reason: "unknown_finding" });
  });

  it("entitlement is rechecked at release", async () => {
    const { svc, id } = await reviewReady();
    svc.entitled.value = false;
    const r = await releaseCase(svc, id, await decision(svc, id));
    expect(r.ok).toBe(false);
    expect((await svc.repo.get(sys, id))!.state).toBe("awaiting_reviewer");
    expect(await svc.records.all()).toHaveLength(0);
  });

  it("a released case cannot be released twice or changed", async () => {
    const { svc, id } = await reviewReady();
    const d = await decision(svc, id);
    expect((await releaseCase(svc, id, d)).ok).toBe(true);
    expect(await releaseCase(svc, id, d)).toMatchObject({ ok: false, reason: "wrong_state" });
    const rec = (await svc.repo.get(sys, id))!;
    await expect(svc.repo.save(sys, rec)).rejects.toThrow(/read-only/);
    expect(await svc.records.all()).toHaveLength(1);
  });
});

describe("downloadRelease", () => {
  it("the owner and reviewer can download; a stranger gets nothing; nothing before release", async () => {
    const { svc, id } = await reviewReady();
    expect(await downloadRelease(svc, alice, id)).toMatchObject({ ok: false, reason: "not_released" });
    await releaseCase(svc, id, await decision(svc, id));
    expect((await downloadRelease(svc, alice, id)).ok).toBe(true);
    expect((await downloadRelease(svc, rev1, id)).ok).toBe(true);
    expect(await downloadRelease(svc, bob, id)).toMatchObject({ ok: false, reason: "not_found" });
  });

  it("an edit after release makes the download fail", async () => {
    const { svc, id } = await reviewReady();
    await releaseCase(svc, id, await decision(svc, id));
    const rec = (await svc.repo.get(sys, id))!;
    rec.snapshot!.findings[0]!.title = "Changed after release";
    // the repository refuses the change, so tamper with a copy the way a bad store would
    const tampered = { ...(await svc.repo.get(sys, id))!, snapshot: rec.snapshot };
    const svc2 = { ...svc, repo: { ...svc.repo, get: async () => tampered } } as typeof svc;
    expect(await downloadRelease(svc2, alice, id)).toMatchObject({ ok: false, reason: "snapshot_changed" });
  });
});
