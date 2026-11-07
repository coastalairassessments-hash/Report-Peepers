# Settings the engineer chose that are not in Cory's confirmed decisions (audit 2026-11-07)

Cory's confirmed decisions are C01-C10 (docs/spec/DECISIONS.md) plus ADR-001 to ADR-006 and P01. Everything below was set by the engineer. Each is Cory's to approve, change or delete. Nothing is deployed, so nothing has reached a customer.

## Could affect what a customer gets (look at first)
1. Review depth caps (`data/rules/markup.json`): at most 15 review questions and 5 leading questions. Extra questions are dropped by rank. A real gap could fall below the cut. Fix to consider: list the dropped topics under "not checked".
2. Stuck cases (`autoRelease.ts`, `pipeline.json`): a case goes to needs_attention and nothing is released if more than 25 questions are held back, any page is unreadable, any page has hidden or instruction-like text, or any quote cannot be matched. A paying customer could get nothing and no person is assigned. Needs a rule for who handles these (refund or manual review).
3. Page limit (`limits.json`): 150 pages per report. A real 219-page report was already received for testing and would be refused. Needs Cory's number.
4. Customer-facing wording not yet reviewed by Cory: inspection_checklist.json (104 items, status draft), gap_wording.json, context_questions.json, and the six new check texts (cross_checks / gap_wording). Only the interview notes are gated behind an "approved" flag. Fix to consider: one approved flag per wording file so unreviewed text can never be released.
5. Automatic-release statements (`autoRelease.ts`): "This is an automated second look... not an expert opinion" and "No person reviewed this release." Engineer wording, needs Cory and the attorney.
6. Suppression rules (`scope_effects.json`, `context_expectations.json`): a limit the client describes can silence a question about a related gap. The order and which limits silence what are engineer drafts; a wrong entry hides a real gap.
7. New cross-check patterns (`cross_checks.json`, draft): pattern matching can misfire on unusual report layouts. They need two quotes to fire, but they have not been tested on real reports.

## Approval settings
8. Two licensed reviewers plus the owner before a library rule is live (engineer choice, 2026-11-05). Keeps all 56 rules off. Cory to decide.
9. Reviewer list (`data/knowledge/reviewers.json`, new today): only listed people count. Only Cory is listed.

## Low risk (operations; proposed targets under D06)
10. Private link 14 days, code 10 minutes, 5 wrong codes, session 60 minutes (`access.json`).
11. Upload limits: 10 documents, 50 images, 25 MB each, 100 MB total (`limits.json`).
12. Image reading: read images when fewer than 40 words, accept lines above 60 percent confidence, 80 pages, 400 dpi (`ocr.json`).
13. Reading worker: 60 s timeout, 500 pages (`worker.json`).
14. Red-ink layout numbers (`markup.json`).
15. Hidden-text rules: text under 2 pt, partly off-page, or phrases like "ignore previous instructions" hold the case (`suspicious_content.json`).
16. Wording filters (accusation, motive, over-certainty word lists in `integrity.ts`): built from Cory's expert-witness instruction; word lists are the engineer's. They can only hold back a question, never release one.

## Switched off or hidden
17. Knowledge pack mode is `off`. Interview outcome notes are hidden until Cory approves each.
