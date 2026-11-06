import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { extractDocument } from "../../src/ingest/extract.js";
import { releaseAutomatically } from "../../src/pipeline/autoRelease.js";
import { downloadRelease } from "../../src/pipeline/release.js";
import { reviewReady, P1 } from "./slice-fixtures.js";
import { alice, sys } from "./helpers.js";
import { run, THIN, thinScript, COMPLETE, completeScript } from "./inspection-fixtures.js";

describe("releaseAutomatically (ADR-006)", () => {
  it("releases with no person: automatic status, a verified marked-up PDF, the text, and one anonymous record", async () => {
    const { svc, id } = await reviewReady();
    const r = await releaseAutomatically(svc, id);
    expect(r).toMatchObject({ ok: true, record_saved: true, excluded_finding_ids: [] });
    const rec = (await svc.repo.get(sys, id))!;
    expect(rec.state).toBe("released");
    expect(rec.snapshot!.schema_version).toBe("0.3");
    expect(rec.snapshot!.release).toMatchObject({ status: "published", human_review_status: "automatic", release_mode: "automatic", reviewer_id: "automatic" });
    expect(rec.snapshot!.findings.every((f: any) => f.human_approved === false)).toBe(true);
    expect(createHash("sha256").update(rec.released!.markup_pdf).digest("hex")).toBe(rec.released!.hashes.output_sha256);
    expect((await extractDocument(rec.released!.markup_pdf)).page_count).toBeGreaterThan(1);
    const records = await svc.records.all();
    expect(records).toHaveLength(1);
    expect(JSON.stringify(records[0])).not.toContain(id);
    expect(await downloadRelease(svc, alice, id)).toMatchObject({ ok: true });
  });

  it("a failing gate releases nothing and parks the case in needs_attention, with the reason on record", async () => {
    const { svc, id } = await reviewReady();
    svc.entitled.value = false;
    const r = await releaseAutomatically(svc, id);
    expect(r).toMatchObject({ ok: false, reason: "needs_attention" });
    expect((r as any).failed_gates.map((g: any) => g.gate)).toEqual(["entitlement"]);
    const rec = (await svc.repo.get(sys, id))!;
    expect(rec.state).toBe("needs_attention");
    expect(rec.released).toBeNull();
    expect(rec.issues.some((i) => i.code === "auto_release_entitlement")).toBe(true);
    expect(await svc.records.all()).toHaveLength(0);
  });

  it("once the problem is fixed the same case can be released", async () => {
    const { svc, id } = await reviewReady();
    svc.entitled.value = false;
    await releaseAutomatically(svc, id);
    svc.entitled.value = true;
    expect(await releaseAutomatically(svc, id)).toMatchObject({ ok: true });
    const rec = (await svc.repo.get(sys, id))!;
    expect(rec.state).toBe("released");
    expect(rec.issues.some((i) => i.code.startsWith("auto_release_"))).toBe(false);
  });

  it("accusing text that reached a draft is stopped before release", async () => {
    const { svc, id } = await reviewReady();
    const rec = (await svc.repo.get(sys, id))!;
    rec.snapshot!.findings[0]!.explanation = "The inspector was negligent and this report fails inspection.";
    await svc.repo.save(sys, rec);
    const r = await releaseAutomatically(svc, id);
    expect(r).toMatchObject({ ok: false, reason: "needs_attention" });
    expect((r as any).failed_gates.map((g: any) => g.gate)).toEqual(expect.arrayContaining(["wording"]));
    expect((await svc.repo.get(sys, id))!.released).toBeNull();
  });

  it("a quote that is not on the page word for word is stopped", async () => {
    const { svc, id } = await reviewReady();
    const rec = (await svc.repo.get(sys, id))!;
    rec.snapshot!.evidence[0]!.anchor.exact_text = "words that are not anywhere on the page";
    await svc.repo.save(sys, rec);
    const r = await releaseAutomatically(svc, id);
    expect((r as any).failed_gates.map((g: any) => g.gate)).toContain("quotes_verbatim");
    expect((await svc.repo.get(sys, id))!.state).toBe("needs_attention");
  });

  it("a stored file that no longer matches what was received is stopped", async () => {
    const { svc, id } = await reviewReady();
    const rec = (await svc.repo.get(sys, id))!;
    rec.source!.sha256 = "0".repeat(64);
    await svc.repo.save(sys, rec);
    const r = await releaseAutomatically(svc, id);
    expect((r as any).failed_gates.map((g: any) => g.gate)).toContain("source_intact");
  });

  it("a finding that needs a person is left out, not released", async () => {
    const { svc, id } = await reviewReady();
    const rec = (await svc.repo.get(sys, id))!;
    const f = rec.snapshot!.findings[0]!;
    f.finding_type = "verified_reference_departure" as never;
    await svc.repo.save(sys, rec);
    const r = await releaseAutomatically(svc, id);
    expect(r.ok ? r.excluded_finding_ids : []).toContain(f.id);
    const after = (await svc.repo.get(sys, id))!;
    if (after.state === "released") expect(after.snapshot!.findings.map((x) => x.id)).not.toContain(f.id);
  });

  it("refuses a case that is not waiting for release, and a case that does not exist", async () => {
    const { svc, id } = await reviewReady();
    await releaseAutomatically(svc, id);
    expect(await releaseAutomatically(svc, id)).toMatchObject({ ok: false, reason: "wrong_state" });
    expect(await releaseAutomatically(svc, "CASE-NONE")).toMatchObject({ ok: false, reason: "not_found" });
  });

  it("a partly unreadable report still releases, and says which pages were not reviewed", async () => {
    const { svc, id } = await reviewReady({ pages: [P1, { puts: [] }] });
    const r = await releaseAutomatically(svc, id);
    expect(r).toMatchObject({ ok: true });
    const rec = (await svc.repo.get(sys, id))!;
    expect(rec.snapshot!.release.coverage_limitations.join(" ")).toMatch(/Page 2/);
  });

  it("the released PDF carries the review pages: what is done well, the questions, and what could not be checked", async () => {
    const { svc, id, rec } = await run(THIN, thinScript);
    await svc.repo.save(sys, rec);
    const { assignReviewer } = await import("../../src/pipeline/analyze.js");
    await assignReviewer(svc, id, "rev1");
    const r = await releaseAutomatically(svc, id);
    expect(r).toMatchObject({ ok: true });
    const out = (await svc.repo.get(sys, id))!;
    const text = (await extractDocument(out.released!.markup_pdf)).pages.map((p) => p.text).join("\n");
    expect(text).toContain("More questions you may want to ask the inspector");
    for (const q of out.inspection_review!.questions.slice(0, 3)) expect(text.replace(/\s+/g, "")).toContain(q.text.replace(/\s+/g, "").slice(0, 40));
    expect(out.released!.text).toContain("More questions you may want to ask the inspector");
  });

  it("a complete report gets its good points listed, with the heading", async () => {
    const { svc, id, rec } = await run(COMPLETE, completeScript);
    expect(rec.inspection_review!.done_well.length).toBeGreaterThan(0);
    const r = await releaseAutomatically(svc, id);
    expect(r).toMatchObject({ ok: true });
    const out = (await svc.repo.get(sys, id))!;
    expect(out.released!.text).toContain("Done correctly, as customary practice calls for");
  });
});
