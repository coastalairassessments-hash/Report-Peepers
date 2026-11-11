# Looky Lou: attorney briefing (working name; pending trademark clearance)
Prepared 2026-11-05 for review by counsel. Not legal advice. Every draft in this folder is a starting point for the attorney to rewrite, not a document to use as written. Items in [brackets] are open.

## 1. What the service is, in one paragraph
A homeowner uploads a mold or moisture inspection report they received from an inspector. The service reads it and returns a marked-up copy plus plain-language questions the homeowner may ask the inspector, a list of what the report did correctly as customary practice, and a list of topics not expected given limits the homeowner described. Flat fee. No pass/fail, no score, no ranking, no referral, no upsell. It is a document review, not an inspection, an expert opinion, a legal or medical opinion, or a determination that a building is safe.

## 2. What it does not do (the product's own limits)
- No inspection, sampling, remediation, referral to contractors, or sale of other services in this product.
- No score, grade, pass/fail, or compliance statement about an inspector or a report.
- No license, independence or legal-compliance audit of the inspector.
- No health conclusions. Client notes about health are context for why the inspection happened and are never evaluated or tied to the report.
- No statement that a report "meets" or "conforms to" a standard or "industry guideline." Customer-facing words say "common practice."
- No contact with inspectors by us. The homeowner asks the questions.

## 3. How a review is produced (data flow)
1. Homeowner emails or uploads the report (PDF) and answers background questions (buttons plus optional notes, all in past tense).
2. The file is read by software (text, and OCR for image pages). Report text is treated as untrusted data.
3. An AI model proposes structured candidates (what the report says; what looks supported or missing). Plain code decides what is allowed: every quote must match the report word for word, every sentence passes a wording filter, and unreadable pages make the checks stay silent.
4. Questions are built from fixed templates plus the report's own words with page numbers. The AI writes no free-form text to the homeowner.
5. [Decision ADR-006, 2026-11-05] No person reviews each report before release. Release is automatic if all checks pass; if any check fails nothing is sent and the case waits. A person can be added back later by a setting.
6. The homeowner receives the marked-up report and the question list.
7. Uploaded documents are deleted on a schedule [proposed: 90 days; backups 35 days]. Only anonymous flaw-pattern counts are kept (ADR-002, ADR-005).

## 4. Voice rules that limit exposure
Warm, plain, never accusing. Gaps are phrased as questions with a reason. Words such as "wrong," "miscited," "failed," "negligent," "compliant" are not used. Missing information is never treated as proof that work was not done. See docs/expert/VOICE_RULE.md.

## 5. Business relationships to disclose
Cory (J. Cory) owns ArcSys LLC, which also develops IndoorIQ (inspection reporting software), and operates Coastal Air Assessments, a licensed mold assessor business. Report Peepers is intended to (a) help homeowners understand reports, (b) over time encourage better reports, and (c) produce anonymous trend counts that inform IndoorIQ. IndoorIQ is not promoted inside the homeowner review. [ATTORNEY: required disclosures; whether "independent second opinion" can be claimed.]

## 6. Questions for counsel
Existing list: docs/LEGAL_REVIEW.md (L01 to L20). Highest priority for launch, plus new items:
1. Is a flat-fee document review of a licensed inspector's report a regulated activity in Florida or other states we accept? What marketing limits apply? (L02, L12)
2. Defamation and fair-comment exposure when we publish questions and marks about a named inspector's work to the homeowner. Are the question-only format and quoted-report-text design enough? (L03, L17)
3. Right to upload and to return a marked-up copy of the inspector's report: copyright, confidentiality clauses in inspection contracts, license grant wording. (L04, L16)
4. New: Release with no human review (ADR-006). Does automation change the exposure, the disclaimers, or the insurance position versus human review? What must we say about it? [L21]
5. New: Can we describe the service as "independent" or "unbiased" given the IndoorIQ relationship? Required disclosure wording. [L22]
6. New: Limitation of liability, no-reliance, and assumption-of-risk wording that is enforceable for consumers. Arbitration, venue, governing law. [L23]
7. New: Client background notes may mention health. Handling, retention, and any privacy-law triggers; whether to collect at all. [L24]
8. New: Accuracy errors. If the software misreads a report or asks a misleading question, what remedies (refund, correction) should the terms promise? [L25]
9. New: Anonymous pattern counts and sharing trends with IndoorIQ: consent wording and minimum group size. (L05, L09, L18)
10. New: Use of the output in a dispute or lawsuit: disclaimers that it is not expert opinion. (L15) [L26: whether Cory, as a licensed assessor, should be named anywhere on the product.]
11. Insurance needed before launch (professional liability/E&O, cyber). (L11)
12. Minors, accepted states, refunds, turnaround, trademark. (L07, L08, L14)
13. Standards publishers: permission for AI use; our checklist is in our own words; guideline database stays internal and is never shown as citations. (L01, L20)

Cory's own questions: [ADD HERE]

## 7. Folder contents
- 01_DRAFT_TERMS_OF_USE.md
- 02_DRAFT_ACKNOWLEDGMENTS_AND_NOTICES.md (click-through checkboxes and the notice printed on every released review)
- 03_DRAFT_PRIVACY_AND_RETENTION.md
- Product record for reference: docs/spec/DECISIONS.md, docs/decisions/ADR-001 to ADR-006, docs/expert/VOICE_RULE.md, docs/proofs/inspection/README.md (sample output, synthetic data)


## Safeguards added 2026-11-11 before your review (all are proposals for you to confirm or change)
1. No praise or approval of anyone's work, and no grading. The software blocks accusation, motive, certainty, and now praise ("done correctly," "thorough job," "meets requirements") in its own words. The marked-up copy's heading changed from "Done correctly, as customary practice calls for" to "What the report states clearly." Stars on the marked-up copy mean "stated clearly," are never counted, and are not a rating. [Q: is "states clearly" safe, or should it go further?]
2. Notice. Every marked-up copy and release now carries the full short-form notice: document review by software, no inspection or expert, legal, insurance or medical opinion, no view on safety or whether anyone's work was proper, questions are suggestions, check image-read words, customary practice not a published standard, for your own use.
3. Upload acknowledgments are enforced in the software, not only drafted: a case cannot start until four items are accepted (lawful copy, software review, no person reviews before delivery, terms and privacy read, including no public posting). The version, items and time are recorded per case. Draft text in `data/rules/acknowledgments.json`.
4. Legal hold. A case under a dispute or legal notice can be marked so the 90-day deletion skips it. Only the system can set it. [Q: when must we hold, who decides, what do we tell the customer, and does this fit the 90-day promise?]
5. Public posting by a homeowner is the main spite risk we see. Draft term 7 forbids it. [Q: enforceable? remedies?]
6. Report authors. Draft notice F offers a way to point out a misquote. We never contact authors and never publish. [Q: is any author notice wise?]
7. Still open from before: no-person release (L21), "independent" claim (L22), limit of liability and arbitration (L23), insurance (L11), copyright in marking up a report (L16).
