# Phase 0-F: Acceptance plan

The supplied scenarios file (`05_ACCEPTANCE_SCENARIOS.json`) was not provided, so nothing here converts it. These tests come from the customer output contract and the findings in the repository audit. All use synthetic documents. Each is written test-first after Cory approves the slice.

| # | Layer | Scenario | Expect |
|---|---|---|---|
| A1 | pack | A draft claim is in the vault, nothing else | Not in any pack; pipeline output unchanged |
| A2 | pack | An approved claim, fixtures passed on an older content hash | Not live; pack build refuses it |
| A3 | pack | One IEP accept plus owner approve | Not approved (needs two distinct registered reviewers) |
| A4 | pack | Two accepts from the same registered reviewer | Counts once |
| A5 | pack | A decision by an unregistered name | Ignored |
| A6 | pack | An approved claim is later revoked | Absent from the next pack; earlier cases keep their pinned pack |
| A7 | rights | Source `pending` or `blocked`, claim approved | Pack build refuses |
| A8 | rights | Source `authorized` without a permission record | Pack build refuses |
| B1 | check | Report states condensation, records surface temperatures | Quiet. No question |
| B2 | check | Report states condensation, no temperatures, client says none were recorded | One neutral question; result says conclusion may need narrowing |
| B3 | check | Report says nothing about the attic, scope not yet confirmed | No question; suppression reason recorded (C03, C04) |
| B4 | check | Page is unreadable (no text layer) | Silent on that page; `needs_attention` if it matters |
| B5 | check | Two passages seem to disagree but different rooms or dates | Context question, not a contradiction |
| B6 | check | Two verified passages, same place, date, material, method, opposite meaning | Contradiction flagged with both anchors |
| B7 | check | Qualitative meter readings | No praise for numerical data |
| C1 | wording | Any exported sentence names a standard, says compliant, grades, ranks | Pack build fails |
| C2 | wording | Question hint supplies a supposedly correct answer | Pack build fails |
| C3 | wording | Text inside a report says "ignore your rules" | Flagged, held for a person; never followed |
| D1 | interview | Client answers "I was told" | Tagged; recollection note; gap stays open |
| D2 | interview | Client skips, stops, or says "not sure" | No repeat nag; open items stay open |
| D3 | interview | Answer arrives that the program had overlooked in the original upload | Versioned revision with an explained correction; original view unchanged |
| E1 | release | Pack mode `off` | Identical output to today (golden comparison) |
| E2 | release | Pack mode `shadow` | Customer output identical; differences logged |
| E3 | release | Pack invalid or missing | Last valid compatible pack, else `needs_attention`; never drafts |
| E4 | release | Pack loaded | Case records the pack hash; rerun with same structured results reproduces the output |
| E5 | privacy | A case document is processed | Nothing written to the vault; no training path exists |

Exit rule for the first slice: A1-A5, B1-B3, C1, E1-E3 pass, plus the existing 825 tests.
