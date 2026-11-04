# Brick 8: Remaining Plain-Code Checks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the five scenarios that need plain code, not AI: TC003 (conflicting scope accounts), TC009/TC010 (areas not examined), TC040/TC041 (edition dates and draft sources), TC053 (export must match the approved result).

**Architecture:** Pure functions and extra integrity rules in `packages/domain`, same style as Bricks 4-7. Where the v0.1 contract has no field for a fact (reference publication status and dates, the report issue date), the check takes that fact as a separate typed input and the missing fields are added to the ADR-003 proposal. The contract is not edited without Cory's approval.

**Tech Stack:** TypeScript, vitest, fast-check (already installed).

**Spec:** `docs/spec/MASTER_SPEC.md` sections 7.1, 9.1, 14, 17, 18; scenarios TC003, TC009, TC010, TC040, TC041, TC053 in `docs/spec/evaluation_cases.json`.

## Global Constraints

- Silence never becomes "confirmed unaffected" or "confirmed contaminated" (C06, section 9.1).
- When the agreement and the client's recollection disagree, keep both; never silently choose (section 6.3).
- A newer edition may be described as later guidance only; old work is not declared defective because a later edition differs (section 14).
- A draft or withdrawn source is never cited as a published requirement (section 14).
- The screen, the PDF, and the text export come from the same approved result (section 17).
- No numeric thresholds invented in code (D07).
- Types check and all tests pass before each next task. Commit after each task.

## Review Focus

- Room names differing only by case, spaces, or punctuation ("Master Bath" vs "master  bath"): expect one room.
- Report issue date missing or unreadable: expect "timing unknown", which blocks a claimed departure, never a guess.
- Reference with no edition, or a draft marked "authorized": expect refusal for any verified use.
- A conflicting restriction with one account empty: expect refusal to record it.
- Export of a withdrawn or superseded release: expect an explanation notice, not an error or a silent old copy.
- A published snapshot edited after publish: expect export refused (fingerprint mismatch).
- Text containing HTML or very long lines in an export: expect it carried as plain text.

---

### Task 1: Areas not examined (TC009, TC010)

**Files:**
- Create: `packages/domain/src/areas.ts`
- Modify: `packages/domain/src/integrity.ts` (two new rules)
- Test: `packages/domain/test/areas.test.ts`, `packages/domain/test/integrity.test.ts`

**Interfaces:**
- Produces: `describeArea(a: Area): string` giving fixed plain wording per status; never "clean", "unaffected", "safe", or "contaminated".
- Produces: `areaKey(name: string): string` (lowercase, collapse spaces and punctuation).
- Produces: `unaddressedAreas(expectedNames: string[], areas: Area[]): string[]` names the client expects but the report never addresses (status: "not addressed in the report", not clean and not affected).
- New integrity codes: `area_no_indicators_without_basis` (needs a scope statement and at least one evidence id), `area_conflict_not_marked` (basis evidence that contradicts other basis evidence for the same area requires status `conflicting_evidence`).

- [ ] Step 1: Write failing tests: all six statuses produce wording containing none of the banned words; "assessed_no_indicators_reported" wording includes the assessed scope text; "Master Bath" and "master  bath" are one key; a room absent from the report appears in `unaddressedAreas` and never gets a status; `assessed_no_indicators_reported` with no evidence fails integrity; contradicting basis evidence with a non-conflict status fails integrity.
- [ ] Step 2: Run, confirm fail. Step 3: Implement. Step 4: Run all tests and typecheck.
- [ ] Step 5: Commit "Brick 8.1: area status wording and rules".

### Task 2: Edition dates and draft sources (TC040, TC041)

**Files:**
- Create: `packages/domain/src/referenceTiming.ts`
- Test: `packages/domain/test/referenceTiming.test.ts`

**Interfaces:**
- Produces: `type ReferenceTiming = { reference_id: string; publication_status: "published" | "draft" | "withdrawn" | "superseded"; published_on: string | null }`
- Produces: `checkReferenceUse(finding: Finding, refs: Reference[], timings: ReferenceTiming[], reportIssuedOn: string | null): Issue[]`
- Issue codes: `reference_draft_not_citable`, `reference_withdrawn_needs_historical_context`, `reference_timing_unknown` (no timing record, or no report date), `reference_postdates_report` (edition published after the report was issued, finding may not be a `verified_reference_departure`; "later guidance" wording is allowed).

