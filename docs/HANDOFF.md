# Handoff for engineering (Johnathan)

Written 2026-11-05. Owner and decision-maker: Cory. This is the working base: a tested core with no web app, no storage, no payments. Everything below is synthetic-data only.

## What this is
An independent, flat-fee, AI-assisted second look at a residential mold or moisture inspection report. The homeowner gets what the report did well, questions to ask the inspector, and what could not be checked. No pass/fail, no scores, no upsells, no referrals, no license or legal-compliance checks. Decisions C01-C10 (`docs/spec/DECISIONS.md`) are fixed; technical defaults change only through an ADR in `docs/decisions/`.

## The one rule that shapes the code
The AI proposes. Plain code decides. Every quote is checked word for word against its page, every customer sentence passes the wording filter and the no-citation rule, and rules live in data files (`data/rules/`), not in logic. Silent when a page could not be read.

## Release is automatic (ADR-006)
No person touches each report. `releaseAutomatically` runs the gates (`autoReleaseGates`): wording, no standards named in our words, contract valid, integrity, quotes verbatim, source file unchanged, entitlement, a readable page exists, held-back count under a limit. Any failure sends the case to `needs_attention` and releases nothing. Findings that need a person (departures from a reference) are left out. The person-reviewed path (`releaseCase`) still exists and is unchanged; release mode is a per-case choice.

## Map
| Where | What |
|---|---|
| `packages/contracts` | Review contract v0.1, v0.2, v0.3 (JSON Schema + types). v0.3 adds `release_mode` and the `automatic` status. |
| `packages/domain/src/caseStateMachine.ts` | Case states and guards. Spec in `docs/spec/workflow_transitions.json`. Automatic guards are separate. |
| `packages/domain/src/ingest` | PDF reading, anchors (exact page and box), OCR on our own machine. |
| `packages/domain/src/engine` | The AI slot (extract, propose). Model is behind a port; tests use a scripted fake. |
| `packages/domain/src/inspection` | Checklist, evidence map, contradiction checks, gap questions, done-well, scope-aware quiet. |
| `packages/domain/src/pipeline` | Intake, analysis, human release, automatic release. In-memory repository (access-enforcing). |
| `packages/domain/src/render` | Red-ink markup on the homeowner's own report, closing pages, read-back verification (pinned Typst). |
| `packages/domain/src/knowledge` | Guideline library (56 entries): loader, status engine, append-only decision logs. |
| `data/rules` | All thresholds, wording and lists. Tune here. |
| `data/knowledge` | Library seed, mapping to code, and the review decisions so far. |
| `docs/superpowers/plans` | One plan per brick. |

## State
- 781 tests, typecheck and CI green (2026-11-06).
- Knowledge library: 56 draft entries. Reviewed by Cory in the review page: 44 accepted, 8 parked (commercial and document types other than assessments), 4 waiting on wording (K-034, 037, 045, 055). Needs a second licensed reviewer plus owner approval and four passing fixtures per entry before any entry is live. Nothing is live yet.

## Not built (in order)
1. Storage and access (Brick 19): built vendor-neutral on 2026-11-06 (link plus one-time code access, 90-day retention purge, customer view). Still needed: real database and file storage adapters, email sending, hosting (Johnathan). See `docs/PLAN_BRICK_19.md` and `docs/decisions/STACK_BEFORE_BRICK_19.md`.
2. Client screens and email intake. The draft-visibility gap is closed in code (`customerViewOf`); the screens must use it and never read the repository directly.
3. Payments (deferred by Cory; only a yes/no entitlement fact exists, ADR-001).
4. Reading real reports: done 2026-11-06 (Step 2): hidden-text and instruction-like-text flag with a release gate, isolated reading process, source-rights rules. Still needed: tables and scans (needs a sample scanned report from Cory); hosting must cut the reading process off from the network and add the build step; text in the page's own color is not caught.
5. Remaining checks: five contradiction checks (cover count vs sections, "confirmed" next to "needs a lab", rating rule needing a reading, instrument not in the equipment list, number vs its own stated standard); the citation-question check ("which edition and section?", no verdict); second-reader fallback for lab numbers read from images; instruction-like-text flag; source-rights gate.
6. Needs-attention message, approved by Cory 2026-11-05: "Your review needs a little extra time. We'll send it as soon as it's ready." Still to build: where it shows, and the alert to Cory.
7. Reviewer console (optional now).

## Open with Cory (not engineering)
Attorney list L1-L26 and the packet in `docs/legal`; fee and terms; the 104 checklist items and word lists; a scanned sample report; correction of `data/rules/scope_effects.json`; insurance.

## Hard limits (CLAUDE.md)
No contacting inspectors, publishing findings, deploying, connecting payments, ingesting protected standards, or training on customer documents. Types check and tests pass before each next step. Requirement IDs in `docs/spec/requirements.csv` stay stable.

## Run it
`npm install`, `npm run setup:typst` (pinned Typst for the markup), `npm run check` (typecheck, tests, scorecard).

