import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { scrubText, blockedNamesFrom } from "../../src/analysis/scrub.js";

const flagged = (t: string, names: string[] = []) => { const r = scrubText(t, names); return r.ok ? [] : r.reasons; };

describe("scrubText flags identifying details", () => {
  it.each([
    ["Ask jane.doe@example.com for the history", "email"],
    ["See www.acmemold.com for records", "web_address"],
    ["Ask them at https://example.org/report", "web_address"],
    ["Call 772-555-0142 for the log", "phone"],
    ["Call (772) 555 0142", "phone"],
    ["Records at 1234 Ocean Blvd were not supplied", "street_address"],
    ["The home at 12 Palm Tree Lane", "street_address"],
    ["Mail to P.O. Box 456", "po_box"],
    ["Located in 34994", "zip_code"],
    ["Assessor license MRSA2944 is not shown", "license_or_permit"],
    ["Permit no. 2024-0457 was not attached", "license_or_permit"],
  ])("%s", (text, reason) => expect(flagged(text)).toContain(reason));

  it("flags a listed name in any case, and the surname alone, but not common words from a company name", () => {
    expect(flagged("Did Dana Whitfield take the readings?", ["Dana Whitfield"])).toContain("listed_name");
    expect(flagged("did WHITFIELD take the readings?", ["Dana Whitfield"])).toContain("listed_name");
    expect(flagged("Ask Whitfield, Dana", ["Dana Whitfield"])).toContain("listed_name");
    expect(flagged("Ask about mold and moisture readings", ["Acme Mold and Moisture Inc"])).toEqual([]);
    expect(flagged("Ask Acme Mold and Moisture Inc about it", ["Acme Mold and Moisture Inc"])).toContain("listed_name");
    expect(flagged("What was the Acme sampling method?", ["Acme Mold and Moisture Inc"])).toContain("listed_name");
  });

  it("lets ordinary summary wording through unchanged", () => {
    for (const t of ["What was the duration estimate based on?", "Ask for the supporting history.", "The stain is about 2 feet by 3 feet.", "Readings were taken over 6 months.", "Can the attic be reviewed another way?"]) {
      const r = scrubText(t, ["Dana Whitfield"]);
      expect(r, t).toEqual({ ok: true, text: t });
    }
  });

  it("reports categories only, never the matched text", () => {
    const r = scrubText("Email jane.doe@example.com", []);
    expect(JSON.stringify(r)).not.toContain("jane");
  });

  it("property: a listed name never survives, whatever the case or the sentence around it", () => {
    const word = fc.stringMatching(/^[A-Za-z]{5,10}$/).filter((w) => !["mold", "moisture", "report", "assessment"].includes(w.toLowerCase()));
    fc.assert(fc.property(word, word, fc.constantFrom((s: string) => s, (s: string) => s.toUpperCase(), (s: string) => s.toLowerCase()), (first, last, f) => {
      const text = `The review asks whether ${f(last)} measured it, and ${f(first)} ${f(last)} signed.`;
      expect(scrubText(text, [`${first} ${last}`]).ok).toBe(false);
    }), { numRuns: 100 });
  });
});

describe("blockedNamesFrom", () => {
  it("uses supplied names and the words in file names, dropping common words", () => {
    const names = blockedNamesFrom({ documents: [{ display_name: "Whitfield_Mold_Report_FINAL.pdf" }, { display_name: "scan(2).pdf" }] } as never, ["Dana Whitfield", " "]);
    expect(names).toContain("Dana Whitfield");
    expect(names).toContain("Whitfield");
    expect(names).not.toContain("Mold");
    expect(names).not.toContain("FINAL");
    expect(names).not.toContain(" ");
  });
});
