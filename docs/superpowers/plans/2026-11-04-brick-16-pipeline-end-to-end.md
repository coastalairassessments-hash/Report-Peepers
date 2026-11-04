# Brick 16: The Pipeline End to End (Milestone 2 core) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** One synthetic report goes in and a released, marked-up review plus a saved anonymous record comes out, with every step moving the case through the real state machine and every gate enforced. This is the spec's Milestone 2 vertical slice (scope confirmation, provenance, revisions).

**Architecture:** A thin layer of step functions in `packages/domain/src/pipeline/`. Each step loads a case through a repository port, checks the state guard with `transition`, calls the pieces that already exist, saves, and returns. No step contains new science or new rules: it only orders and gates what Bricks 1-15 built. Everything outside the domain sits behind a port with an in-memory version: case repository, file store, entitlement check, model, clock, ids. No vendor, no network, no payment.

**Spec:** MASTER_SPEC sections 6, 15.2, 18, 20, 22; `docs/spec/workflow_transitions.json`; ADR-001 to ADR-005.

## Global Constraints
- Synthetic data and the fake model only. No real model call, no payment code (entitlement is a fake yes/no fact, as in the state machine), no inspector contact, no publishing outside the in-memory store, no deployment.
- Every state change goes through `transition` with real facts. A step that skips a state, or whose guard fails, changes nothing and says why.
- Access is enforced at the repository from the start: every call carries an actor (customer, reviewer, system). A customer sees only their own cases; a reviewer only cases assigned to them; no one edits a released case.
- The AI never approves, releases, or sets a reviewer. A human decision object is the only thing that can publish, and it is checked against spec 15.2 (scope confirmed, entitlement, no unresolved material ambiguity, no prohibited claim, human approval recorded).
- Anything the earlier stages held back (extraction, proposals, integrity) is shown to the reviewer and must be acknowledged; nothing is dropped quietly.
- After release the snapshot is locked by fingerprint; any later change fails export. Exports (marked-up PDF, text, record) come only from the locked release.
- Types check and tests pass before each next task. Commit after each task.

### Task 1: Ports, repository, actors
Files: `pipeline/ports.ts`, `pipeline/repository.ts` (in-memory), tests.
- Case record: id, owner, state, snapshot, source file reference and hash, processing issues, published fingerprint. In-memory file store, fake entitlement, injectable clock and ids.
- [ ] Failing tests: customer isolation (cannot read, list, or change another's case), reviewer sees only assigned cases, released cases are read-only, state only changes through `transition`, a returned case is a copy.
- [ ] Implement, test, typecheck, commit "Brick 16.1: ports and access".

### Task 2: From upload to ready for analysis
Files: `pipeline/intake.ts` (start, answer, confirm scope, entitlement), tests.
- Upload runs `preflight` against the limits file; a rejected file never enters the case. Questions come from the existing bank; scope confirmation uses `confirmScope`; conditional confirmation allowed and recorded.
- [ ] Failing tests: the full path draft to ready_for_analysis; each wrong order refused with the state machine's reason; unconfirmed scope, missing entitlement, or incomplete preflight each block; a scope conflict blocks until resolved.
- [ ] Implement, test, typecheck, commit "Brick 16.2: intake to ready".

### Task 3: The analysis step
Files: `pipeline/analyze.ts`, tests.
- Reads the document, builds the version 0.2 snapshot skeleton (documents row with the file hash, scope, one property-level area, provenance from the audit records), runs extraction (Brick 15), proposal and `applyProposal` (Brick 11), `checkIntegrity` and `checkAnchors`. Held-back items and page issues are stored as processing issues.
- [ ] Failing tests: skeleton validates against contract v0.2; a clean run reaches awaiting_reviewer; every page failing, or a model error, goes to failed with the reason and no snapshot guess; a scanned page and a hostile page are listed; findings reach the snapshot only as unapproved drafts; rerun after failure follows the retry guard and attempt cap.
- [ ] Implement, test, typecheck, commit "Brick 16.3: analysis step".

### Task 4: Reviewer decision and release
Files: `pipeline/release.ts`, tests.
- The reviewer's decision: which drafts to include, optional wording edits (re-checked with the integrity wording rules, recorded as reviewer-changed), a pattern tag per item (Brick 14), conflict disclosure where required, and an acknowledgment of everything held back. Approval sets the human-review fields, locks the fingerprint, moves to released, then produces the marked-up PDF and text (Brick 13) and the saved record (Brick 14), once.
- [ ] Failing tests: no human approval means no release; a decision by someone not assigned is refused; an edit that breaks a wording rule is refused; unacknowledged held-back items block; an edit after release makes export fail; the record is made once and holds no case link; the marked-up PDF passes its verifier; partial release states its coverage limits.
- [ ] Implement, test, typecheck, commit "Brick 16.4: reviewer decision and release".

### Task 5: The slice end to end
Files: `test/pipeline/slice.test.ts`, proof sheets in `docs/proofs/`, roadmap, notes.
- [ ] One test runs the whole chain on a synthetic report and checks the trace: an original sentence on a page becomes evidence with an anchor, supports a finding, appears as a numbered mark and note on that page of the marked-up copy, and is listed on the summary page.
- [ ] Adversarial cases in the same file: a stranger's access attempt, a hostile-text report, a scanned page, a model that fails twice, a post-release edit.
- [ ] Proof sheet of the finished slice for Cory; coverage maps only for tests that exist; `npm run check`; push; confirm CI green.

**Exit:** a synthetic report becomes a released marked-up review and an anonymous record, with access controls and every gate proven by tests. Next: Brick 17 (corrections: supersede a release, corrected marked-up copy, change notice), then real storage (Brick 18) after a stack decision and Jonathan's security review.