## 2026-11-07 state (read this first)
- 855 tests, typecheck clean. Built today: Step 2 safe reading (hidden text, instruction-like text, isolated reading process, source-rights rules), client interview (22a-22c, draft notes need Cory's approval), motive-and-intent wording check (P01).
- Phase 0 for the private knowledge vault is design only, in `docs/vault/` and `docs/decisions/ADR-007-PROPOSED-private-knowledge-vault.md`. No vault code exists. Start with `docs/vault/REPOSITORY_AUDIT.md`.
- Held for Cory before anything changes: (1) the customer wording "common practice"; (2) inspector-answers mode stays parked; (3) rewording the IEP-K-001 T2 test case; (4) the IEP-K-030 mapping conflict; (5) the star symbol (no change proposed); (6) the reviewer list check; plus approval of the vault slice S1-S5.
- For Johnathan: hosting and email decisions, cutting the reading process off from the network, the build step for the reading worker, security review of access and the worker, real storage adapters. Nothing from the private vault goes in this public repository.

## 2026-11-07 Step 3 (better questions) - done
- Six new cross-checks in `src/inspection/crossChecks.ts`, rules in `data/rules/cross_checks.json` (draft, Cory tunes), wording in `gap_wording.json`. Plan: `docs/PLAN_STEP3_BETTER_QUESTIONS.md`.
- Second reader for numbers read from images: `ocrDocument(..., { second })`; `svc.ocr.second` is optional. Johnathan: wire a second, different reader (a different OCR setting or engine) when hosting is chosen. Without it, behavior is unchanged.
- Page issue `numbers_not_confirmed` appears when a number was left out.

## 2026-11-07 Vault slice S1-S5 - done (synthetic data only)
- S1 `knowledge/reviewers.ts` + `data/knowledge/reviewers.json` (only Cory listed, so nothing can be approved until a second licensed reviewer is added). `statusOf(..., registry?)`.
- S2 `knowledge/fixtureRunner.ts`: results tied to content hash, rule hash and engine version; `isLiveBound`.
- S3 `knowledge/pack.ts`: `buildPack`, `validatePack`, `loadPack` (rights, wording, pattern, hash; refuses the whole pack on any problem).
- S4 `knowledge/packRun.ts`, `data/rules/knowledge_flags.json` (mode `off`), `Services.pack/packMode`, `CaseRecord.pack_hash/pack_shadow` (system-only). A pack with problems is ignored and a `pack_unusable` issue is recorded.
- S5 `test/pipeline/vaultSlice.test.ts`: off identical to today, shadow logs only, on adds the question with the report's own quote; source/claim ids never reach output.
- Not done (held): S6 (IEP-K-001 T2 text fix, needs Cory), private repo creation, bulk import of the research folder (received 2026-11-07; unpacked privately, nothing committed), pack hash on the snapshot (schema v0.4).

## 2026-11-07 later: vault imported (private repo)
- Research received, deduplicated and converted to draft records in the private repo `report-peepers-vault` (never make it public). Counts match the original handoff (158 claims, 173 sources, 111 checks, 579 relationships). Nothing is cleared for AI use or approved. See that repo's `READINESS.md`.
- Fact check for held item 1: "common practice" appears in no customer-facing data file today (only in rules/docs/comments). No conflict in current output.
- Cory's list: `docs/CORY_TODO.md`.

## 2026-11-07 Cory's decisions (questions 1-4)
- Inspector-answers mode stays parked.
- IEP-K-001 T2 test case fixed (it now expects one completeness question).
- Never ask who made a repair or when (A). Guarded by `test/noRepairWhoWhen.test.ts`; the K-030 CONFLICT flag is cleared.
- A homeowner's answer appears in the review next to its question, labeled as their own (`interviewResult` now returns `question` and `your_answer`). The inspector's report is never changed. Johnathan: client screens must show `your_answer` beside `question`.

## 2026-11-07 First look at upload - built (plan approved by Cory)
- `ingest/documentKind.ts` + `data/rules/document_kind.json` (draft marker words), `ingest/firstLook.ts` + `data/rules/first_look_messages.json` (3 messages, all `approved:false` until Cory approves), `pipeline/intake.ts`: `startCase` classifies when `svc.firstLook` is set; `answerFirstLookStep`; `canCharge(svc, rec)`; `verifyEntitlementStep` refuses with `first_look_not_cleared`.
- Johnathan: the payment link must be created only when `canCharge` is true; screens show the question when `document_kind` is `lab_only` or `unclear` and `first_look` is empty, and show the message returned by `answerFirstLookStep`.
- Still open: what happens to a case held after payment (audit item 2).
- Lab-only choice built: `chooseLabOnlyStep`, `deliverOutlineStep`, `ingest/outline.ts`, `data/rules/outline.json` (draft, `approved:false`, `fee_share` 0.5). Johnathan: outline needs its own payment fact (`svc.outline.paid`); the review payment stays blocked for lab-only files.

## Reports are never held (E04, 2026-11-07)
`autoReleaseGates` lost four gates (quotes_verbatim, readable, held_back_limit, suspicious_content); `releaseAutomatically` now filters bad-quote findings instead. New system gate `reread_failed`. Johnathan: add automatic retry for `needs_attention` caused by system gates only. `auto_release.max_held_back` is unused and can be removed.

## Legal-safety pass (E17, 2026-11-11)
Johnathan: the upload screen must show the items in `data/rules/acknowledgments.json` and pass the accepted ids as `acknowledged` to `startCase` (the service refuses without them; wire `svc.acknowledgments = loadAcknowledgments()`). Add an owner-only admin action that calls `placeLegalHold` / `liftLegalHold`. The marked-up copy's headings and notice changed; check page layout with the longer notice on real reports.


## Lou's conversation (E25)
Engine: `packages/domain/src/interview/conversation.ts`, questions in `data/rules/lou_conversation.json`, pipeline steps in `src/pipeline/conversation.ts` (`conversationStep`, `answerConversationStep`, `stopConversationStep`, `conversationRecord`), store interface `conversationStore.ts`. Wire `svc.conversations` (in-memory store exists; a real one is needed). Open after payment until delivery, owner only. Typed text never goes to a model. Deleted by `purgeExpired`, kept during a legal hold.
