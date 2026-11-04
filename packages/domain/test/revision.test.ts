import { describe, it, expect } from "vitest";
import example from "../../../docs/spec/example_case.json" with { type: "json" };
import { checkRevision, classify, supersede, fingerprint } from "../src/revision.js";
import { checkIntegrity } from "../src/integrity.js";

const base = () => structuredClone(example) as any;

/** An approved, published first release. */
function published() {
  const s = base();
  Object.assign(s.release, { status: "published", human_review_status: "approved", reviewer_id: "REV-1", published_at: "2026-11-03T00:00:00Z" });
  s.findings[0].human_approved = true;
  s.scope.confirmation_status = "confirmed";
  return s;
}
/** A revision where new evidence EV-002 resolves F-001. */
function revision(prev: any) {
  const n = structuredClone(prev);
  n.case_revision_id = "REV-002";
  n.evidence.push({ ...structuredClone(prev.evidence[0]), id: "EV-002", origin: "correspondence", statement: "Inspector supplied the logger record.", anchor: { ...prev.evidence[0].anchor, extraction_method: "client_entry", pdf_page_index_1based: null, exact_text: "Logger record attached." } });
  n.findings[0].resolution_status = "resolved";
  n.findings[0].support_evidence_ids = ["EV-001", "EV-002"];
  Object.assign(n.release, { id: "REL-002", supersedes_release_id: prev.release.id, status: "draft", human_review_status: "pending", reviewer_id: null, published_at: null,
    changes: [{ finding_id: "F-001", change_type: "resolved", reason: "Logger record answers the duration question.", new_evidence_ids: ["EV-002"] }] });
  return n;
}
const codes = (p: any, n: any) => checkRevision(p, n).map((i) => i.code);

describe("revisions", () => {
  it("a proper revision with new evidence passes", () => {
    const p = published(), n = revision(p);
    expect(checkRevision(p, n)).toEqual([]);
    expect(checkIntegrity(n)).toEqual([]);
  });

  it("classifies unchanged, resolved, modified, retracted, new", () => {
    const p = published();
    const unchanged = structuredClone(p);
    expect(classify(p, unchanged)[0]!.type).toBe("unchanged");
    expect(classify(p, revision(p))[0]!.type).toBe("resolved");
    const mod = structuredClone(p); mod.findings[0].explanation = "Narrower wording after new context.";
    expect(classify(p, mod)[0]!.type).toBe("modified");
    const ret = structuredClone(p); ret.findings[0].resolution_status = "retracted";
    expect(classify(p, ret)[0]!.type).toBe("retracted");
    const added = structuredClone(p); added.findings.push({ ...structuredClone(p.findings[0]), id: "F-002" });
    expect(classify(p, added).map((c) => c.type)).toEqual(["unchanged", "new"]);
  });

  it("a finding cannot disappear silently", () => {
    const p = published(), n = revision(p); n.findings = [];
    expect(codes(p, n)).toContain("finding_dropped_silently");
  });

  it("earlier evidence cannot be edited or removed", () => {
    const p = published(), n = revision(p);
    n.evidence[0].statement = "Quietly reworded.";
    expect(codes(p, n)).toContain("evidence_rewritten");
    const m = revision(p); m.evidence = m.evidence.slice(1);
    expect(codes(p, m)).toContain("evidence_removed");
  });

  it("needs new ids and a link to the release it replaces", () => {
    const p = published(), n = revision(p);
    n.case_revision_id = p.case_revision_id; n.release.id = p.release.id; n.release.supersedes_release_id = null;
    const k = codes(p, n);
    for (const x of ["revision_id_reused", "release_id_reused", "missing_supersedes_link"]) expect(k).toContain(x);
  });

  it("every change needs a reason and new evidence responsible", () => {
    const p = published(), n = revision(p);
    n.release.changes[0].reason = " "; n.release.changes[0].new_evidence_ids = [];
    const k = codes(p, n);
    expect(k).toContain("change_without_reason"); expect(k).toContain("change_without_evidence");
    const m = revision(p); m.release.changes[0].new_evidence_ids = ["EV-001"];
    expect(codes(p, m)).toContain("evidence_not_new");
  });

  it("recorded change must match what the content shows", () => {
    const p = published(), n = revision(p); n.release.changes[0].change_type = "unchanged";
    expect(codes(p, n)).toContain("change_type_mismatch");
  });

  it("superseding returns a copy and leaves the published original untouched", () => {
    const p = published(); const before = fingerprint(p);
    const old = supersede(p);
    expect(old.release.status).toBe("superseded");
    expect(p.release.status).toBe("published");
    expect(fingerprint(p)).toBe(before);
  });

  it("fingerprint detects any edit to a published snapshot", () => {
    const p = published(); const f = fingerprint(p);
    expect(fingerprint(structuredClone(p))).toBe(f);
    p.findings[0].title = "Changed";
    expect(fingerprint(p)).not.toBe(f);
  });

  it("revision of an unpublished release is refused", () => {
    const p = base(), n = revision(p);
    expect(codes(p, n)).toContain("previous_not_published");
  });
});
