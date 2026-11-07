# Phase 0-F: Acceptance plan

Source: the supplied `05_ACCEPTANCE_SCENARIOS.json` (AC-01 to AC-28, all `proposed_not_executed`). Nothing below has been run. All tests use synthetic documents and are written test-first after Cory approves the slice.

"Existing" means a test already covers part of it at HEAD `b04c388` (named when I know it). Everything else is new. Coverage I did not check is marked "not verified".

| AC | Scenario | Layer | When | Notes |
|---|---|---|---|---|
| 01 | Scope before completeness | check + interview | Phase 3 | Quiet: no attic criticism until scope is confirmed (C03). Same intent as the IEP-K-001 T2 fix |
| 02 | Promised work not documented | check | Phase 3 | Never say "not inspected" |
| 03 | Two valid conflicting anchors | check | Phase 3 | Needs the two-verified-passages rule (the five contradiction checks, not yet built) |
| 04 | Different-time statements | check | Phase 3 | Quiet negative: wet and dry at different dates is not a contradiction |
| 05 | Single-sided contradiction | check | Phase 3 | Rejected; question or silence |
| 06 | Qualitative documentation | check + done_well | Phase 3 | No praise for numbers that are not there |
| 07 | Supported positive item | done_well | Phase 3 | Narrow acknowledgment, no certification |
| 08 | Unreadable relevant page | check | Phase 3 | Existing for unreadable-page silence (not verified for OCR-uncertain values). Candidate regression below |
| 09 | Lab background qualifier | check | Phase 3 | Keep the qualifier; no universal duration |
| 10 | Documented method mismatch | check | Phase 3 | Needs a permitted, verified method source |
| 11 | Unjustified cause | check | Phase 3 | Map support, alternatives, timing |
| 12 | Localized vs building extent | check | Phase 3 | No spread through adjacency alone |
| 13 | Client later supplies repair history | interview | Slice (add tests) | Existing: answers carry a tag and `report_changed` is always false (`interview/result.test.ts`). Add: dated statement, not marked verified |
| 14 | Overlooked supplied attachment | revision | Later | Not built: no attachment-set or versioned correction for a missed input. `revision.ts` classifies finding changes only |
| 15 | Duplicate source editions | vault import | Phase 1 | Distinct versions, explicit relationship, no URL-only merge |
| 16 | Rights not established | pack + rights | Slice S3 | Existing: `references/rights.test.ts`. Add: pack build refuses |
| 17 | Imported AI summary | pack | Slice S3 | Stays draft; repetition adds no authority |
| 18 | Old fixture results after edit | status | Slice S2 | R3 in the audit |
| 19 | Draft export attempt | pack | Slice S3 | Excluded with a reason; `production_enabled` never toggled |
| 20 | Prompt injection in text | scan + pack | Slice | Existing: `ingest/suspicious.test.ts`, `pipeline/suspiciousFlow.test.ts`. Add: vault and pack text treated as untrusted |
| 21 | Deterministic calculation | calc | Not verified | ADR-003 calculation records exist; I did not check the not-computable path |
| 22 | Vault failure or incompatible pack | pipeline | Slice S4 | Last valid pack or `needs_attention`; never drafts |
| 23 | Automatic release remains gated | release | Slice (regression) | Existing: `autoReleaseGates.test.ts`, `autoRelease` tests. Add golden comparison with the flag off |
| 24 | Summary / markup consistency | render | Slice S5 | One id and number everywhere. See candidate regression below |
| 25 | Useful interview stopping | interview | Slice (add tests) | Existing: `interview/flow.test.ts` (skip, stop, unknown, no repeat). Add: no leading prompt after unknown |
| 26 | Approved source revoked | pack | Slice S3 (block) / later (impact list) | New use blocked in the next pack. Listing affected cases needs the pack hash on each case (S4) |
| 27 | Fixture semantic mismatch | status | Slice S6 | Flag IEP-K-001 T2; a mechanical pass is not semantic validation |
| 28 | Private vault access | access | Phase 2 | Needs the reviewer registry and an authenticated identity; Johnathan |

Extra tests I am adding because of the audit (R2-R4): a decision by an unregistered name is ignored; two accepts from one registered reviewer count once; one IEP accept plus owner approve is not approved; a fixture runner result for an older content hash does not count.

## Candidate regression issues from the handoff (not executed)
Checked only against the committed synthetic proof `docs/proofs/sample_marked_up.txt`, which may predate HEAD behavior:
- Unreadable page prompting a generic history question: visible. Item 7 ("Scanned page cannot be read") carries "Possible next step: Ask for the supporting history."
- Item numbers differ: visible. The "Questions to ask the inspector" list numbers 1-3, the items below use ids 1-7, and the same question has two different numbers.
- Same generic next step on every item, including the positive one: visible.
- Closet inconsistency without two located passages, praise for measurements that may only be qualitative, summary wording stronger than the margin question: not checkable from the text alone.
These become tests only after I regenerate the sample at HEAD and confirm they reproduce.

## Exit rule for the first slice
AC-13, 16, 17, 18, 19, 20, 22, 23, 24, 25, 26 (block), 27, plus the reviewer-registry tests above, and the existing 825 tests.
