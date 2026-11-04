# Expert-witness stress test

Lens: for every conclusion Report Peepers releases, could it be defended if challenged? Borrowed from how expert opinions are tested (sufficient facts, reliable method, reliable application, stated limits, known error rates). This is a design discipline, not a claim that the system is an expert witness. The spec excludes expert testimony and litigation use. Not legal advice; open points go to the attorney list.

## What already holds up
| Test | Where it is met |
|---|---|
| Opinion rests on identifiable facts | Findings must link to evidence with page locations (Brick 4) |
| Facts vs. assumptions kept apart | Client statements, report statements, and reviewer inferences are separate evidence origins |
| Method is stated and repeatable | Rule pack, model, prompt, and input hashes recorded per run; checks are plain code with tests |
| Changes are traceable | Locked releases, reasons, new evidence named (Brick 5) |
| Limits stated | Restriction capture, "not addressed" wording, coverage limitations |
| Records not altered | Evidence cannot be rewritten; edits to a published snapshot are detectable |

## Gaps and what to add
| # | Gap | Fix | Where |
|---|-----|-----|-------|
| E1 | A cause finding need not mention competing explanations | Rule: a cause finding lists alternatives considered, or says why none apply | Done (Brick 9: `cause_finding_without_hypothesis` and related hypothesis rules) |
| E2 | Findings do not list the assumptions they depend on | Add `assumptions[]` to findings | ADR-003 (contract v0.2) |
| E3 | Absolute wording ("proves", "conclusively", "definitely") is not blocked | Add to banned wording; expert opinions state strength, not certainty | Done (Brick 9: `overcertain_language`, quoted report wording exempt) |
| E4 | A release need not carry a "what this review is not" statement | Rule: publishing requires coverage limitations stating document review only, no inspection, no expert opinion | Done (every export carries the document-review statement; guarded by tests) |
| E5 | No reviewer conflict disclosure on the release | Add reviewer conflict disclosure field | ADR-003 |
| E6 | No plain-language method statement per release | Generated block: what was reviewed, how, rule pack and reference editions, human review status | Release export (Brick 8, Task 4) |
| E7 | No known error rates yet | Publish scorecard results per report type once evaluated; never one blended accuracy number | Pilot phase |
| E8 | No audit trail of who approved or viewed | Build the audit events the spec lists | Storage phase |
| E9 | Challenge scenarios missing from the test set | Added 12 cross-examination scenarios (`tests/evaluations/cross_examination_cases.json`) for expert adjudication | Done |

## Exposure to raise with the attorney
Added as L15: a released review may be used in a dispute even though the product is not for litigation. Wording, disclaimers, and terms need counsel's review.
