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

## E07. Drafted wording is used as written (Cory, 2026-11-07)
Audit item 4. Cory chose: use the customer wording as written now and edit it later. First-look messages, the outline, and the interview notes are switched on. Setting a message or the outline to approved:false (or a gap to ai_draft) still switches it off. Attorney review of the outline (E03) and of the first-look messages remains on Cory's list.

## E08. Automatic-release line stays as written (Cory, 2026-11-07)
Audit item 5. Cory chose to keep: "No person reviewed this release. It was produced and checked by the program." Attorney review of the line stays on Cory's list.

## E09. A budget limit silences nothing (Cory, 2026-11-07)
Audit item 6, first rule. `scope_effects.json`: effects.budget is now empty, so every gap is still asked about. Other limits (areas, access, time, samples, methods, equipment_materials) unchanged and still to be walked through.

## E10. A time limit silences nothing (Cory, 2026-11-07)
Cory: "We want to know as much as possible for the sake of the report." `scope_effects.json` effects.time is now empty. Remaining limits (areas, access, samples, methods, equipment_materials) still silence topics; being walked through.

## E11. No limit silences any question (Cory, 2026-11-07)
Cory: all five remaining limits (areas, access, samples, methods, equipment_materials) silence nothing, same as budget (E09) and time (E10). `scope_effects.json` effects are all empty. The silencing mechanism stays in code, so a later decision can switch an entry on; tests use a sample map (`test/inspection/sampleScopeEffects.ts`). Audit item 6 is closed.

## E12. New cross-check patterns run now (Cory, 2026-11-07)
Audit item 7. Cory chose to run the six cross-check patterns (`cross_checks.json`) now and check them on real reports as they come in. No code change. A misfire is fixed by editing the data file. Audit items 1-7 are closed.

## E13. Cory alone approves a library rule (Cory, 2026-11-07)
Cory chose his approval alone. `statusOf` now returns approved on the owner's approval of the current version; accepts by other reviewers are optional. An edit still makes a new version that needs a fresh approval. A rule still goes live only when approved, all its tests passed, and the knowledge mode is switched on (it is off). The "second reviewer name" question is closed.

## E14. Customer-facing name: Looky Lou (Cory, 2026-11-10)
Cory: "Looky Lou is the name." The character is Lou, the friendly man with glasses and a red marker; look is 1950s, friendly. "Report Peepers" stays only as the internal project and repo name (no code rename). Subject to the attorney's trademark and domain search ("Looky Loo" is a common phrase; "looky-loo" can also mean a nosy onlooker). Site copy uses "look" and not "review" (the product gives no verdict). Red-marker rule (circles, underlines, question notes only; no X or check marks) proposed, not yet decided.

## E15. Red-marker rules for the site and marked-up report (Cory, 2026-11-10)
Cory: the red marks are how someone would review a report. Allowed marks: circles, underlines, question notes in the margin, and stars for what the report does well. Not used: X marks and check marks. A star marks one passage the report did well (it matches the "done well" list). Stars are never counted, totalled or shown as a rating, because the product gives no score (C01-C02).

## E16. Spelling: Looky Lou (Cory, 2026-11-10)
Cory chose the spelling "Looky Lou" (the most common way people spell it), subject to the trademark attorney's clearance search. Lookey Lou and Lookee Lou stay as fallbacks. The GitHub repo is to be renamed Looky-Lou by Cory (settings changes are not allowed from this session).

## E17. Legal-safety pass before the attorney (Cory, 2026-11-11)
Cory asked Claude to act as a legal professional, not an attorney, and tighten what is flagged so the software stays non-accusatory while still giving homeowners enough. Every item is a proposal for the attorney (L31-L35).
- Praise is a verdict too: wording guard blocks "done correctly", "thorough job", "meets requirements" and similar in our own words (quoted words exempt), in review text and in finding text.
- Headings: "Done correctly, as customary practice calls for" is now "What the report states clearly"; "What the report supports" is now "Where the report explains its reasoning"; "Not expected, given the limits you described" is now "Not asked about, because of the limits you described"; "Limits of this review" is now "Limits of this second look". The overview no longer says "does well".
- Notice: the full short-form notice is the method statement on every export, and adds "for your own use in talking with the report's author or your advisers."
- Upload acknowledgments are enforced (`data/rules/acknowledgments.json`, `startCase` refuses with the missing items) and recorded on the case.
- Legal hold: `placeLegalHold` / `liftLegalHold` pause the 90-day purge. Only the system sets it; a released case accepts only that change.
- Drafts updated: terms (no public posting, questions are not statements, "independent" removed pending L22), privacy (hold exception), notice F for report authors, attorney brief, renamed to Looky Lou.
- Open for Cory: who decides a legal hold, and the customer notice when one is placed.

