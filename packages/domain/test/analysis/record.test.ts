import { describe, it, expect } from "vitest";
import fc from "fast-check";
import example from "../../../../docs/spec/example_case.json" with { type: "json" };
import { buildApprovedView, type ApprovedView } from "../../src/release.js";
import { buildSummaryRecord, factsFrom, type ReviewerTags } from "../../src/analysis/record.js";
import { loadPatterns } from "../../src/analysis/patterns.js";
import { finding, viewOf } from "../render/helpers.js";

const patterns = loadPatterns();
const facts = { release_month: "2026-11", service_type: "limited_assessment", document_kinds: ["laboratory", "assessment"] };
const tags: ReviewerTags = { pattern_codes: { "F-1": "duration_without_basis", "F-2": "photos_missing_or_undated" } };
const approved = (v: ApprovedView): ApprovedView => ({ ...v, human_review: { ...v.human_review, status: "approved" } });
const two = () => approved(viewOf([finding({ id: "F-1" }), finding({ id: "F-2", title: "Photos not dated", questions: ["Can dated photos be supplied?"], possible_next_steps: ["Ask for dated photos."], decision_relevance: "contextual", finding_type: "documentation_limitation" })]));
const build = (v = two(), t = tags, names: string[] = []) => { const r = buildSummaryRecord(v, facts, t, names, patterns, () => "rec-1"); if (!r.ok) throw new Error(r.reason); return r; };

