# Brick 17: Inspection Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** For every report, answer two questions for the homeowner: (1) Is the report complete? (2) Does it support its own claims and recommendations? Whatever the report does not answer becomes a question the homeowner can send the inspector, with a "do you have a record of this, and can you share it?" line. No grades, no pass/fail.

**Architecture:** The checklist is a data file in `data/rules/`, written in our own words from Cory's expertise (no standard's text). Adding a question later means adding one entry; no code change. The AI only points to the report's exact words for each item; plain code verifies the words are on the page and sets the status. A second layer of plain-code consistency checks needs no AI. Gaps become draft findings (clarification needed) through the existing proposal firewall, so they reach the reviewer as unapproved drafts like everything else.

**Source of content:** `docs/expert/OBSERVATION_CHECKLIST_DRAFT.md` (Cory's list, draft until he confirms wording; input I2). Cory also supplied a fuller peer-review guideline (about 60 items in 13 sections). Pending his go-ahead, the checklist is built from it, split into items checkable from the report alone and items that need a record (chain of custody, pump calibration, field notes). Severity is only material versus minor; no overall opinion. Two real sample reports informed the flaw patterns; they stay outside the repo. Test reports are synthetic.

## Global Constraints
- Synthetic data and the fake model only. Never contact inspectors (the homeowner gets a request to send themselves), no deploy, no payment, no protected standard text. ASTM D7338 is named only as a possible reference (LEGAL_REVIEW L20).
- Decisions C01-C10 stay. Requirement IDs stay stable. No pass/fail and no scoring of inspectors.
- Voice rule (`docs/expert/VOICE_RULE.md`, decided by Cory): warm, plain, clearly an issue. A test checks every question and record request against it (starts from what was covered, no "failed"/"missing", phrased as a question, no accusation).
- The wording of every question goes through the existing wording rules. Gaps are phrased as questions ("What dry standard was used to call this wall wet?"), never accusations.
- Types check and tests pass before each next task.

## What each checklist item carries (the data file)
`id` (stable, never reused), `group` (seen, moisture, smell, sampling, scope), `topic`, `question_for_report` (what the program looks for), `leading_question` (what the homeowner asks), `record_request` (the "can you share" line), `materiality` (how it is ranked), `applies_when` (for example, only when something is called wet).

Materiality is set by code with one rule: if a conclusion or recommendation in the report depends on the unsupported claim, the gap is material and goes to the leading questions on page 1. Otherwise it is minor and goes in the notes.

## Tasks

### Task 1: The checklist as data
Files: `data/rules/inspection_checklist.json`, `packages/domain/src/inspection/checklist.ts`, `test/inspection/checklist.test.ts`.
- [x] Failing tests: every item has all fields; ids are unique; wording of every question passes the wording rules; an unknown group or materiality rule is refused; adding an item needs no code change (a test loads a list with an extra item).
- [x] Write the file from Cory's peer-review guideline (74 starting items in 13 groups), the loader, and validation. Typecheck, test, commit "Brick 17.1: inspection checklist as data".

### Task 2: Status per item (AI points, code decides)
Files: `data/rules/prompts/review_inspection.v1.md`, `src/inspection/reviewItems.ts`, tests.
- [ ] Failing tests: the model returns, per item, the exact words from the report and the page; code checks the words with `findAnchor` and sets the status: addressed (verified words), partly addressed, not addressed (no words, or words not on the page). A model reply with its own status, approval, or extra fields is refused. Hostile text in the report changes nothing. A model failure leaves the item "not checked", listed, never "not addressed".
- [ ] Implement with `runStage`, one repair, fail closed. Commit "Brick 17.2: item status".

### Task 3: Consistency and support checks (no AI)
Files: `src/inspection/consistency.ts`, tests with synthetic fixtures shaped like the two samples.
- [ ] Failing tests, one per pattern: something called wet with no reading; a reading with no dry standard (on-site dry spot or a named general standard); a result listed under one location but cited for another (the mislabeled-location pattern); "no moisture detected" next to a chronic-moisture conclusion with no explanation; a recommendation with no evidence behind it; a surface sample with no control; cabinet or cavity samples compared with room air; no outdoor comparison; a claim stated more firmly than its evidence.
- [ ] Implement as pure functions over evidence and claims. Each returns what it found and the evidence ids. Commit "Brick 17.3: consistency and support checks".

### Task 4: Gaps become drafts, wired into the pipeline
Files: `src/inspection/gaps.ts`, change `src/pipeline/analyze.ts`, tests.
- [ ] Failing tests: each gap becomes a draft clarification finding with the leading question and the record request; materiality follows the one rule; wording is re-checked; anything held back is listed; the reviewer sees every gap and can remove or reword it; a completeness list (answered, can be supplied, not established) is carried on the release for the summary page.
- [ ] Wire into `runAnalysis` between extraction and the proposal step. The summary page shows the completeness list (confirm the layout with Cory using the proof sheet before locking it). Commit "Brick 17.4: gaps to drafts".

### Task 5: Intake question, end to end, proof
Files: `data/rules/` intake question, `test/pipeline/inspection.test.ts`, proof sheet.
- [ ] Add one intake question: which records the homeowner received (full lab report, field photos, meter readings, field notes, chain of custody). The answer sets which gaps are likely missing paperwork.
- [ ] End-to-end test on two synthetic reports modelled on the real samples: a thin report with several gaps and a complete one with none. Checks the trace from a sentence to a gap question to the page-1 list. Adversarial: hostile text, a scan, a model failure.
- [ ] Proof sheet for Cory; update ROADMAP, coverage maps for tests that exist, `npm run check`, push, confirm CI green.

## Open items on Cory (do not block the build)
- Confirm or reword the 17 starting questions (I2).
- Review the proof sheet and the summary-page layout of the completeness list.
- Attorney: L20 (naming the standard).

**Exit:** a synthetic report comes back with a completeness list and the questions to send the inspector, and a recommendation with nothing behind it is flagged. Next: Brick 18 (corrections to our own errors).