## E18. Keep delivered reports two years (Cory, 2026-11-11)
Cory: "2 years I guess." Retention changes from 90 days to 730 days (supersedes the 90 in ADR-002 and the 2026-11-06 note). The number now lives in `data/rules/retention.json`. A legal hold still pauses deletion for a disputed case. Backups roll off within 35 days of a deletion (unchanged). Trade-off noted to Cory: homeowners' documents are held about eight times longer, so the privacy notice, the breach plan and storage cost must match. Attorney to confirm (L34). Johnathan: call `purgeExpired` with `loadRetentionDays()`.

## E19. Legal hold: Cory decides after talking with the attorney (Cory, 2026-11-11)
Cory chose: a legal hold on a case is placed by Cory after consulting the attorney. Johnathan: the admin action for `placeLegalHold` / `liftLegalHold` is owner-only (Cory's login), never automatic and never available to staff or customers. The customer notice when a hold is placed is still open (L34).

## E20. Reading starts after payment (Cory, 2026-11-11)
Cory chose: the full reading starts after payment, as in the existing state machine (scope confirmation, payment, then analysis). Lou's interview stays before payment. No code change. We never pay for an unpaid reading.

## E21. Interview records who set each limit and what led to it (Cory, 2026-11-11)
Cory: keep asking every question when work was limited; also ask who limited the scope and what made it limited; "we ask all the questions a legal professional would ask, but in a friendly way." Done: new interview question Q14 ("For each limit, who set it, and what led to it?"), asked before Q10 and only when a limit was reported; its answer is saved with the case and shown in the scope summary. Library rule IEP-K-001 edited (new version) to drop the step that held back questions and to record who set each limit. K-001 still needs Cory's approval. Next: draft the fuller set of friendly, legal-minded interview questions for Cory to approve one at a time.

## E22. Interview question Q15: anything in writing before the visit (Cory, 2026-11-11)
First of the friendly, legal-minded interview questions. Cory approved the wording: "Before the inspection, did you get anything in writing about what the inspector would do, like a contract, an estimate, or even an email? If you have it, that helps a lot." Yes / no / not sure. Asked right after "What service were you sold?" The answer is saved with the case. Next ones to be drafted and approved one at a time.

## E23. Interview Q16 and Q17: what the inspector said out loud (Cory, 2026-11-11)
Cory approved the wording and the eight buttons. Q16 (yes / no / not sure): "Did the inspector tell you anything out loud, in person or on the phone, about what they would or wouldn't check? Even a small comment helps." If yes, Q17 shows the buttons (tap all that fit): told me what they would check; what they would not check; how long the visit would be; about a cost or package limit; some areas could not be reached; their findings out loud; something else (I'll type it); I don't remember. Cory: each button opens more questions. The follow-ups are being drafted and approved one at a time; none is built yet.

## E24. Interview and reading run together after payment (Cory, 2026-11-11)
Cory asked for an expert recommendation and chose it: a short scope interview before payment (it confirms what the visit covered and the price, as the state machine requires), then after payment the reading runs in the background while Lou keeps interviewing the client with questions that do not depend on the reading; when the reading finishes Lou asks a small number of questions that come from what it found (capped), then delivery. Target: about 5 to 8 minutes for a normal report; long or scanned reports show progress and send an email link. Johnathan times it on real reports. Not built yet; E20 (reading starts after payment) stands. The full friendly, legal-minded question set is being drafted for Cory to review as one document (docs/INTERVIEW_DRAFT.md).

## E25. Lou's conversation: a fishbone of six areas, built (Cory, 2026-11-11)
Cory: Lou should hold a conversation, with the best intentions, to learn as much as possible from the client's side, to help understand the report and to have the client's account on record if someone blames us; "we could use a fishbone type model to ask the questions." Built: the questions live in `data/rules/lou_conversation.json` and plain code walks them. Six areas (the fishbone bones): What was agreed and said; Why you got the inspection; Who was involved; What was done; The building and the day; What happened since. Each answer can open follow-ups (for example, each "said out loud" button opens its own question). The client may skip any question or stop at any time; a progress view shows how far each area has been covered. Open from payment until the review is delivered, owner-only. What the client types is stored word for word and is never sent to an AI model. It is deleted with the case after the retention period and kept while a legal hold is on. The "said out loud" questions (old Q16/Q17) moved from the pre-payment scope interview into this conversation (C01/C02). The scope interview before payment is otherwise unchanged. Not yet decided: whether answers appear anywhere in the review or PDF (today they do not). Johnathan: build the screens, wire `svc.conversations`, time the 5 to 8 minute flow.

## E26. Anonymous industry data from the questions and the report checks (Cory, 2026-11-11)
Cory: the question pool should be deep, friendly, and deployed to get the most data; the answers can also feed IndoorIQ. He does not want client or inspector information, only data to analyze what people want and what inspectors miss or do not deliver, with the two sides working into each other.
Design (not built): (1) Deployment in four waves after payment: one easy opener per area of the fishbone; deeper follow-ups where earlier answers point, while the report is read; up to five questions that come from what the report says; a closing "anything else you'd like us to know?". Pool of about 120 questions, about 30 shown per client (5 to 8 minutes). Each question is tagged by area, depth, and trigger. (2) Answers cross between areas, and key facts are asked a second way later as a consistency check, never framed as catching anyone. Touchy topics (blame, money, health) come last and are optional. (3) Each question carries a "what people want" tag and each report check a "what the report delivered or missed" tag; both go into one anonymous counts table so gaps can be measured. (4) Kept for analysis: category tags only. Never names, addresses, inspector or company names, or typed text; no link back to a case. Counts and percentages only.
Guardrails and attorney items: results are shown only as industry-wide totals, never by inspector or company (defamation risk); never published or used to contact anyone; the client sees one plain line about counts without their name, and the attorney decides the wording and whether a checkbox is needed; tags are counted, not used to train a model, so the "never train on customer documents" rule stands. Next: draft the question pool for Cory's review (format: one area at a time or all six, his choice).

## E27. Target time is 10 to 15 minutes, and Lou also asks questions from the report (Cory, 2026-11-12)
Cory: Lou also asks questions as he reviews the report; the whole thing should take about 10 to 15 minutes from start to finish, so the client feels they got their money's worth and that we are on their side and here to help, like a neighbor. This replaces the 5 to 8 minute target in E24. Effects: about 45 to 60 answers per client instead of about 30 (taps take seconds, typed answers longer); the pool stays at 120 questions (opening group plus six areas, in the review page). The earlier cap of 5 report-driven questions is open until Cory decides. Johnathan times the flow on real reports.

## E28. Making Lou a trusted friend: proposed list (Cory asked, 2026-11-12; each item awaits Cory's approval)
Proposed, none built: (1) say plainly Lou is software and what it cannot see; (2) read back what we heard, with a fix button; (3) say why each question is asked; (4) client control: skip, go back, change, stop and return, visible progress; (5) give something useful in the first minutes (for example explain a term they asked about); (6) care about feelings without blaming anyone; (7) keep every promise (time estimate, delivery date); (8) end strong: thank-you, marked-up report, top questions to ask the inspector first; (9) a "Did I get something wrong?" button on every finding; (10) plain-words statement of what we keep, for how long, who sees it (whether clients can ask for deletion is undecided); (11) optional one-week follow-up email, only if the client agrees; (12) no pressure, no fear language, no upsells inside the conversation. Open: how a client's reply with more questions is handled (asked of Cory 2026-11-12).

## E29. Trusted professional network: later, not in the first release (Cory raised 2026-11-12; timing is Cory's call)
Idea (Cory): a group of trusted professionals that Lou can point clients to, managed by Dave (IBIS), monetized. Cory is expected to leave the inspection side of the business. Recommendation recorded: do not build it for the May launch; keep a place for it. Costs nothing now: the "what to do next" part of the review has room for a "people to consider" list; follow-up answers that fall outside Lou's limits are saved by category (inspector, remediator, plumber or roofer, lab, adjuster, attorney, doctor) so later we know how much demand each has. Open for later: how to charge (flat vetting and membership fee, fee per referral, or sponsored placement; per-referral and paid placement need attorney review, Florida referral-fee rules); written membership standards by Dave; plain disclosure to clients that members pay; wording "people to consider", never "best"; vetting described as a credentials check, not a guarantee; no client information shared without a clear yes; any listing of Coastal Air Assessments disclosed.

## E30. Read the room; never hold the report hostage; leave anytime (Cory, 2026-11-12)
Cory: the key to this working is that Lou reads the room, the report is never held hostage to the questions, and the client can leave at any time. Alternative he raised: Lou offers the questions, the client can leave, we review the report and email it back later. Both are supported by the same design: answers are saved the moment they are given; delivery never depends on answering; a client who leaves is emailed a link when the review is ready, and the same link reopens Lou's questions for 30 days (30 days is proposed). Proposed, awaiting Cory: (1) an early question "How much time do you have right now?" that picks a quick path (about 8 to 10 essential questions) or the full path; (2) two tiers of questions: Tier 1 essentials for the first 5 to 8 minutes, Tier 2 extras up to about 15 minutes (evidence: typical site visit about 2 minutes 42 seconds; surveys lose 5% to 20% of people past about 7 to 8 minutes); (3) plain-code "read the room" rules (answers slowing, repeated skips) that offer to wrap up; (4) the Start here question picks which areas Lou asks first. The earlier cap of 5 report-driven questions stays for now and is raised only if timing shows room. Johnathan: time the real flow.

## E31. After the questions, everyone sees a "close this, we'll email you" screen (Cory, 2026-11-12)
Cory chose option B: when the questions end, every client sees the same screen, with no waiting screen and no progress bar. His words: "I'm still looking it over, thank you and I'll send it over when I finished." Draft screen text: "I'm still looking it over. Thank you, and I'll send it over when I'm finished." The email carries the link to the review and to reopen Lou's questions (30 days proposed). Johnathan: the client's email address must be confirmed before payment, and the email must be sent for every case.

## E32. Lou asks how much time the client has (Cory, 2026-11-12)
Cory chose: right after the greeting Lou asks how much time the client has, with buttons that each carry a short explanation. Draft wording is in the review page (Start here tab) for Cory to edit: "A few minutes" (only the most important questions, about 5, can come back later), "About 10 minutes" (key questions plus a few more), "Take your time" (everything that fits). Which questions belong to each path (the tiers) is not yet decided.

## E28 progress (Cory approving one item at a time, each with a recommended answer)
- Item 1 approved 2026-11-12 ("Y"): Lou says plainly at the start that he is a computer program. Opening line updated: "Hi, I'm Lou, a computer program that reads your report. Thanks for letting me help you with this. I'd like to hear your side too. Skip anything you'd rather not answer."
- Item 2 approved 2026-11-12 ("Y"): Lou says why he asks, one short line at the start of each group (not before every question). Draft lines are on the review page for Cory to edit, one per area.
- Item 3 approved 2026-11-12 ("Y"): the client stays in control: skip, go back and change, finish later, see progress, with plain buttons on every screen. Answers save the moment they are given.
- Item 4 approved 2026-11-12 ("Y"): at the end of the questions Lou reads back about six key points in plain words, each with "That's right" and "Fix this"; the step is optional and comes right before the "I'm still looking it over" screen (E31). Confirmed points are kept as the client-confirmed record.
- Item 5 approved 2026-11-12 ("Y"): early in the conversation Lou offers a short plain-words explanation of a common term (for example moisture reading, spore count, scope of work). The client taps from a short list or picks something else. Answers use only approved library text; nothing typed is read by an AI. The term list is to be drafted for Cory.
- Item 6 approved 2026-11-12 ("Y"): Lou acknowledges how the client feels using a small set of approved warm lines chosen by plain code from their answers (for example "That sounds stressful", "It's smart to ask", "Thanks for telling me that"). He never says whether the inspector did right or wrong. The line set is to be drafted for Cory.
- Item 7 approved 2026-11-12 ("Y"): one honest delivery estimate is shown before payment (example: "within 2 hours", with a safety margin; Johnathan sets the real number from timings). If a review runs late, an email says so with a new time before the promised time passes.
- Item 8 approved 2026-11-12 ("Y"): the review and the delivery email open with "Your top questions to ask your inspector", then the marked-up report, then Lou's thank-you note, then the full detail.
- Sidebar (Cory, 2026-11-12): asked whether clients should email the report to Lou and have a back-and-forth by email in two parts. Recommendation recorded: keep upload and questions on the web, use email only to deliver and to link back (reasons: acknowledgments and payment must be enforced before reading, tap answers feed the anonymous counts, email replies and attachments are unsafe and hard to parse). The two-part split is already in the plan: questions now, more questions through the email link for 30 days (proposed).
- Item 9 approved 2026-11-12 ("OK, let's stay the course"): every finding in the review has a "Did I get something wrong?" button. The note is saved with the case with a plain thank-you; it does not change the review automatically and no one replies to each one.
- Item 10 approved 2026-11-12 ("Yes, proceed"): a short plain-words note on the payment screen and in Lou's greeting, with the full legal version one tap away. Five lines: files and answers kept two years then deleted; only the client and our software see them; never sold; no AI reads what the client types; answers counted without names. Attorney reviews the final wording. Whether a client can ask for earlier deletion is still undecided.