describe("buildSummaryRecord", () => {
  it("builds one record with only the named fields", () => {
    const { record } = build();
    expect(Object.keys(record).sort()).toEqual(["document_kinds", "items", "record_id", "release_month", "service_type"]);
    for (const i of record.items) expect(Object.keys(i).sort()).toEqual(["decision_relevance", "evidence_strength", "finding_type", "next_step", "pattern_code", "question", "resolved_later", "reviewer_changed", "title", "wording_withheld"]);
    expect(record.items.map((i) => i.pattern_code).sort()).toEqual(["duration_without_basis", "photos_missing_or_undated"]);
    expect(record.items.find((i) => i.pattern_code === "duration_without_basis")).toMatchObject({ title: "Basis for the duration statement", question: "What was the duration based on?", next_step: "Ask for the supporting history.", wording_withheld: false });
  });

  it("only a published, approved review makes a record", () => {
    const draft = { ...two(), status: "draft" as const };
    expect(buildSummaryRecord(draft, facts, tags, [], patterns)).toEqual({ ok: false, reason: "not_published" });
    const unapproved = { ...two(), human_review: { ...two().human_review, status: "not_reviewed" as const } };
    expect(buildSummaryRecord(unapproved, facts, tags, [], patterns)).toEqual({ ok: false, reason: "not_approved" });
    expect(buildSummaryRecord(two(), { ...facts, release_month: "2026-11-03" }, tags, [], patterns)).toEqual({ ok: false, reason: "bad_facts" });
  });

  it("a title with a listed name, email, phone, or address loses its wording and keeps its codes, and the reviewer is told", () => {
    const bad = ["Dana Whitfield did not log the readings", "Ask jane@example.com", "Call 772-555-0142", "The 12 Palm Tree Lane records"];
    for (const title of bad) {
      const v = approved(viewOf([finding({ id: "F-1", title })]));
      const r = build(v, tags, ["Dana Whitfield"]);
      expect(r.record.items[0]).toMatchObject({ title: null, question: null, next_step: null, wording_withheld: true, pattern_code: "duration_without_basis", finding_type: "clarification_needed" });
      expect(r.notices).toContainEqual(expect.objectContaining({ finding_id: "F-1", kind: "wording_withheld" }));
      expect(JSON.stringify(r.record)).not.toMatch(/Whitfield|jane@|555|Palm Tree|F-1/);
    }
  });

  it("a question or next step with a name also withholds all of that item's wording", () => {
    const v = approved(viewOf([finding({ id: "F-1", questions: ["Did Whitfield measure it?"] })]));
    expect(build(v, tags, ["Whitfield"]).record.items[0]).toMatchObject({ title: null, question: null, next_step: null });
  });

  it("a missing or unknown tag becomes 'other' and is listed; supported items need no code", () => {
    const v = approved(viewOf([finding({ id: "F-1" }), finding({ id: "F-2" }), finding({ id: "F-3", finding_type: "supported_reasoning" })]));
    const r = build(v, { pattern_codes: { "F-2": "not_a_code" } });
    expect(r.record.items.filter((i) => i.pattern_code === "other")).toHaveLength(2);
    expect(r.record.items.find((i) => i.finding_type === "supported_reasoning")!.pattern_code).toBeNull();
    expect(r.notices.map((n) => `${n.finding_id}:${n.kind}`).sort()).toEqual(["F-1:missing_tag", "F-2:unknown_code"]);
  });

  it("carries the reviewer's changed and resolved flags", () => {
    const r = build(two(), { ...tags, reviewer_changed: ["F-1"], resolved_later: ["F-2"] });
    expect(r.record.items.find((i) => i.pattern_code === "duration_without_basis")).toMatchObject({ reviewer_changed: true, resolved_later: false });
    expect(r.record.items.find((i) => i.pattern_code === "photos_missing_or_undated")).toMatchObject({ reviewer_changed: false, resolved_later: true });
  });

  it("the record id is random: not derived from the case, and different every time", () => {
    const a = buildSummaryRecord(two(), facts, tags, [], patterns), b = buildSummaryRecord(two(), facts, tags, [], patterns);
    if (!a.ok || !b.ok) throw new Error("setup");
    expect(a.record.record_id).not.toBe(b.record.record_id);
    expect(a.record.record_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(a.record.record_id).not.toContain("REL-1");
  });

  it("property: text placed in every field the record must not carry never appears in it", () => {
    const secret = fc.stringMatching(/^[A-Z]{10}$/);
    fc.assert(fc.property(secret, secret, secret, secret, secret, (s1, s2, s3, s4, s5) => {
      const v = approved({
        ...viewOf([finding({ id: `ID${s1}`, explanation: s2, uncertainty: s3, resolution_condition: s4, sources: [{ role: "support", anchor: { document_version_id: `DOC${s5}`, pdf_page_index_1based: 9, printed_page_label: s1, paragraph_or_table_anchor: s2, bbox_normalized: [0.1, 0.1, 0.2, 0.2], exact_text: s3, extraction_method: "native_text", quality_flags: [s4] } }] })]),
        release_id: `REL${s1}`, case_revision_id: `REV${s2}`, overview: s3,
        human_review: { status: "approved", reviewer_id: `REV${s4}`, reviewer_scope: s5 },
      });
      const out = JSON.stringify(buildSummaryRecord(v, facts, { pattern_codes: { [`ID${s1}`]: "other" } }, [], patterns, () => "rec"));
      for (const s of [s1, s2, s3, s4, s5]) expect(out).not.toContain(s);
    }), { numRuns: 100 });
  });

  it("factsFrom gives a month and the service type, never a date, and nothing before publication", () => {
    const s = structuredClone(example) as any;
    expect(factsFrom(s)).toBeNull();
    s.release.published_at = "2026-11-03T14:22:00Z";
    const f = factsFrom(s)!;
    expect(f.release_month).toBe("2026-11");
    expect(f.service_type).toBe("limited_assessment");
    expect(JSON.stringify(f)).not.toContain("11-03");
  });

  it("works from a real approved view built from a snapshot", () => {
    const s = structuredClone(example) as any;
    Object.assign(s.release, { status: "published", human_review_status: "approved", reviewer_id: "REV-1", reviewer_scope: "x", published_at: "2026-11-03T00:00:00Z" });
    const r = buildSummaryRecord(buildApprovedView(s), factsFrom(s)!, { pattern_codes: { "F-001": "duration_without_basis" } }, [], patterns);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.record.items[0]).toMatchObject({ title: "Basis for humidity duration", pattern_code: "duration_without_basis" });
  });
});