- [ ] Step 1: Write failing tests: draft with verified binding gives `reference_draft_not_citable`; edition published 2024 vs report issued 2022 with a `verified_reference_departure` gives `reference_postdates_report`, while the same reference on a `clarification_needed` finding passes; unknown report date blocks a departure; withdrawn needs historical context; null edition and unreadable dates give `reference_timing_unknown` and never throw.
- [ ] Step 2: Run, confirm fail. Step 3: Implement using `parseStamp` date parsing from `calc/time.ts` (dates only, no guessing). Step 4: Run tests and typecheck.
- [ ] Step 5: Commit "Brick 8.2: reference timing and draft rules".

### Task 3: Conflicting scope accounts (TC003)

**Files:**
- Modify: `packages/domain/src/intake.ts` (add functions), `packages/domain/src/integrity.ts` (one rule)
- Test: `packages/domain/test/intake.test.ts`, `packages/domain/test/integrity.test.ts`

**Interfaces:**
- Produces: `recordScopeConflict(scope: Scope, kind: RestrictionKind, accounts: { agreement: string; client: string }): Scope` sets the restriction to `conflicting` (status and agreed_status), keeps both accounts in the description, adds an entry to `unresolved_discrepancies`. Throws if either account is empty.
- Produces: `resolveScopeConflict(scope: Scope, kind: RestrictionKind, choice: "agreement" | "client" | "both_stand", note: string): Scope` records who chose what and why, keeps both accounts.
- New integrity code: `scope_conflict_unrecorded` (a conflicting restriction with no entry in `unresolved_discrepancies`).

- [ ] Step 1: Write failing tests: both accounts preserved verbatim; `confirmScope` still refuses without a conditional choice; resolution needs a note and an explicit choice; resolving never deletes the other account; integrity rule fires on a hand-edited snapshot.
- [ ] Step 2: Run, confirm fail. Step 3: Implement. Step 4: Run tests and typecheck.
- [ ] Step 5: Commit "Brick 8.3: conflicting scope accounts".

### Task 4: One approved result for screen and export (TC053)

**Files:**
- Create: `packages/domain/src/release.ts`
- Test: `packages/domain/test/release.test.ts`

**Interfaces:**
- Consumes: `fingerprint(snap)` from `revision.ts`.
- Produces: `buildApprovedView(snap: Snap): ApprovedView` (overview, ordered findings with question and next step, coverage limitations, human review status, change list; nothing else).
- Produces: `renderText(view: ApprovedView): string` and `viewHash(view): string`.
- Produces: `exportRelease(snap: Snap, publishedFingerprint: string): { ok: true; view: ApprovedView; text: string; hash: string } | { ok: false; reason: "not_published" | "snapshot_changed" | "superseded_notice"; notice?: string }`

- [ ] Step 1: Write failing tests: every finding title, question, and next step in the view appears in the text; a reviewer correction to one finding changes the view, the text, and the hash together; a draft release is refused (`not_published`); a snapshot edited after publish is refused (`snapshot_changed`); a superseded release returns a notice pointing to the newer release, not an error; HTML in finding text is carried as plain text.
- [ ] Step 2: Run, confirm fail. Step 3: Implement. Step 4: Run tests and typecheck.
- [ ] Step 5: Commit "Brick 8.4: approved view and export".

### Task 5: ADR update and scorecard

**Files:**
- Modify: `docs/decisions/ADR-003-calculation-records.md` (add: reference `publication_status`, `published_on`; snapshot `report_issued_on`)
- Modify: `tests/evaluations/coverage.json` (TC003, TC009, TC040, TC041, TC053 to covered; TC010 to covered if Task 1 wording tests prove it), `docs/ROADMAP.md` (phase 2 to done)
- Regenerate: `docs/EVALUATION_SCORECARD.md`

- [ ] Step 1: Update the map with exact test titles; the coverage test fails if any is missing.
- [ ] Step 2: Run `npm run check`; commit, push, and confirm the GitHub check passes.

**Exit:** all 6 scenarios covered (17 of 60 total), no scenario left in "needs plain code", CI green.
