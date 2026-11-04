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
| 2e | Brick 12: PDF ingestion with page anchors (synthetic PDFs only) | Next | I1 sample reports help but are not required |
| 3 | AI slot with a stand-in model: typed stage outputs, scripted fake AI, full pipeline test | Planned | none |
| 4 | Reading real reports: PDF text with page anchors, tables, photo captions | Planned | Sample reports (input I1) |
| 5 | Expert rule packs loaded from files | Planned | IH rules (input I2) |
| 6 | Storage and access: saved cases, customer isolation, locked releases, deletion | Planned | none |
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
