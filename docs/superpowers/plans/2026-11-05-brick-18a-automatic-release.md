# Brick 18a: automatic release and the review in the released document

Decision: ADR-006 (no person per report; release mode is a setting).

## What I found
1. The released PDF still comes from the older findings flow, which needs a reviewer's decision. The new review (page-one questions, notes, done well, not expected, not checked) lives on the case record and is not in the released document yet.
2. Human approval is written into three places: the contract (`human_review_status`), the integrity rules (`publish_without_human_approval`, `published_finding_unapproved`, `departure_without_human_approval`) and the case state machine (`humanApprovalRecorded`).

## Logic (plain)
Automatic means the checks do the reviewer's job. If every check passes, the review is released. If any check fails, nothing is sent: the case goes to "needs attention" and waits. It never releases a half-checked review.

## Tasks (tests first, tsc and tests green between each)
1. Contract v0.3: `human_review_status` gains "automatic"; release gains `release_mode`. v0.2 cases still validate. `validateCaseSnapshot` routes by version as before.
2. Mode-aware rules: integrity and the state machine accept automatic release only when the gates below passed; human mode behaves exactly as today.
3. `autoReleaseGates`: pure function. Fails closed if any of these is false:
   - every customer sentence passes the wording filter and the no-citation rule;
   - every quote is found word for word on its page in the source file;
   - the source file hash matches what was received;
   - entitlement verified (stub until payments);
   - no blocking issue (every page failed to read, parse failure, held-back counts above a set limit);
   - findings that need a person (departures) are excluded, not released.
4. `releaseAutomatically`: builds the release from the review plus verified findings, runs the gates, exports once, saves the anonymous record.
5. Render the review pages into the released PDF: page-one questions, notes, "Done correctly, as customary practice calls for", "Not expected given the limits you described", "Not checked". Layout proof for Cory.
6. Tests: hostile report text cannot reach a customer sentence; a failing gate sends the case to needs-attention and releases nothing; human mode unchanged; end-to-end on the synthetic thin and complete reports.

## Not in this brick
Payments, email intake, storage and deletion schedules, citation question check, guideline database (separate plans).

## Open for Cory
When a gate fails, the homeowner waits at "needs attention". What should they be told, and who gets alerted? (Draft: "Your review needs extra time", alert to Cory.)
