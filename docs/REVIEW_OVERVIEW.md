# Report Peepers: what exists, who should review it, where to improve

Status 2026-11-05. All data is synthetic or anonymized. 520 tests pass; CI green. Nothing is deployed, and nothing contacts inspectors or takes payment.

## What the product does
A homeowner sends a mold or moisture inspection report. We read it, compare it with what the homeowner told us led to the inspection, and return a marked-up copy with warm, plain questions to ask the inspector. No pass/fail, no scoring, no upsells, no licensing or legal checks. The AI proposes; plain code decides; a human reviewer approves every release.

## What is built (by layer)
1. Rules and contract: contract v0.2, case states, scope intake (Q01-Q13), evidence links, revisions, math checks, defensibility rules.
2. Reading: PDF text with exact page and box anchors; local OCR for image pages (headers read well, table numbers not reliably).
3. AI slot: strict-JSON stages, one repair, fail closed, audit records. Firewalls turn proposals into drafts only if code checks pass.
4. Inspection review: 104-item completeness checklist (13 groups), evidence map per area (seen, measured, sampled, concluded, recommended, cause), 7 self-consistency checks, 5+ report-vs-standard checks, ranked questions (5 on page one, rest in notes), wording filter on every sentence.
5. Client context: 40 past-tense questions with buttons and notes; 11 rules that turn "client said X, report silent" into a question. Health is context only and never used.
6. Output: red-ink markup renderer (Typst), closing summary page, saved anonymous flaw-pattern record.
7. Pipeline: access-enforcing case store, analysis, reviewer release.

## What each reviewer should look at
| Reviewer | Look at | Files |
|---|---|---|
| Cory (field expert) | The 104 checklist items; whether each question reads right; lexicons (what counts as a reading, a sample, a dry standard); the 40 intake questions; the 11 expectation rows | data/rules/inspection_checklist.json, consistency.json, self_consistency.json, evidence_map.json, gap_wording.json, context_questions.json, context_expectations.json |
| Jonathan (engineering, security) | Access rules, untrusted-text handling, hidden-text detection, isolated parsing worker, stack choice before storage | packages/domain/src/pipeline, ingest |
| Attorney | Terms, disclaimers, voice rule, small-group counting, retention (ADR-002), attorney list L1-L20 | docs/LEGAL_REVIEW.md, docs/expert/VOICE_RULE.md |
| A second field professional | Run 3-5 real reports through and judge the question lists | docs/proofs/inspection/README.md |

## Where we can improve (ranked)
1. Real-report accuracy. Lexicons are conservative regexes tuned on 7 reports. Fix: more samples (especially a scan), then tune; hold some back for testing.
2. Lab tables from images. OCR numbers are unreliable, so those items become "please confirm" and ask for the original file. Fix: a second reader for image-read numbers.
3. Five contradiction checks still open: cover count vs sections, "confirmed" next to "needs a lab", rating rule with no reading, instrument missing from equipment list, number vs its own stated standard; plus "refers to an attachment not in the file".
4. Security gaps. Customers can read unapproved drafts while awaiting review; hidden-text detection and the isolated parsing worker are not built.
5. Question quality. Reviewer cannot yet remove or reword a question (reviewer console). Page-one layout of the released PDF is unconfirmed.
6. Missing screens. Client intake screens, homeowner screens, reviewer console. Email intake (reports arrive as emailed PDFs).
7. Business inputs. Fee and terms (I5), insurance, stack decision one-pager.
8. Measuring it. No scorecard yet on how often a question is judged useful versus wrong by a reviewer. Add a thumbs up/down per question to learn which rules to tune.

## Suggested next bricks
A. Finish the five contradiction checks. B. Reviewer console (remove or reword questions, with a record). C. Client intake screens. D. Email intake and storage (Brick 19+).
