import { describe, it, expect } from "vitest";
import { wordingProblems } from "../src/integrity.js";

const hits = (t: string) => wordingProblems(t).filter((p) => p.startsWith("motive:")).length > 0;

describe("no suggestion of motive, intent or careless effort", () => {
  it.each([
    "The inspector conveniently left the attic out.",
    "The photos were deliberately cropped.", "They intentionally skipped the crawlspace.", "This was knowingly omitted.", "It was done on purpose.",
    "The stain was covered up.", "A cover-up of the results.", "The wording is there to hide the problem.", "It was written in order to mislead the buyer.",
    "The gap is there to avoid liability.", "The report is misleading.", "The inspector misrepresented the readings.", "A sloppy job.", "Careless sampling.",
    "The inspector failed to disclose the earlier leak.", "They neglected to document the moisture readings.", "What was their motive?", "There may be a hidden agenda.",
  ])("flags %s", (t) => { expect(hits(t)).toBe(true); });

  it.each([
    "Hidden moisture can sit behind wall coverings.", "Work was done to avoid disturbing the suspected growth.", "There was convenient access to the attic.",
    "Knowing the date of the leak would help.", "The room was not entered because it was locked.", "The report does not show the temperatures.",
    "Which areas were not entered or only partly viewed?", "The report does not say why the room was left out.", "A deliberate, step-by-step approach is common.",
    "What was recorded at the time of the visit?", "Ask the inspector for the notes from the walk-through.",
  ])("allows %s", (t) => { expect(hits(t)).toBe(false); });

  it("leaves the inspector's own quoted words alone", () => {
    expect(hits('The report says "the area was intentionally left out" on page 4. What does that refer to?')).toBe(false);
    expect(hits('The report says "the area was intentionally left out" on page 4. It was intentionally left out.')).toBe(true);
  });
});
