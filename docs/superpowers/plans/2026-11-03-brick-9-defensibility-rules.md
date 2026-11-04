# Brick 9: Defensibility Rules Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the expert-witness review (docs/EXPERT_WITNESS_REVIEW.md, items E1, E3, E4) and the 12 cross-examination scenarios into enforced rules, so a released review states evidence strength instead of certainty and never rests a cause on one unexamined explanation.

**Architecture:** More integrity rules in `packages/domain/src/integrity.ts` plus a second coverage map for the cross-examination scenarios. No contract change; every rule uses fields already in v0.1.

**Tech Stack:** TypeScript, vitest, fast-check (already installed).

**Spec:** `docs/spec/MASTER_SPEC.md` sections 11.3, 13, 17; `docs/EXPERT_WITNESS_REVIEW.md`; `tests/evaluations/cross_examination_cases.json` (XC001-XC012).

## Global Constraints

- Opinions state evidence strength, never certainty. No numeric probability of a cause; model self-reported confidence is not evidence (11.3).
- Every material causal claim records competing explanations and what would change the interpretation (11.3).
- Client recollections stay labeled as client statements unless independently documented (7.2, 9).
- The "document review, not an inspection or expert opinion" statement is added by system code, never left to the AI (E4). Already built in Brick 8 (`buildApprovedView`); this brick adds a guard test only.
- No new numeric thresholds invented in code (D07).
- Types check and all tests pass before each next task. Commit after each task.

## Review Focus

- Quoted report language: `The report says the cause is "definitely" HVAC failure.` must pass; the same word unquoted must fail. Straight quotes, curly quotes, and an unbalanced quote must not crash or hide banned wording.
- Accusations cannot be hidden in quotes: `The inspector was "negligent"` must still fail (only the over-certainty list is quote-exempt).
- Words that merely contain a banned word ("improves", "approved", "proofread") must pass.
- Percent forms: `95%`, `95 percent`, `95 % sure` next to certainty words must fail; a measured value like `73.6 percent RH` must pass.
- A finding citing two claims where only one has a hypothesis: expect failure naming the missing one.
- Hypothesis pointing at a claim that does not exist: expect a dangling-reference issue, not a crash.
- Evidence mixing client statements with report-author statements: the client-only rule must not fire.
- Non-cause claims (observations, extent) must not require hypotheses.

---

### Task 1: Over-certain wording and numeric confidence (E3, XC003)

**Files:**
- Modify: `packages/domain/src/integrity.ts` (new list `OVERCERTAIN`, helper `stripQuoted`)
- Test: `packages/domain/test/integrity.test.ts`

**Interfaces:**
- Produces: `stripQuoted(text: string): string` removes text inside straight or curly double quotes; an unbalanced quote leaves the remainder in place.
- Issue code: `overcertain_language` for words such as proves, proven, conclusively, definitive(ly), undoubtedly, without doubt, certainly, with certainty, guaranteed, 100 percent; and for numeric confidence such as "90% confident", "95 percent sure", "probability of 0.8", "confidence: 90".

- [ ] Step 1: Write failing tests from the Review Focus quote, accusation, substring, and percent cases above, plus the XC003 case ("We are 90% certain the cause is HVAC failure.").
- [ ] Step 2: Run, confirm fail. Step 3: Implement; apply to title, explanation, uncertainty, resolution_condition, and release overview. Accusation and verdict patterns keep their current behavior (not quote-exempt).
- [ ] Step 4: Run all tests and typecheck.
- [ ] Step 5: Commit "Brick 9.1: over-certain wording rule".

### Task 2: Cause findings need competing explanations (E1, XC011)

**Files:**
- Modify: `packages/domain/src/integrity.ts`
- Test: `packages/domain/test/integrity.test.ts`

**Interfaces:**
- Issue codes: `cause_finding_without_hypothesis` (a finding cites a claim of type `cause` or `duration` that has no hypothesis), `hypothesis_without_alternatives` (empty `alternative_explanations`), `hypothesis_without_change_conditions` (empty `what_would_change_interpretation`), `hypothesis_supported_but_time_incompatible` (`time_compatible: "no"` with status `supported_with_limits`), and a dangling-reference issue when a hypothesis names a missing claim.

- [ ] Step 1: Write failing tests for each code, plus: the synthetic example still passes; an observation claim with no hypothesis passes; a finding citing two cause claims where one lacks a hypothesis names that claim in the issue path.
- [ ] Step 2: Run, confirm fail. Step 3: Implement. Step 4: Run all tests and typecheck.
- [ ] Step 5: Commit "Brick 9.2: competing explanations rule".

### Task 3: Client statements alone cannot carry strong findings (XC006)

**Files:**
- Modify: `packages/domain/src/integrity.ts`
- Test: `packages/domain/test/integrity.test.ts`

**Interfaces:**
- Issue code: `client_only_support_too_strong` when every supporting evidence item has origin `client_statement` and the finding's `evidence_strength` is `strong` or `moderate`.

- [ ] Step 1: Write failing tests: client-only support with `strong` fails; with `limited` or `indeterminate` passes; mixed client and report-author support passes; empty support is left to the existing `finding_without_source` rule.
- [ ] Step 2: Run, confirm fail. Step 3: Implement. Step 4: Run all tests and typecheck.
- [ ] Step 5: Commit "Brick 9.3: client-only support limit".

### Task 4: Cross-examination coverage map (all XC scenarios)

**Files:**
- Create: `tests/evaluations/cross_examination_coverage.json`
- Modify: `packages/domain/test/evaluation_coverage.test.ts` (check both maps), `scripts/scorecard.mjs` (second table), regenerate `docs/EVALUATION_SCORECARD.md`
- Test: `packages/domain/test/release.test.ts` (add one guard test: the document-review statement appears in every export of a published release)

**Interfaces:**
- Same entry shape as `tests/evaluations/coverage.json`. Honest starting statuses: covered (XC003, XC006, XC009, XC010, XC011); partial (XC001, XC004, XC005, XC008, XC012); needs_engine (XC002, XC007). A claim of covered or partial must name a test that exists.

- [ ] Step 1: Write the map with exact test titles; extend the coverage test to require every XC id mapped once and every named test found.
- [ ] Step 2: Run, confirm the new checks fail until the map is complete, then pass.
- [ ] Step 3: Extend the scorecard script and regenerate; commit "Brick 9.4: cross-examination coverage".

### Task 5: Notes and roadmap

**Files:**
- Modify: `docs/EXPERT_WITNESS_REVIEW.md` (mark E1, E3, E4, E9 done; E2 and E5 wait on ADR-003), `docs/ROADMAP.md` (Brick 9 done, next is the AI slot)

- [ ] Step 1: Update both files. Step 2: Run `npm run check`; commit, push, and confirm the GitHub check passes.

**Exit:** E1, E3, E4 enforced by rules and tests; 12 challenge scenarios mapped (5 covered, 5 partial, 2 need the AI step); CI green.
