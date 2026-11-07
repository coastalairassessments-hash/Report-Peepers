# Phase 0-G: Implementation plan (proposed, needs Cory's approval)

## The smallest slice
One claim, end to end, on synthetic data inside this repository:

source passage -> claim -> approved check -> evidence anchors on a synthetic report -> question and done-well -> existing markup and text export.

Use claim CLM-0007 (humidity or dew point alone does not show a wet surface) as the worked example. No real vault content enters this repo: the slice uses a clearly labeled synthetic source and claim.

## Order against the handoff's phases
The handoff's Phase 1 is a local draft vault (read-only import, hashed manifest, search). That needs the research folder, which I do not have. The blockers I found (R1-R4: no consumer, no fixture runner, results not version-bound, reviewer authority) do not depend on any corpus. So the slice below proves the export boundary on synthetic data first (the handoff's Phases 2 and 3 mechanics), and the Phase 1 importer follows when the folder arrives. Doing it this order means the import can never become a way around activation.

## Steps (test first, typecheck and tests green before each next step)
| Step | What | Files (new unless marked) |
|---|---|---|
| S1 | Reviewer registry. Only registered reviewers' decisions count | `knowledge/reviewers.ts`, `test/knowledge/reviewers.test.ts`; change `knowledge/status.ts` |
| S2 | Fixture runner and bound results. Result tied to content hash, rule-file hash, engine version | `knowledge/fixtureRunner.ts`, tests; change `knowledge/status.ts` (`isLive`) |
| S3 | Pack: type, build, validate (rights, wording, fixtures, hash), load | `knowledge/pack.ts`, `test/knowledge/pack.test.ts`, a synthetic pack in `test/fixtures/` |
| S4 | Flag and shadow mode, pack hash on the case | change `pipeline/types.ts`, `pipeline/analyze.ts`; new `data/rules/knowledge_flags.json`; `test/pipeline/packPinning.test.ts` |
| S5 | End-to-end synthetic case: the claim produces a question and a done-well through the existing markup and text path | `test/pipeline/vaultSlice.test.ts` |
| S6 | Fix IEP-K-001 T2 through the edit log | `data/knowledge/edits/IEP-K-001.json` (after Cory's review) |

Validation commands: `npm run typecheck`, `npx vitest run`, then the named new test files. Record the real output of each.

## Exit criteria
- All existing 825 tests still pass; golden output with the flag `off` is byte-identical to today.
- Acceptance tests A1-A5, B1-B3, C1, E1-E3 pass.
- In shadow mode the synthetic case shows the new question in the log and not in the customer output.
- No gate, no markup rule and no wording rule is weakened (diff review).

## Rollback
Set the flag to `off`, or delete the pack file. Code added is inert while the flag is off. Revert by commit.

## Deferred (not in the slice)
Private repo creation and the bulk import; the reviewer interface; search index; inspector-answers mode and records requests (parked paid add-on); schema v0.4 with pack hash on the snapshot; the five contradiction checks (use the two-verified-passages rule when built); the research archive import; Sections 01-11.

## What I need
- One input: the research folder as a ZIP or an accessible folder (including the Sections 12-29 archive). Without it I cannot audit, count or import it. I will not guess its contents.
- One decision: approve the slice (S1 to S5).
