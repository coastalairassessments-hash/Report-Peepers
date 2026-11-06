# Report Peepers roadmap

Living plan. Update status here as work lands. Detailed task plans live in `docs/superpowers/plans/`.
Rules: plan first, no code without Cory's approval, typecheck and tests green before each next step.

## Phases

| # | Phase | Status | Needs from outside |
|---|-------|--------|--------------------|
| 1 | Core rules in code: contract, case states, scope intake, evidence links, revisions, math checks | Done (Bricks 1-7) | none |
| 2 | Brick 8: remaining plain-code checks (area status, edition and draft dates, scope conflicts, export consistency) | Done | none |
| 2b | Brick 9: defensibility rules from the expert-witness review (E1, E3, E4) | Done | none |
| 2c | Brick 10: contract v0.2 (calculation records, stored dates, assumptions, conflict disclosure) per ADR-003 | Done | none |
| 2d | Brick 11: the AI slot with a fake model (AI proposes, plain code checks) | Done | none |
| 2e | Brick 12: reading a PDF with exact page and box anchors (synthetic PDFs only) | Done | I1 sample reports help but are not required |
| 2f | Brick 13: the red-ink markup renderer and closing summary page, the marked-up report is the deliverable (ADR-004) | Done (planner, Typst renderer, verifier, export; proofs in docs/proofs) | Cory to look at the proof sheets |
| 2g | Brick 14: saved summary record (scrubbed wording plus codes) and flaw-pattern list for analysis (ADR-005) | Done (draft pattern list, scrub, record builder, in-memory store, small-group-hiding counter) | Real pattern list from the field expert (I2); minimum group size in data/rules/analysis.json (L18, counting stays off until set); contract tag field later; purchase-terms wording |
| 3 | AI slot with a stand-in model | Done (Brick 11) | none |
| 3a | Brick 15: evidence and claims extraction stage (AI proposes, code verifies every anchor and number) | Done (stage, firewall, per-page runner, hostile-text tests) | none (synthetic) |
| 3b | Brick 16: the pipeline end to end on synthetic data: intake, read, extract, propose, reviewer approval port, publish, marked-up export, saved record (spec Milestone 2) | Done (access-enforcing repository, intake to ready, analysis, reviewer release, marked-up export, saved record, end-to-end and adversarial tests) | none |
| 3c | Brick 17: inspection review: completeness checklist (what was seen, moisture and dry standard, odor, sampling reasoning and controls, scope), recommendation-to-evidence support check, record-gap questions for the homeowner to send | Mostly built (17.1-17.5, OCR, evidence map, questions, proof sheet); five contradiction checks and the released-PDF layout still open | none (synthetic) |
| 3d | Brick 18: corrections to OUR own errors only: supersede a release, corrected marked-up copy, change notice. Decision 2026-11-04: no paid or free re-check when an inspector supplies a missing record; the questions are the product | Planned | none |
| 4 | Reading real reports: tables, photo captions, scans (OCR), hidden-text detection, isolated parsing worker | Planned | Sample reports (input I1) |
| 5 | Expert rule packs loaded from files | Planned | IH rules (input I2) |
| 6 | Brick 19+: storage and access: saved cases, customer isolation, locked releases, deletion | Planned | none |
| 7 | Reviewer console, then homeowner screens | Planned | Reviewer process (input I3) |
| 8 | Payments (credits model, ADR-001) | Deferred by Cory | Fee and terms (input I5) |
| 9 | Pilot: every release human-approved | Later | Attorney review (L-list), insurer, reviewers |
| 10 | Pro tier (pre-issue check) | Later | Homeowner product proven |

## Where new data goes

