# Product Decisions and Implementation Defaults

## Confirmed decisions

C01 The customer buys a nominal-fee document review. No inspection, remediation, consultation, referral, or lead-generation upsells are part of this product.

C02 No pass/fail, compliance percentage, inspector score, public ranking, or guaranteed adverse findings.

C03 The first substantive questions establish the client's goal and engagement restrictions, including time, sample count/type, budget, methods/equipment/materials, areas, and access. Confirm context before criticizing omissions.

C04 Interpret documented evidence within the agreed scope, but independently test whether conclusions exceed that evidence. Missing documentation is not proof of unperformed work.

C05 Review visual observations, spatial extent, material readings, surveys, environmental measurements, spot versus monitored data, sampling, causation, and remediation justification as one connected reasoning chain.

C06 Explain where impact is documented, possible, not indicated within an assessment, unassessed, or unclear. Silence never becomes confirmed unaffected or confirmed contaminated.

C07 Review physical cleaning, chemical purpose, material removal, work boundaries, source correction, and verification. Identify inadequate or insufficiently justified work without inventing a replacement protocol.

C08 Give explanations, questions for the inspector, possible next steps, and stopping conditions. Recognize reasonable judgments and alternative interpretations.

C09 Use verified, permitted references without reproducing standards text in customer output. Publisher permission and applicable context are distinct from merely naming a publication.

C10 Additional information can resolve, change, or retract a finding. Preserve revisions and the reason for change.

## Proposed engineering defaults

D01 Initial module: English residential mold/moisture assessments plus related protocols, labs, and supporting photographs. Standalone PRV and broader IH disciplines are deferred.

D02 Workflow: free preflight and scope intake, confirmed purchase terms, payment, scientific review, internal pilot approval, release, included clarification.

D03 Architecture: modular web/API application plus isolated parsing and analysis workers, relational evidence records, private object storage, durable queue, and provider adapters.

D04 Stack proposal: TypeScript web/API, Python scientific/document workers, PostgreSQL, S3-compatible storage, JSON Schema contracts. No vendor accounts or package versions have been selected.

D05 Pilot: every released result receives qualified human review internally; this is not a customer upsell. No person has accepted a reviewer role through this conversation.

D06 Intake and page/image limits, clarification allowance, retention periods, operational service levels, evaluation thresholds, and pilot cohort sizes in MASTER_SPEC.md are proposed targets pending approval.

D07 No default numerical health thresholds, universal sampling counts, mandatory surveys, demolition dimensions, or instrument checklists. Case-specific sufficiency governs.

## Release dependencies

G01 Publisher permissions for intended AI processing and referencing, including restrictions on uploaded protected publications.

G02 Actual service and representations reviewed for professional-practice, legal, privacy, insurance, and jurisdiction boundaries.

G03 Accountable scientific owner, appropriately qualified reviewers, approved rule packs, reference mappings, and scientific evaluation.

G04 Technical authorization, payment reconciliation, secure processing, correction, retention, deletion, and recovery verification.

G05 Final fee, included service limits, turnaround, refund and support terms, product identity, and accepted customer jurisdictions.

## Architecture decision record template

Record ID, date, status, decision owner, problem, options, chosen approach, reason, consequences, affected requirements, migration/reversal plan, and evidence of verification. A new AI may propose defaults but must not silently rewrite confirmed decisions.

## Change discipline

Keep requirement IDs stable. Retain original source context. Record a spec version and change log. Resolve contradictory documents before implementation rather than selecting whichever is easiest. Product constitution changes require an explicit owner decision; technical defaults may be changed with a reasoned decision record.

## Standing design principles (added 2026-11-07, Cory)

P01 Build as if every released conclusion may be examined by an expert witness: traceable to evidence, method and rule versions recorded, limits stated, reproducible from retained results. Never accuse any person or company, including an inspector, of bad intent, motive, concealment or careless effort. Questions only. Enforced in code by the wording filter (`wordingProblems`: prohibited accusations, motive and intent wording, over-certain wording). C01-C10 are unchanged. No software guarantees an outcome in court, and neutral wording does not by itself remove liability; the attorney list covers exposure.

## Cory-approved engineering settings (audit 2026-11-07, docs/ENGINEER_DEFAULTS_AUDIT.md)
E01 (2026-11-07) Review shows at most 15 questions, at most 5 on the first page; questions past the cap are dropped without a notice. Approved as is.
E02 (2026-11-07) A free first look at upload (docs/PLAN_FIRST_LOOK.md): the program classifies the file; a lab-only or unclear file is asked "Is this the only part of the report you have?"; a lab-only file where that is all they have closes with a polite fixed message and no charge. Fully automatic, no person per report (ADR-006).
E03 (2026-11-07) For a lab-only upload where the customer says it is all they have: offer a choice of taking the file back with no charge, or a general outline of what a full report commonly covers at half the review fee. This is an exception to C01's "no upsells" decided by Cory; the attorney should review it before launch.

## E04. Reports are never held (Cory, 2026-11-07)
Cory: "no fails so no reason to hold reports we review and use insightful questions." / "i never had to hold back reports ever."
- Content problems are filters, not gates: a quote not found on its page drops only the findings resting on it; unreadable pages are listed as not checked; hidden or instruction-like text is recorded and ignored; the held-back count no longer blocks (config `auto_release.max_held_back` is now unused).
- A file with no readable page is handled at the first look (no charge), not at release.
- Still stops, with automatic retry: file altered since receipt, payment not verified, review data corrupt or off-contract, program could not re-read the file, our own text breaking the wording or no-citation rules (a program fault).
- Code: `packages/domain/src/pipeline/autoRelease.ts`; tests `autoReleaseGates`, `autoRelease`, `suspiciousFlow`.

## E05. Read every page (Cory, 2026-11-07)
Cory chose: read every page of a long report. Page limits raised from 150 (file refused) and 80 (scanned pages read) to 500, the reader's own ceiling (`data/rules/limits.json`, `ocr.json`). The 500 is a safety ceiling, not a product rule: a file over it is refused with a plain message. Johnathan: check reading time and cost on a 300+ page scan.

## E06. Extra pages are charged (Cory, 2026-11-07)
Cory: "anything over 150 pages we charge for additional pages." The flat fee covers the first 150 pages; each page past 150 is charged. Amount per page: $0.26 (Cory, 2026-11-07; the $39 flat fee divided by 150 pages). Example: 219 pages = $39 + 69 x $0.26 = $56.94. Page ceiling stays 500 (E05). Not built yet: needs the amount and the quote-at-upload step (customer sees the total before paying). Related to C-series flat-fee decision: this is an exception to be recorded with the attorney list.
