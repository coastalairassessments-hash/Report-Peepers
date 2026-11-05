import { describe, it, expect } from "vitest";
import { loadLibrary, validateLibrary, PARKED_FAMILIES } from "../../src/knowledge/library.js";

const lib = () => loadLibrary();
const clone = <T,>(x: T): T => structuredClone(x);

describe("the seed library", () => {
  it("loads 56 entries in 12 families with 224 tests, none run", () => {
    const l = lib();
    expect(l.entries).toHaveLength(56);
    expect(l.families).toHaveLength(12);
    expect(l.entries.flatMap((e) => e.fixtures)).toHaveLength(224);
    expect(l.entries.flatMap((e) => e.fixtures).some((f) => f.executed)).toBe(false);
  });
  it("passes every check", () => { expect(validateLibrary(lib())).toEqual([]); });
  it("imports as draft and never live", () => {
    for (const e of lib().entries) { expect(e.status).toBe("ai_draft"); expect(e.production_enabled).toBe(false); }
  });
  it("parks the commercial and restoration families", () => { expect(PARKED_FAMILIES).toEqual(["F10", "F11"]); });
});

describe("the checks catch problems", () => {
  const problems = (mut: (l: ReturnType<typeof lib>) => void) => { const l = clone(lib()); mut(l); return validateLibrary(l).map((p) => p.code); };
  it("duplicate ids", () => { expect(problems((l) => { l.entries[1]!.id = l.entries[0]!.id; })).toContain("duplicate_id"); });
  it("unknown family", () => { expect(problems((l) => { l.entries[0]!.family = "F99"; })).toContain("unknown_family"); });
  it("an entry without exactly four tests", () => { expect(problems((l) => { l.entries[0]!.fixtures.pop(); })).toContain("fixture_count"); });
  it("a related entry that does not exist", () => { expect(problems((l) => { l.entries[0]!.related.push("IEP-K-999"); })).toContain("unknown_related"); });
  it("a shared control that does not exist", () => { expect(problems((l) => { l.entries[0]!.shared_controls.push("SC-99"); })).toContain("unknown_control"); });
  it("a standard named in the homeowner question", () => { expect(problems((l) => { l.entries[0]!.homeowner_question = "Does this follow ASTM D7338?"; })).toContain("customer_wording_names_standard"); });
  it("a compliance claim in the homeowner question", () => { expect(problems((l) => { l.entries[0]!.homeowner_question = "Is the report compliant?"; })).toContain("customer_wording_names_standard"); });
  it("an accusing homeowner question", () => { expect(problems((l) => { l.entries[0]!.homeowner_question = "Was the inspector negligent in checking the attic?"; })).toContain("customer_wording_rule");});
  it("an outside numeric limit", () => { expect(problems((l) => { l.entries[0]!.principle = "Readings above 17 percent are wet."; })).toContain("outside_numeric_limit"); });
  it("an entry that arrives approved or live", () => {
    expect(problems((l) => { l.entries[0]!.status = "approved"; })).toContain("import_not_draft");
    expect(problems((l) => { l.entries[0]!.production_enabled = true; })).toContain("import_not_draft");
  });
  it("a test that arrives already run", () => { expect(problems((l) => { l.entries[0]!.fixtures[0]!.executed = true; })).toContain("import_test_already_run"); });
  it("a source marked verified on import", () => { expect(problems((l) => { l.entries[0]!.source_status = "verified"; })).toContain("import_source_verified"); });
});
