import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import example from "../../../../docs/spec/example_case.json" with { type: "json" };
import { extractDocument } from "../../src/ingest/extract.js";
import { planMarkup, loadMarkupConfig, type MarkupPlan } from "../../src/render/plan.js";
import { renderMarkup } from "../../src/render/renderMarkup.js";
import { verifyMarkup } from "../../src/render/verifyMarkup.js";
import { exportMarkup, markupText } from "../../src/render/exportMarkup.js";
import { fingerprint } from "../../src/revision.js";
import { DOC, finding, viewOf, read, src, dense } from "./helpers.js";

const cfg = loadMarkupConfig();

async function good() {
  const { bytes, doc } = await read([dense(12)]);
  const fs = [finding({ id: "F-1", sources: [src(doc, "Line 3 of the assessment")] }), finding({ id: "F-2", title: "Photos not dated", questions: ["Can dated photos be supplied?"], decision_relevance: "contextual", finding_type: "documentation_limitation", sources: [src(doc, "Line 8 of the assessment")] })];
  const plan = planMarkup(viewOf(fs, ["What was the duration based on?"]), doc, DOC, cfg);
  const r = await renderMarkup(bytes, plan);
  if (!r.ok) throw new Error(r.diagnostics);
  return { bytes, doc, plan, pdf: r.pdf, out: await extractDocument(r.pdf) };
}
const codes = (r: ReturnType<typeof verifyMarkup>) => (r.ok ? [] : r.problems.map((p) => p.code));

describe("verifyMarkup", () => {
  it("passes a good run", async () => {
    const g = await good();
    const v = verifyMarkup(g.doc, g.out, g.plan);
    expect(v.ok, JSON.stringify(v)).toBe(true);
  });

  it("fails when a note has been moved onto the report's text", async () => {
    const g = await good();
    const moved = structuredClone(g.plan) as MarkupPlan;
    const n = moved.pages[0]!.notes.find((x) => x.number === 1)!;
    const span = g.doc.pages[0]!.spans[5]!;
    const w = n.box[2] - n.box[0], h = n.box[3] - n.box[1];
    n.box = [span.origin[0], span.origin[1] - h, span.origin[0] + w, span.origin[1]];
    expect(codes(verifyMarkup(g.doc, g.out, moved))).toEqual(expect.arrayContaining(["note_text_mismatch"]));
  });

  it("fails when the report's own text was altered in the output", async () => {
    const g = await good();
    const altered = await read([{ puts: dense(12).puts!.map((p, i) => (i === 4 ? { ...p, text: p.text.replace("assessment", "assessmen7") } : p)) }]);
    const r = await renderMarkup(altered.bytes, g.plan);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(codes(verifyMarkup(g.doc, await extractDocument(r.pdf), g.plan))).toContain("source_text_changed");
  });

  it("fails when extra text appears on a report page", async () => {
    const g = await good();
    const sneaky = structuredClone(g.plan) as MarkupPlan;
    sneaky.pages[0]!.notes.push({ number: 9, finding_id: null, text: "Added after the fact", box: [0.78, 0.6, 0.98, 0.64] });
    const r = await renderMarkup(g.bytes, sneaky);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // the reader of the file sees an extra note that the approved plan never had
    expect(codes(verifyMarkup(g.doc, await extractDocument(r.pdf), g.plan))).toContain("unplanned_text");
  });

  it("fails on wording the findings would not be allowed to use, even when the file was drawn from it", async () => {
    const g = await good();
    const bad = structuredClone(g.plan) as MarkupPlan;
    bad.pages[0]!.notes.find((x) => x.number === 1)!.text = "Inspector score of 3";
    const r = await renderMarkup(g.bytes, bad);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(codes(verifyMarkup(g.doc, await extractDocument(r.pdf), bad))).toContain("banned_wording");
  });

  it("fails when the closing pages lack an item the plan holds", async () => {
    const g = await good();
    const more = structuredClone(g.plan) as MarkupPlan;
    more.summary.groups[0]!.items.push({ number: 7, title: "An item that was never drawn", page: 1, label: null, strength: "limited", next_step: null });
    expect(codes(verifyMarkup(g.doc, g.out, more))).toContain("summary_content_missing");
  });

  it("fails when the output has fewer pages than the plan", async () => {
    const g = await good();
    const longer = structuredClone(g.plan) as MarkupPlan;
    longer.pages.push({ ...longer.pages[0]!, index: 2 });
    expect(codes(verifyMarkup(g.doc, g.out, longer))).toContain("page_count");
  });
});

describe("exportMarkup", () => {
  async function released() {
    const { bytes, doc } = await read([dense(14)]);
    const s = structuredClone(example) as any;
    Object.assign(s.release, { status: "published", human_review_status: "approved", reviewer_id: "REV-1", reviewer_scope: "Residential mold reports", published_at: "2026-11-03T00:00:00Z" });
    s.findings[0].human_approved = true; s.scope.confirmation_status = "confirmed";
    s.documents[0].content_sha256 = createHash("sha256").update(bytes).digest("hex");
    s.evidence.forEach((e: any, i: number) => { e.anchor = src(doc, `Line ${3 + i * 4} of the assessment`).anchor; });
    return { s, bytes, fp: fingerprint(s) };
  }

  it("a published, unchanged release gives the marked-up PDF, a matching text version, and hashes", async () => {
    const { s, bytes, fp } = await released();
    const r = await exportMarkup(s, fp, bytes, "DOC-001-v1");
    expect(r.ok, r.ok ? "" : JSON.stringify(r)).toBe(true);
    if (!r.ok) return;
    expect(r.hashes.source_sha256).toBe(s.documents[0].content_sha256);
    for (const h of Object.values(r.hashes)) expect(h).toMatch(/^[0-9a-f]{64}$/);
    for (const p of r.plan.pages) for (const n of p.notes) { expect(r.text).toContain(n.text); if (n.number !== null) expect(r.text).toContain(`${n.number}. (page ${p.index}) ${n.text}`); }
    expect(r.text).toBe(markupText(r.plan));
    expect(r.text).toContain("not an inspection of the building and not an expert opinion");
    expect(r.pdf.length).toBeGreaterThan(1000);
  });

  it("refuses a release that is not published, or that changed after publication, and returns no files", async () => {
    const a = await released(); a.s.release.status = "draft";
    const ra = await exportMarkup(a.s, fingerprint(a.s), a.bytes, "DOC-001-v1");
    expect(ra).toEqual({ ok: false, reason: "not_published" });
    const b = await released(); b.s.release.overview = "Edited after publication.";
    const rb = await exportMarkup(b.s, b.fp, b.bytes, "DOC-001-v1");
    expect(rb).toEqual({ ok: false, reason: "snapshot_changed" });
  });

  it("refuses a source file that is not the one the release was written against", async () => {
    const { s, fp } = await released();
    const other = (await read([dense(14, "Other")])).bytes;
    expect((await exportMarkup(s, fp, other, "DOC-001-v1")).ok).toBe(false);
    const r = await exportMarkup(s, fp, other, "DOC-001-v1");
    expect(!r.ok && r.reason).toBe("source_mismatch");
  });

  it("refuses a document the release does not list", async () => {
    const { s, bytes, fp } = await released();
    const r = await exportMarkup(s, fp, bytes, "DOC-999-v1");
    expect(!r.ok && r.reason).toBe("unknown_document");
  });
});
