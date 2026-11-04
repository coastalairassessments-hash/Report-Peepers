import { describe, it, expect } from "vitest";
import example from "../../../../docs/spec/example_case.json" with { type: "json" };
import { fakeModel } from "../../src/engine/fakeModel.js";
import { proposeFindings } from "../../src/engine/proposeFindings.js";
import { checkIntegrity } from "../../src/integrity.js";
import { fingerprint } from "../../src/revision.js";

const clock = () => "2026-11-03T12:00:00.000Z";
const snap = (): any => { const c = structuredClone(example) as any; c.schema_version = "0.2"; c.findings[0].assumptions = ["Readings were taken where stated."]; return c; };
const reply = (title: string) => JSON.stringify({
  questions: [], hypotheses: [],
  findings: [{ local_id: "1", finding_type: "documentation_limitation", title, explanation: "The report does not show what the duration rests on.", claim_ids: ["CL-001"], support_evidence_ids: ["EV-001"], counter_evidence_ids: [], reference_bindings: [], evidence_strength: "limited", decision_relevance: "material", uncertainty: "Other records may exist.", question_local_ids: [], possible_next_steps: ["Ask for the supporting history."], resolution_condition: "The basis is supplied.", assumptions: ["The visit was the only time readings were taken."] }],
});

describe("replay: same inputs, same results; a different reply is visible, never silent", () => {
  it("XC004: the same input and the same reply give identical drafts and identical hashes", async () => {
    const a = await proposeFindings(fakeModel([reply("Basis for duration")]), snap(), clock);
    const b = await proposeFindings(fakeModel([reply("Basis for duration")]), snap(), clock);
    expect(a).toEqual(b);
    expect(a.ok && fingerprint(a.result.snapshot)).toBe(b.ok && fingerprint(b.result.snapshot));
  });

  it("XC004: different wording changes the output hash only, and never edits the snapshot it started from", async () => {
    const start = snap(), before = fingerprint(start);
    const a = await proposeFindings(fakeModel([reply("Basis for duration")]), start, clock);
    const b = await proposeFindings(fakeModel([reply("Support for the duration statement")]), start, clock);
    expect(a.audit[0]!.input_hash).toBe(b.audit[0]!.input_hash);
    expect(a.audit[0]!.output_hash).not.toBe(b.audit[0]!.output_hash);
    expect(fingerprint(start)).toBe(before);
    expect(a.ok && b.ok && fingerprint(a.result.snapshot)).not.toBe(b.ok && a.ok && fingerprint(b.result.snapshot));
  });

  it("XC004: the plain-code checks give the same answer every time they are re-run", async () => {
    const r = await proposeFindings(fakeModel([reply("Basis for duration")]), snap(), clock);
    expect(r.ok).toBe(true);
    if (r.ok) expect(checkIntegrity(r.result.snapshot)).toEqual(checkIntegrity(structuredClone(r.result.snapshot)));
  });

  it("a draft is never approved or published by the stage, whatever the reply says", async () => {
    const r = await proposeFindings(fakeModel([reply("Basis for duration")]), snap(), clock);
    expect(r.ok && r.result.snapshot.findings.filter((f: any) => f.id.startsWith("AI-")).every((f: any) => f.human_approved === false)).toBe(true);
    expect(r.ok && r.result.snapshot.release.status).toBe(snap().release.status);
  });
});
