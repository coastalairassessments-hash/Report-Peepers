import { describe, it, expect } from "vitest";
import example from "../../../docs/spec/example_case.json" with { type: "json" };
import { buildApprovedView, renderText, viewHash, exportRelease } from "../src/release.js";
import { fingerprint } from "../src/revision.js";

const published = () => {
  const s = structuredClone(example) as any;
  Object.assign(s.release, { status: "published", human_review_status: "approved", reviewer_id: "REV-1", reviewer_scope: "Residential mold reports", published_at: "2026-11-03T00:00:00Z" });
  s.findings[0].human_approved = true; s.scope.confirmation_status = "confirmed";
  return s;
};

describe("approved view and export", () => {
  it("every finding title, question, and next step in the view appears in the text", () => {
    const s = published(); const v = buildApprovedView(s); const t = renderText(v);
    for (const f of v.findings) { expect(t).toContain(f.title); f.questions.forEach((q) => expect(t).toContain(q)); f.possible_next_steps.forEach((n) => expect(t).toContain(n)); }
    for (const q of v.leading_questions) expect(t).toContain(q);
    for (const l of v.coverage_limitations) expect(t).toContain(l);
  });

  it("the text states this is a document review, not an inspection or expert opinion", () => {
    const t = renderText(buildApprovedView(published()));
    expect(t).toContain("not an inspection of the building and not an expert opinion");
  });

  it("the document-review statement is in every export of a published release", () => {
    for (const edit of [(_: any) => {}, (x: any) => { x.findings[0].title = "Another title"; }, (x: any) => { x.release.overview = "Different overview."; }]) {
      const s = published(); edit(s);
      const ex = exportRelease(s, fingerprint(s));
      expect(ex.ok).toBe(true);
      expect(ex.ok && ex.text).toContain("not an inspection of the building and not an expert opinion");
    }
  });

  it("reviewer identity and approval scope appear in the exported text", () => {
    const s = published(); const ex = exportRelease(s, fingerprint(s));
    expect(ex.ok && ex.text).toContain("REV-1");
    expect(ex.ok && ex.text).toContain("Residential mold reports");
  });

  it("the reviewer conflict disclosure appears in the text, and a v0.1 release prints no empty line for it", () => {
    const s = published(); s.schema_version = "0.2"; s.release.reviewer_conflict_disclosure = "Reviewer has no financial interest in the inspector.";
    expect(renderText(buildApprovedView(s))).toContain("Reviewer conflict disclosure: Reviewer has no financial interest in the inspector.");
    expect(renderText(buildApprovedView(published()))).not.toContain("conflict disclosure");
  });

  it("each finding carries the report locations it rests on, and the text says which page", () => {
    const s = published(); const v = buildApprovedView(s);
    const ev = s.evidence.find((e: any) => e.id === s.findings[0].support_evidence_ids[0])!;
    expect(v.findings[0]!.sources).toEqual([{ role: "support", anchor: ev.anchor }]);
    expect(v.findings[0]!.sources[0]!.anchor).not.toBe(ev.anchor); // a copy, not a live reference
    expect(renderText(v)).toContain("Source (support): page 2");
  });

  it("TC053: a reviewer correction changes the view, the text, and the hash together", () => {
    const a = published(); const b = published();
    b.findings[0].explanation = "Corrected wording after reviewer fact check.";
    const va = buildApprovedView(a), vb = buildApprovedView(b);
    expect(renderText(vb)).not.toBe(renderText(va));
    expect(renderText(vb)).toContain("Corrected wording after reviewer fact check.");
    expect(viewHash(vb)).not.toBe(viewHash(va));
    const ex = exportRelease(b, fingerprint(b));
    expect(ex.ok && ex.text).toContain("Corrected wording after reviewer fact check.");
    expect(ex.ok && ex.hash).toBe(viewHash(vb));
  });

  it("a release that is not published is refused", () => {
    const s = published(); s.release.status = "draft";
    expect(exportRelease(s, fingerprint(s))).toEqual({ ok: false, reason: "not_published" });
  });

  it("a snapshot edited after publication is refused", () => {
    const s = published(); const fp = fingerprint(s);
    s.findings[0].title = "Edited after publish";
    expect(exportRelease(s, fp)).toEqual({ ok: false, reason: "snapshot_changed" });
  });

  it("a superseded or withdrawn release returns a notice, not an error or a silent copy", () => {
    const s = published(); s.release.status = "superseded";
    const r = exportRelease(s, "anything");
    expect(r).toMatchObject({ ok: false, reason: "superseded_notice" });
    expect(r.ok === false && r.notice).toContain("replaced by a newer release");
    s.release.status = "withdrawn";
    expect(exportRelease(s, "anything")).toMatchObject({ ok: false, reason: "withdrawn_notice" });
  });

  it("HTML and long lines are carried as plain text, unchanged", () => {
    const s = published(); const html = "<script>alert(1)</script> " + "x".repeat(5000);
    s.findings[0].explanation = html;
    const ex = exportRelease(s, fingerprint(s));
    expect(ex.ok && ex.text).toContain(html);
  });

  it("the same snapshot always gives the same hash", () => {
    const s = published();
    expect(viewHash(buildApprovedView(s))).toBe(viewHash(buildApprovedView(structuredClone(s))));
  });
});