| When this arrives | It goes here | Then |
|---|---|---|
| IH / expert rules | `data/rules/<topic>.md` | Loaded in phase 5; each rule gets a test and a scenario |
| Sample reports (anonymized) | `data/reports/` | Become development cases; hold some back for testing |
| Source list and permissions | `data/references/` | Rights status set per source before any use |
| Common-flaw codes | `data/flaw-patterns/` | Counts only (ADR-002) |
| New test scenarios | `docs/spec/evaluation_cases.json`, mapped in `tests/evaluations/coverage.json` | Scorecard regenerates |
| Decisions | `docs/decisions/ADR-nnn-*.md` | Spec changes only through an ADR |
| Legal questions | `docs/LEGAL_REVIEW.md` | Parked side list |
| Business terms (fee, refunds, turnaround) | `docs/decisions/` | Feeds phase 8 and 9 |

## Input register

| ID | Input | From | Status |
|----|-------|------|--------|
| I1 | 3-5 anonymized sample reports | Cory | waiting |
| I2 | Expert reading rules | IH | waiting |
| I3 | What a reviewer checks, turnaround, edit rights | IH | waiting |
| I4 | ADR-003 decision (calculation records in contract v0.2) | Cory | open |
| I5 | Fee, included follow-up, refunds | Cory | open |

## Decisions made
- ADR-001: homeowner per-report fee first; Pro tier later as a pre-issue check.
- ADR-002: documents deleted on schedule; keep only anonymous flaw-pattern counts; trend data only to IndoorIQ.
- ADR-003: proposed.

## Working agreements
- The AI proposes; the checks decide. Rules live in files and code, so a better model never forces a rebuild.
- Scorecard (`docs/EVALUATION_SCORECARD.md`) shows what is proven by tests and what is not.

## Intake context bank (2026-11-05)
Built: 40 new context questions (CX01-CX43 numbering follows the approved draft), buttons plus note, single or multi select, skip rules, section skipping, and 11 "client said X, report silent" rows. Data: data/rules/context_questions.json, context_expectations.json. Code: packages/domain/src/context.ts. Health answers are context only and never used.
Wired: answers live on the case (`context`), and unmet expectations become questions in the inspection review (placed with the other material questions). Not yet built: the client screens.

## Brick 17b (2026-11-05): scope-aware questions and quiet tests
Built: gaps a client-described limit explains are not asked (listed as "not expected"; one scoped question if conclusions lean on them); "referenced but not supplied" check for an attached lab report that is not in the file; a must-stay-quiet sample for every rule, with a meta-test that fails when a new rule has none. Data: data/rules/scope_effects.json (draft topic mapping, for Cory to correct). 559 tests pass.
Next candidates: reviewer keep/reword/remove marks per question; source-rights gate; draft-read fix; instruction-like-text flag; five remaining contradiction checks.

## Done well (2026-11-05)
The review now lists what the report did well (`done_well`): fully shown checklist items with page and the report's own words, up to 8, material topics first. No quote, no star; never from image-read text; never for "silence is fine" items; never where we also ask. Not a score. Not yet placed on the released PDF summary page (layout pending with the page-one list).

## Automatic release and samples-alone rule (2026-11-05)
Decision ADR-006: no person per report; release mode becomes a setting (next brick). Built: "work recommended on sample results alone" rule, at room level (evidence map) and report level (consistency): the recommendation rests on lab results and no visual finding or reading appears. 583 tests pass.
Next: release_mode setting with all gates automatic; citation question check; guideline database plan.

## Brick 18a and library review (2026-11-05)
Built: contract v0.3 (automatic release mode), `needs_attention` state, automatic guards and mode-aware integrity rules, `autoReleaseGates`, `releaseAutomatically`, and the review pages (done well, more questions, not expected, not checked) in the released PDF and text. Knowledge library: first review decisions synced from the review page (`data/knowledge/decisions`, `edits`, `family_decisions.json`); 40 accepted, 8 parked, 8 waiting on wording; none approved or live. 662 tests pass.
Open: needs-attention message and alert (wording not approved); the released review lists every question on a thin report (about 50): decide a cap or grouping.
See `docs/HANDOFF.md` and `docs/decisions/STACK_BEFORE_BRICK_19.md`.
