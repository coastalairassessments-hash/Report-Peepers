import { describe, it, expect } from "vitest";
import { customerViewOf, readReleasedBySession } from "../../src/pipeline/customerView.js";
import { releaseAutomatically } from "../../src/pipeline/autoRelease.js";
import { InMemoryGrantStore, createAccess, loadAccessConfig } from "../../src/access/access.js";
import { reviewReady } from "./slice-fixtures.js";
import { sys } from "./helpers.js";
import { createHash } from "node:crypto";

const mkAccess = (now: () => string) => createAccess({ now, randomBytes: (n) => new Uint8Array(n).map((_, i) => (i * 5 + 3) % 256), hash: (s) => createHash("sha256").update(s).digest("hex") }, new InMemoryGrantStore(), loadAccessConfig());

describe("what a customer may see", () => {
  it("before release: no draft review, issues, inspection review, reviewer or fingerprint", async () => {
    const { svc, id } = await reviewReady();
    const rec = (await svc.repo.get(sys, id))!;
    expect(rec.snapshot).not.toBeNull();
    const v = customerViewOf(rec);
    expect(v.state).toBe("awaiting_reviewer");
    expect(v.review).toBeNull();
    const json = JSON.stringify(v);
    for (const k of ["snapshot", "issues", "inspection_review", "reviewer_id", "published_fingerprint", "findings", "markup_pdf"]) expect(json).not.toContain(`"${k}"`);
  });

  it("after release: the review text and PDF are available, and still no internals", async () => {
    const { svc, id } = await reviewReady();
    await releaseAutomatically(svc, id);
    const v = customerViewOf((await svc.repo.get(sys, id))!);
    expect(v.state).toBe("released");
    expect(v.review!.pdf.length).toBeGreaterThan(1000);
    expect(v.review!.text.length).toBeGreaterThan(50);
    expect(v.review!.delivered_at).toMatch(/^2026/);
    const json = JSON.stringify({ ...v, review: { ...v.review, pdf: undefined } });
    for (const k of ["snapshot", "issues", "reviewer_id", "published_fingerprint"]) expect(json).not.toContain(`"${k}"`);
  });

  it("a session reads its own released case and nothing else", async () => {
    const { svc, id } = await reviewReady();
    await releaseAutomatically(svc, id);
    const access = mkAccess(svc.now);
    const { token } = await access.issueLink(id, "pat@example.com");
    const sent = await access.requestCode(token); if (!sent.ok) throw new Error("x");
    const v = await access.verifyCode(token, sent.code); if (!v.ok) throw new Error("x");
    const ok = await readReleasedBySession(svc, access, v.session);
    expect(ok.ok).toBe(true);
    const other = await access.issueLink("CASE-OTHER", "b@example.com");
    const s2 = await access.requestCode(other.token); if (!s2.ok) throw new Error("x");
    const v2 = await access.verifyCode(other.token, s2.code); if (!v2.ok) throw new Error("x");
    expect(await readReleasedBySession(svc, access, v2.session)).toEqual({ ok: false });
    expect(await readReleasedBySession(svc, access, "bad-session")).toEqual({ ok: false });
  });

  it("a session for a case that is not released yet gets nothing", async () => {
    const { svc, id } = await reviewReady();
    const access = mkAccess(svc.now);
    const { token } = await access.issueLink(id, "pat@example.com");
    const sent = await access.requestCode(token); if (!sent.ok) throw new Error("x");
    const v = await access.verifyCode(token, sent.code); if (!v.ok) throw new Error("x");
    expect(await readReleasedBySession(svc, access, v.session)).toEqual({ ok: false });
  });
});
