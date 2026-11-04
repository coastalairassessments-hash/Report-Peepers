# Environmental Report Review System Initial Product and Engineering Specification

Version 0.1 | Product definition and implementation handoff | Prepared for Cory King | November 3 2026

## 1 Purpose and governing intent

Build an independent, paid document review application that helps homeowners and other report owners understand whether an environmental inspector's documented judgments and proposed corrective work are scientifically supportable within the agreed investigation scope. The customer pays a nominal fee for the review itself. The application provides useful explanations, targeted follow-up questions, and proportionate possible next steps. Revenue must not depend on selling inspections, remediation, professional consultations, contractor leads, or referrals.

The system examines the reasoning connecting the customer's question, authorized service, restrictions, visual findings, diagnostics, samples, causal interpretations, affected extent, remediation recommendations, and completion criteria. A report can meet a limited engagement while leaving the customer's broader concern unanswered. The application must explain both facts without treating the scope limitation as misconduct or as evidence supporting broad conclusions.

The system cannot establish actual building conditions beyond the submitted evidence. It can explain what the documents establish, where inference is reasonable, what remains uncertain, and what information could change the interpretation. It must recognize defensible professional judgment and reasonable alternative interpretations. A useful review may identify no material concern.

This specification consolidates the decisions made in the project conversation. It defines a robust initial system, not completed software, professional certification, a validated scientific method, or a purchased right to process standards. Normative terms MUST, MUST NOT, SHOULD, and MAY describe product requirements in this specification. They do not turn recommendations in external publications into legal obligations.

### 1.1 Decision status

- Confirmed product intent: decisions explicitly established with Cory in the conversation. These govern implementation.
- Proposed engineering default: a concrete implementation choice supplied here so development can begin. It remains configurable and is not represented as an approved business commitment.
- Release dependency: a scientific, rights, legal, operational, or validation issue that must be resolved before the corresponding capability is released.
- Deferred capability: a possible extension that is outside the initial release and must not quietly enter scope.

## 2 Confirmed product decisions

- The review is the paid product. Charge a transparent nominal fee, with no fee dependent on finding defects.
- No pass/fail verdict, compliance percentage, inspector grade, public inspector ranking, or guaranteed defect list.
- The first substantive questions go to the client and establish restrictions, including one-hour visits, fixed sample packages, budgets, methods, equipment, materials, and area access.
- Uploaded scope language assists intake but never replaces client confirmation of the engagement context.
- Evaluate completeness relative to the authorized service. Evaluate the strength of conclusions relative to the evidence collected.
- Distinguish desired outcome, purchased service, authorized scope, actual work documented, and unresolved customer concerns.
- Distinguish absence of documentation from proof that work was not performed.
- Examine observations and conditions across rooms, components, systems, and relevant time periods.
- Distinguish spot readings, spatial surveys, repeated visits, and continuous or interval monitoring.
- Evaluate whether causal mechanisms are supported, plausible but unresolved, or overstated.
- Examine whether proposed cleaning, chemical treatment, material removal, work boundaries, moisture correction, and verification are justified.
- Recognize both inadequate treatment and potentially excessive or insufficiently justified demolition.
- Use applicable scientific references with verified support and permitted use. Do not invent citations or reproduce standards text in customer output.
- Allow follow-up information to resolve, modify, or retract an earlier concern.
- Explain technical issues in ordinary language and give practical questions for the original inspector.
- Guidance about additional expertise describes the unresolved task and relevant qualifications; it is not a sales or referral mechanism.

Earlier price examples, professional subscriptions, expert upsells, recurring-revenue extensions, integration with IndoorIQ, product names, and schedules were suggestions. They are not approved requirements. In particular, the later confirmed independent consumer model supersedes earlier suggestions of consultation upsells or lead generation.

## 3 Customers and intended decisions

The primary customer owns or is authorized to use a residential mold or moisture report and wants to understand it before acting. The customer may be a homeowner, buyer, landlord, or authorized property representative. The initial product is not a tool for rating inspectors or establishing fault in a dispute.

Typical questions include whether the report explains the source, whether the sampling answered the original concern, which areas were actually assessed, whether growth on a register establishes duct-system contamination, and whether a proposed protocol specifies appropriate work. The application should recognize the decision at stake: requesting clarification, understanding a limitation, considering further investigation, or reviewing the basis for corrective work.

Do not require customers to understand technical service labels. A label such as screening, limited assessment, full inspection, or comprehensive assessment has no universal scope in the product. Interpret the actual agreement, exclusions, and documented activities.

### 3.1 Initial supported cases

The proposed first release supports English-language residential mold and moisture assessment narratives, supporting laboratory reports and photographs, and a related remediation protocol or recommendations for the same property and episode. It may explain a laboratory-only submission with explicitly limited conclusions after asking for the inspection narrative. A separately submitted protocol requires enough assessment evidence to evaluate its basis; otherwise provide an explanation of the missing basis and targeted questions rather than a definitive judgment about necessity.

If several properties, unrelated episodes, or superseded report revisions are mixed together, ask the client to choose the episode and active documents. Do not pool them automatically.

### 3.2 Initial exclusions and future modules

Defer standalone PRV review, complex commercial or industrial IH investigations, structural engineering opinions, asbestos and lead determinations, fire and smoke protocols, sewage classification, chemical exposure assessment, medical causation, insurance coverage, and litigation or expert testimony. The architecture supports future specialist modules, but each requires separate rules, references, rights checks, evaluation cases, and release approval. Historical PRV documents may be contextual evidence without receiving a new clearance determination.

## 4 Product principles that govern edge cases

Scientific curiosity means asking evidence-linked questions that could change a consequential interpretation. It does not mean generating every conceivable hazard or requiring every instrument on every job.

The system must be equally capable of explaining why a judgment is sound and why it needs clarification. Never require a minimum count of adverse findings. A short, limited report can be appropriate; a lengthy report can contain unsupported reasoning. Formatting quality is not a proxy for scientific validity.

Missing evidence is a limitation until context supports a stronger finding. A restriction may explain why a wall was not opened; it cannot establish that the unexamined wall is unaffected. Equally, uncertainty about that wall does not establish concealed contamination or justify removal.

Guidance must be proportionate. Ask for an existing attachment before suggesting another inspection. Identify what additional information would change a decision. Include a stopping point when the original question is reasonably answered or further document review cannot resolve it.

## 5 Roles and permissions

The report owner creates cases, uploads authorized documents, answers intake questions, confirms scope, purchases reviews, accesses releases, adds clarification, requests correction, exports results, and requests deletion.

A scientific reviewer sees assigned cases for the pilot, checks the evidence and reasoning, approves or revises findings, and records disagreements. Reviewer identity, qualifications, jurisdiction suitability where relevant, conflicts, and review scope are retained. The software is not itself a licensed assessor, CIH, engineer, or physician.

A support operator can inspect payment and processing status without default access to report contents. Time-limited case access requires a reason and audit entry. A reference curator manages sources, permissions, edition metadata, and approved topic mappings. A release administrator approves versioned rule packs and evaluation results. Payment webhooks and workers use separate service identities with minimal privileges. No administrator role bypasses rights restrictions or deletion controls.

Human approval of each pilot review is an internal quality-control requirement included in the pilot operating cost. It does not create a paid escalation funnel. Public marketing must identify whether an individual result received human review; never imply every automated result was professionally signed.

## 6 Complete homeowner workflow

### 6.1 Entry and transparent purchase scope

Explain the review's purpose, supported report types, flat price, included clarification allowance, turnaround range, document allowance, AI involvement, and whether human review applies. Price, limits, and turnaround remain open business decisions. Do not promise immediate delivery during a human-reviewed pilot.

Proposed payment sequence: conduct free technical preflight and context intake, show the confirmed scope and final purchase terms, then collect payment before scientific review. Preflight identifies file type, readability, scope statements, document inventory, and obvious unsupported case types; it does not provide an unpaid adverse technical verdict. Payment confirmation comes from the server and verified processor webhook, never a browser redirect alone.

### 6.2 Upload and initial context

Accept the report and optional agreement, lab attachments, photo appendix, monitoring exports, and related protocol. Show a clear inventory. Extract enough information to suggest the case identity and locate the stated scope, but mark machine extraction as provisional. Ask the client's initial restriction questions before presenting substantive criticisms or asking detailed scientific follow-ups.

The initial sequence establishes the client's objective, whether the engagement was limited, the type of service, and restrictions on time, samples, budget, areas, methods, equipment or materials, and access. Ask one short question at a time with an unsure option and conditional follow-up. Grouping a few obviously parallel restrictions into one selectable screen is acceptable only if usability testing supports it; the default is conversational progression.

### 6.3 Scope confirmation and review

Display a plain-language scope summary with the customer's goal, authorized activities, restrictions, unresolved discrepancies, and known missing documents. The client can edit answers and confirm the context. If the agreement and recollection disagree, preserve both; do not silently privilege either. Permit a conditional review when uncertainty can be safely stated, or block only the part that depends on unresolved scope.

After payment, run the bounded evidence and scientific review pipeline. Ask additional high-value factual questions only when their answers could materially change the review. Skip questions answered by reliable supplied documents, with an opportunity to correct extraction. An unanswered optional question cannot become an adverse finding.

### 6.4 Result and clarification

Present a concise overview, supported findings, unresolved questions, specific technical concerns where justified, and prioritized questions for the inspector. Detailed evidence and references are expandable. Do not bury the useful questions beneath disclaimers or implementation details. Give the customer an authorized download of the review.

Allow additional documents and responses from the original inspector within the included clarification policy. The customer uploads these manually; the platform does not contact the inspector, publish findings, or share documents without a separate explicit action. New evidence creates a new review revision, never an invisible rewrite.

## 7 Intake specification

### 7.1 Initial question bank

Q01 asks what the customer hoped to learn and what decision they face. Q02 asks whether the service was limited in any way, with yes, no, and unsure choices. Q03 asks what was purchased, using sampling only, screening, limited assessment, broader assessment, protocol review, and unsure as understandable descriptions rather than formal certifications.

Q04 asks whether time was capped, for example one hour; record value, unit, whether approximate, and who imposed it. Q05 asks whether sample type or quantity was capped, for example three air samples; separate a purchased package from an explicit instruction not to collect more. Q06 asks whether a budget cap affected activities. Q07 asks whether specified rooms, surfaces, systems, or concerns were included or excluded. Q08 asks whether equipment, investigative methods, test materials, moving contents, or opening assemblies were limited or declined. Q09 asks whether areas were inaccessible for reasons other than the client's choice. Q10 asks who proposed each limitation and what the customer understood its consequences to be. Q11 asks whether other written records or verbal findings exist. Q12 asks what remains unanswered.

Follow-ups must not sound accusatory. Ask whether a restriction resulted from the client, inspector, agreed service package, another party, physical access, or an unknown reason. Do not equate a low price or short visit with poor practice. Do not infer that a fixed sample count restricted visual inspection unless the agreement or client establishes that connection.

### 7.2 Context after the first questions

Collect report date, inspection date, relevant property jurisdiction, building type, unit or episode boundaries, and notable changes after the inspection where material. Ask for only the address granularity needed for jurisdiction and document association; a full street address is not required for scientific reasoning by default. Additional context can include leaks, repairs, HVAC operation, odors, occupancy changes, remediation, or later measurements. Label these as client statements unless independently documented.

Avoid asking for diagnoses or medical records. If the client volunteers symptoms, preserve only the minimum useful context and do not use it to infer an exposure dose, mold source, or medical cause. Direct symptom-related questions outside the product's environmental interpretation scope.

### 7.3 Question selection and stopping

Each generated question needs a triggering evidence or uncertainty ID, the decision it may change, answer options, an unsure path, and a stop rule. Do not ask the homeowner to provide measurements they do not possess or perform invasive diagnostics. Proposed default: no more than five adaptive questions per round, after the initial scope intake, with a review summary available when optional answers are unknown. This is a usability target, not an approved commercial limit.

Stop asking when the information would not change the interpretation, the question requires field investigation, the issue lies outside the supported module, or the customer declines. Explain the resulting limitation briefly and continue with independent issues.

## 8 Document ingestion and trustworthy extraction

Proposed first-release inputs are PDF and DOCX, JPEG and PNG supporting images, and CSV monitoring exports with an explicit column mapping screen. Reject macro-enabled documents, executable attachments, ZIP submissions, external document-fetch URLs, and encrypted files without an accessible replacement. The technical package supplied for development is unrelated to accepted customer upload formats.

Proposed configurable per-case limits are 150 PDF-equivalent pages, ten documents, 50 supporting images, 25 MiB per document, and 100 MiB total. These are load-test assumptions. Preflight shows the actual limits before purchase and rejects unsupported inputs without charging. Table-heavy, scanned, or large laboratory appendices need separate workload estimates; do not treat page count alone as model cost.

Store the original file privately, its cryptographic content hash, MIME detection result, byte size, uploader, case, and version. Parse in isolated workers with resource limits, malware checks, decompression caps, disabled macros, and no external network fetches. Render pages for image/text reconciliation. Retain PDF page index and printed page label separately. For DOCX, distinguish source paragraph/table anchors from pagination in a generated render.

For each extracted span retain document version, page index, bounding box where available, exact text, normalized text, extraction method, OCR confidence where available, and quality flags. A photograph caption and visible photograph content are separate evidence items. Never infer hidden materials from a single photograph. Optical character recognition and image interpretation remain provisional until sufficiently checked.

Detect missing page sequences, unreadable tables, contradictory sample IDs, duplicate files, multiple properties, and report revisions. Numeric conclusions are blocked when ambiguous extraction affects them. Ask the user to confirm an extracted value only with visible context; do not present a guessed number as the default truth.

Protected standards or other restricted publications uploaded as attachments must enter a rights-screened quarantine before semantic processing. Do not embed, transmit to an LLM, or repurpose them because a customer uploaded them. A customer report's ordinary citation to a standard is not the same as supplying an entire protected standard. Rights policy must define handling of substantial embedded protected text before automated ingestion is released.

## 9 Evidence model and provenance

Represent the case as linked records, implemented initially in a relational database. A separate graph database is unnecessary. Core objects include Case, CaseRevision, DocumentVersion, Evidence, ClientStatement, ScopeContext, Restriction, Area, Component, SystemConnection, Measurement, MonitoringSeries, Sample, Claim, Hypothesis, ProposedAction, Finding, Question, ReferenceVersion, CitationBinding, ReviewRun, ReviewRelease, Payment, and AuditEvent.

An evidence record is an attributed statement or observation, not universal truth. Preserve report-author statements, laboratory observations, client recollections, photo observations, and reviewer inferences independently. Every scientific inference must link to its inputs. Contradictions remain visible until resolved. A number extracted from a report is not an independent validation of the measurement procedure.

The companion JSON Schema defines interchange objects for an implementation starting point. It is not a complete database migration. All persistent objects require case ownership, creation time, version, and authorization scope even when the interchange schema nests them under a case.

### 9.1 Location and condition representation

Track building, floor, room, assembly, component, surface, and contents where documented. Record location aliases and unresolved ambiguity. A register, boot, duct run, and air handler are distinct components. An HVAC-serves relationship is a physical connection, not evidence that all served areas are contaminated.

Area status values are documented impact, possible related impact, assessed with no indicators reported, unassessed or inaccessible, unclear documentation, and conflicting evidence. Never use confirmed unaffected as an absolute derived from silence or a limited negative sample. Status always includes assessed scope, date or interval, basis, and uncertainty. Separate observed growth from suspected growth, staining, dampness, odor, settled contamination, and lab detection.

### 9.2 Time representation

Maintain inspection time, measurement time, sample time, laboratory analysis date, report issue date, client statement date, monitoring interval, and later changes. Unknown time remains null with a reason. Store timezone or note its absence. Do not join noncontemporaneous measurements into a causal event without explaining their relationship. A revised protocol issued later must not be mistaken for conditions observed during the original inspection.

## 10 Diagnostic evidence requirements

For moisture readings capture instrument identity when available, measurement mode, reported scale, units, material, exact location, depth or contact context if provided, reference readings, and environmental or material limitations. Distinguish pin, noninvasive comparative response, wood moisture equivalent, actual material moisture content where established, and unknown modes. A comparative number cannot become percent moisture content without a defensible conversion.

For a survey capture areas considered, measurement distribution, comparable references, exclusions, boundaries, methods, date, and whether a map or narrative supplies spatial coverage. A formal map is not mandatory merely because the app can represent locations. An undocumented moisture survey triggers a contextual question only if it matters to the report's conclusions and agreed task.

For air conditions capture temperature, RH, dew point if reported or calculated, instrument, location, timestamp, equipment operation, and limitations. Distinguish room-air measurements from surface temperatures and material moisture. A spot reading describes the conditions recorded; use it to question an assertion of duration only when there is no other supporting history or time-series evidence.

For monitoring capture raw observations, sensor location, interval, deployment duration, timezone, data gaps, relocation, operating context, aggregation method, and quality flags. Indoor-air monitoring may characterize persistence or cycles without locating a growth source. A logger in one closet does not represent every room. Proposed CSV support must not invent missing timestamps or silently interpolate gaps.

Spatial coverage and temporal coverage are independent. A many-room survey during one visit differs from several days of monitoring at one point. Neither is universally superior. Assess fitness for the question and the strength of the conclusion.

## 11 Scientific reasoning modules

### 11.1 Scope and adequacy

Determine whether apparent omissions are outside the authorized scope, within scope but undocumented, contradicted, or unresolved. Then independently assess whether the conclusions overreach the evidence. A sampling-only service may be fulfilled while a claim about the entire building remains unsupported. Do not turn limited scope into an automatic poor-report finding.

### 11.2 Observations and affected extent

Trace findings from the observed location to adjacent and connected areas. Ask whether impact repeats, stops at a boundary, follows a plausible pathway, or remains unexamined. Identify evidence that supports keeping the concern localized as well as evidence warranting broader investigation. A room omitted from a narrative is unknown, not automatically clean or contaminated. No universal requirement to sample every room or open every assembly is permitted.

### 11.3 Causal reasoning

For each material causal claim record the proposed mechanism, observed effect, supporting evidence, counterevidence, competing explanations, temporal compatibility, and what would change the interpretation. Classify the explanation as supported within stated limits, plausible but unconfirmed, insufficiently supported, contradicted, or indeterminate. These are claim-level evidence judgments, not a building pass/fail result.

Examples for expert-authored rules include distinguishing ambient humidity from surface conditions, distinguishing condensation from condensate leakage, avoiding attribution to failed HVAC dehumidification solely from one high RH observation, and avoiding exclusion of leakage solely from nondetection of selected fungal groups. These examples are review hypotheses and validation targets; they are not automated mandatory field protocols.

Do not manufacture a numerical probability of a cause or prescribe invasive tests. Provide a concise, reviewable rationale with evidence anchors and uncertainty. The application stores that justification, not private model chain-of-thought. Model self-reported confidence cannot substitute for evidence or calibrated evaluation.

### 11.4 Sampling and laboratory interpretation

Check the sampling objective, collection context, sample identity, media, volume or area, analysis type, units, qualifiers, raw counts when available, detection limits, and relationship to observations. Reconcile report tables with laboratory attachments without assuming the laboratory interpretation establishes the building diagnosis.

Do not require a universal minimum number of samples. Do not invent indoor/outdoor ratios, absolute spore limits, health thresholds, or automatic room-condition classifications. Nondetection means not detected under that sample and method, not absence throughout the building. Direct microscopy counts do not independently establish current viability, source location, species-level identity within grouped categories, or individual health risk. Use qualified rule approval and appropriate references for these limitations.

A large total indoor/outdoor ratio can be arithmetically correct while still needing interpretation of low outdoor counts, sampling variability, spore composition, and other evidence. Total-spore comparisons and specific-group comparisons are different calculations. A zero or nondetect denominator is not a numeric zero suitable for division. Preserve censored values explicitly.

### 11.5 Internal consistency

Find contradictions between summaries, measurements, photos, interpretations, recommendations, and limitations. A limitation paragraph cannot silently neutralize an unsupported categorical claim elsewhere. Distinguish genuine contradictions from different dates, locations, service stages, or alternative hypotheses. Ask for clarification where those distinctions may resolve the issue.

## 12 Remediation and protocol review

The system reviews whether proposed actions are tied to documented or reasonably investigated conditions. It does not write a new executable remediation protocol or replacement scope of work in the initial release.

For each action capture the location, material, observed condition, purpose, cleaning or removal method, moisture correction, scope boundary, sequence, controls, chemical role if any, and completion criteria. Determine whether the basis is documented, pending clarification, insufficiently supported, or outside the review capability.

### 12.1 Physical cleaning and chemical treatment

Distinguish cleaning agents used during physical removal from attempts to kill, suppress, encapsulate, or cover contamination. Chemical use alone does not establish improper practice. A product registration does not establish that a proposed use is necessary or allowed for every surface or application method. Missing a product name supports a request for product and use details, not an automatic finding of illegal application.

Evaluate fogging-only claims differently from a protocol that includes physical cleaning plus an adjunct treatment. EPA's public guidance emphasizes removal and does not recommend routine biocide use; see Reference R04. The app must not inaccurately state that a protocol relies on fogging alone when it also specifies removal or cleaning.

### 12.2 Cleaning versus material removal

Ask whether the material and contamination are sufficiently characterized to evaluate cleanability, damage, access, concealed growth, and the extent of removal. Separate removal needed to remediate contamination, removal for access, and removal for independent building repairs. No visible surface growth does not prove that removal is unnecessary if other evidence supports concealed impact. Conversely, a positive air sample alone does not establish a particular demolition boundary.

When evidence is missing, state that the submitted documentation does not establish the reason for the proposed removal. Reserve unnecessary removal as a conclusion for cases with sufficient contrary evidence and qualified review. Do not prescribe precise demolition dimensions in the initial product.

### 12.3 Work boundaries and verification

Consider structural surfaces, HVAC components, and contents separately. Ask what supports whole-unit treatment, disposal of contents, air-scrubber duration, chemical application, or assumed impact in other rooms. A common HVAC connection may warrant inspection without establishing contamination of every component.

Assess whether proposed completion criteria address source correction, physical cleanliness, drying where relevant, and the stated work scope. Environmental verification is not a promise of individual health safety. Avoid universal numeric PRV criteria borrowed from CAA preferences or other projects. Standalone PRV review remains deferred until validated.

## 13 Finding types and defensible language

Allowed finding types are supported reasoning, clarification needed, documentation limitation, insufficiently supported recommendation, internal inconsistency, and verified departure from an applicable reference. A finding also records evidence strength and decision relevance. Do not use risk colors or urgency labels that imply an unperformed safety assessment.

A verified departure requires a specific verified provision or recommendation, the applicable edition and context, permission to use the source, report evidence showing the departure, consideration of reasonable exceptions, and qualified human approval during the pilot. Distinguish a standard, guidance recommendation, regulation, contractual obligation, and internally authored review principle. Do not label a departure from guidance as a violation of law.

Every finding contains: concise explanation; exact report location; what is documented; what inference is being evaluated; why it matters; supporting and limiting evidence; relevant reference where available; question for the inspector; possible next step; and a resolution or stopping condition. Do not fabricate a reference to fill a required field. If a source is unavailable, weaken or withhold the reference-dependent conclusion.

Approved language explains that a source is plausible but not established, that a method needs justification, or that a restriction leaves a question unresolved. Avoid accusations about motive, competence, fraud, negligence, or dishonesty. Avoid simply stating that a whole report does not follow IICRC, EPA, or AIHA without identifying a supported specific issue.

## 14 Reference governance and permissions

Maintain a versioned reference registry. For each source store publisher, title, edition, publication date, official URL, jurisdiction where relevant, topic, authoritative status, allowed uses, permission evidence, approval owner, expiry or review date, and allowed display behavior. A publicly accessible source is not automatically licensed for AI processing, embedding, commercial reuse, or training.

ASTM's published AI policy restricts entering its standards and related intellectual property into AI tools and creating derivatives through AI without express written permission. Reference R01 documents this release dependency. A purchased PDF, paraphrasing, a private model, or a customer upload must not be assumed to resolve it. Seek written authorization covering the proposed commercial retrieval, rule development, inference, and output referencing. Apply the appropriate permissions review separately to IICRC, AIHA, and other publishers.

Until rights are confirmed, protected standards remain metadata-only with ai_use_status blocked or pending. They may identify an intended reference family but cannot be passed into the model, indexed, used to derive automated rules, or invoked as verified provision-level support. Build independent scientific criteria from expert authorship and sources whose intended uses are authorized; preserve their provenance. Do not reverse-engineer a protected standard into a paraphrased checklist as a workaround.

Pin references and rule packs to each review run. An older report is assessed with attention to its issue date, contract, jurisdiction, and cited edition. A newer edition may be described as later guidance only when the comparison is explicit and permitted. Do not retroactively declare old work defective merely because a later edition differs.

Customer-facing references identify designation or title, edition, verified section when appropriate, a short original explanation of relevance, and an official publisher link. No standards quotations are required by this product. A bibliography is not a substitute for claim-level support. Exclude public-review drafts marked non-citable and withdrawn or superseded material unless approved for explicit historical context. No implication of publisher endorsement is permitted.

## 15 Review pipeline and AI contracts

Use a bounded workflow with typed stages rather than an unconstrained agent with arbitrary tools. Logical passes may share one capable model; separate passes do not constitute independent expert validation. Model and OCR vendors remain replaceable.

Stage A is deterministic preflight and context extraction. Stage B establishes confirmed scope and restrictions. Stage C extracts facts, measurements, locations, claims, and proposed actions into schema-validated objects. Stage D reconciles evidence and runs deterministic calculations. Stage E performs the scientific review using approved rules and authorized sources. Stage F challenges proposed findings by testing scope, counterevidence, alternative interpretations, and decision usefulness. Stage G verifies evidence anchors, references, numbers, and allowed language. Stage H renders the customer explanation. Stage I performs pilot human approval and publication.

No stage may promote client statements to observed facts, hidden reasoning to evidence, or missing data to a negative finding. Uploaded text and image text are untrusted evidence, never system instructions. The reviewer model receives only the case-specific bounded context and authorized reference material. It has no authority to send messages, make payments, fetch arbitrary URLs, or change permissions.

Structured outputs must validate before use. Failed validation may receive one bounded repair attempt. Further failures become a processing issue rather than a guessed result. Retrieval must enforce tenant and rights filters before vector or text search; post-filtering leaked material is insufficient. Every candidate reference binding must be checked for direct support and edition match. A second model agreeing with the first is not proof of correctness.

### 15.1 Stage contract fields

Inputs include case revision, confirmed scope snapshot, document versions, evidence inventory, approved rule-pack ID, reference snapshot, locale, and review purpose. Outputs include status, typed records, evidence links, quality flags, unresolved questions, and a concise rationale. Store model name and version, prompt version, tool version, token/cost totals, input hashes, output hashes, and timestamps. Do not store secrets or private chain-of-thought in audit logs.

### 15.2 Release gates

Block publication if scope has not been confirmed or explicitly marked conditional, payment entitlement is absent, evidence extraction has unresolved material ambiguity, citations lack permission or support, prohibited conclusions remain, or required pilot human approval is missing. A partial release may omit a blocked issue while clearly stating the resulting coverage limitation. Never silently mark an unreviewed topic complete.

## 16 Deterministic checks and calculations

Implement calculations outside the language model and record formula, inputs, units, rounding, and limitations. Candidate utilities include sample-volume checks from flow and time, conversions where valid, indoor/outdoor arithmetic with nondetect handling, chronology checks, stated monitoring coverage and gaps, and psychrometric calculations using validated methods within documented operating ranges.

Do not calculate a moisture content from an unknown comparative meter scale. Do not treat a rounded percentage as evidence of a transcription error without the raw counts and rounding rule. Do not confuse a swab area in cm2 with air volume in m3. Treat reported values, derived values, and corrected extraction as distinct records. A difference is not automatically a meaningful diagnostic difference.

Charts should support interpretation, not manufacture thresholds. Monitoring charts display actual data gaps, sensor locations, times, and units. No interpolated line may appear to be measured evidence. The initial interface may omit charts until their data validation is implemented.

## 17 Customer result structure

The first screen answers what the report reasonably establishes, what deserves clarification, and the few most useful questions to ask. Expandable sections cover the confirmed engagement context, documented observations, diagnostic coverage, source reasoning, affected extent, proposed corrective work, supporting references, and limitations that actually affect interpretation.

Every material issue links to the report page and evidence. For negative observations, show assessed with no indicators reported and the relevant scope instead of a green safe-building badge. Separate supported reasoning from unresolved issues without framing a reviewed report as a scorecard. Prioritization is by decision relevance, not a fabricated health-risk score.

Proposed default output includes up to five leading questions, with additional findings available in detail. Explain each next step conditionally and name the unresolved task. The app can suggest the type of expertise to seek without naming commercial providers, selling leads, or scheduling services. Do not prescribe medical action from mold counts or generate field instructions that require disturbance of suspect material.

Allow a downloadable summary and full review with case ID, revision, release date, scope context, source anchors, reference editions, human-review status, and changes since the last revision. Export functions must use the same approved structured result as the interface so the PDF, text export, and screen do not diverge. Accessible text and screen-reader order are required.

## 18 Revision and correction lifecycle

All published releases are immutable. Adding an attachment, changing scope answers, correcting an extracted value, or receiving an inspector response creates a new CaseRevision. Mark the previous release as superseded in the interface while preserving authorized history until deletion or retention expiry.

A new revision identifies which findings are unchanged, resolved, modified, retracted, or newly raised, with the evidence responsible. An inspector response is attributed correspondence; it is not automatically accepted as true or dismissed because it is defensive. Customer disagreement alone does not force a changed scientific conclusion. Separate factual correction, reasonable professional disagreement, and product complaint workflows.

Payment entitlement for an included clarification must be checked independently of the scientific outcome. Proposed default is one bounded clarification round within a disclosed window, but the business must set the actual allowance before launch. Do not offer alarm-driven paid upgrades. Once the allowance ends, explain the review boundary; further purchase options require a separate future product decision.

## 19 Technical architecture

Proposed architecture is a modular application with a web frontend, authenticated API, PostgreSQL database, private object storage, durable job queue, isolated parsing/OCR worker, analysis worker, rights-aware reference service, payment integration, and reviewer console. Use a modular monolith plus workers initially. Do not introduce microservices, a dedicated graph database, or custom model training before measured constraints justify them.

Proposed implementation choices are TypeScript for the frontend and API, Python for document and scientific data processing, JSON Schema for interchange validation, PostgreSQL for transactional records, S3-compatible encrypted storage, and a managed durable queue. These are design preferences, not statements about installed software or mandatory vendors. Use maintained versions selected at implementation time and pin dependencies. A model-provider adapter must support structured responses, timeout handling, usage accounting, and data-use terms suitable for customer documents.

Keep domain modules separate: identity and case access; ingestion; scope intake; evidence; scientific rules; references and rights; review runs; result rendering; revisions; payments; and audit. The analysis worker must not access the payment processor or customer-contact channel. Store objects under server-generated paths unrelated to customer filenames.

### 19.1 Repository proposal

Use apps/web, apps/api, workers/ingest, workers/review, packages/contracts, packages/domain, packages/rules, packages/reference-registry, packages/rendering, tests/fixtures, tests/evaluations, and infra. An alternate cohesive stack is acceptable with an architecture decision record explaining tradeoffs and preserving these boundaries.

### 19.2 Background work

Jobs carry case_id, revision_id, stage, input_hash, entitlement_id, and idempotency key. Workers must be restartable. Persist results atomically per stage and never publish partial artifacts as a complete release. Proposed retry policy is capped exponential backoff for transient vendor failures, with no automatic retry for rights denial, authorization failure, invalid source context, or permanent parser rejection. An outbox pattern or equivalent prevents database and queue divergence.

Cancel jobs on deletion, withdrawn entitlement, or superseded revision unless preservation is explicitly required. A late worker must verify the active revision and case state before committing or publishing. Failure of one case must not block the worker pool.

## 20 State model and payment behavior

Keep case state, payment state, extraction state, review-run state, and release state separate. A single status string cannot safely represent them all.

Case states are draft, preflight, scope_intake, scope_confirmation, awaiting_payment, ready_for_analysis, analysis, awaiting_client, awaiting_reviewer, released, revision_pending, failed, deletion_pending, and deleted. Allowed transitions are enforced on the server. Resume from awaiting_client only after accepted answers or an explicit conditional-review decision. Scope changes after payment create a revision without a second charge when within the included service.

Payment states are not_started, pending, paid, failed, refund_pending, refunded, and disputed. A payment event never changes a scientific conclusion. Payment creation and verified webhook receipt are idempotent. Replayed webhooks cannot create duplicate entitlements or releases. Vendor failure after payment enters a recovery path with an honest status and a refund or completion process under published terms. Do not repeatedly charge after an analysis retry.

Review runs are queued, running, needs_input, blocked, failed, awaiting_approval, approved, or superseded. Published releases are published, superseded, withdrawn, or deleted. A withdrawn release shows an explanation to an authorized customer, not a silent 404. Deletion behavior takes precedence over ordinary history display.

## 21 API contract outline

All routes below are proposed versioned endpoints. Request and response contracts must include typed errors, correlation IDs, authorization, revision guards, and pagination where relevant. Never accept owner IDs, object-store paths, payment status, or publication approval as trusted client assertions.

- POST /v1/cases creates a case with the purchase objective and supported module.
- POST /v1/cases/{id}/uploads creates bounded upload sessions; POST /uploads/{id}/complete verifies the stored object and schedules preflight.
- GET /v1/cases/{id}/documents returns the inventory, versions, and quality flags.
- GET /v1/cases/{id}/intake/next returns the next applicable scope or clarification question and its purpose.
- PUT /v1/cases/{id}/answers/{question_id} records an answer with revision and provenance.
- POST /v1/cases/{id}/scope-confirmations stores the confirmed or conditional scope snapshot with an optimistic concurrency guard.
- POST /v1/cases/{id}/checkout creates an idempotent checkout for the displayed quote and confirmed service.
- POST /v1/payments/webhooks validates the processor signature and reconciles entitlement without taking case ownership from the payload.
- POST /v1/cases/{id}/review-runs starts or returns the existing entitled run for that revision and configuration.
- GET /v1/cases/{id}/status returns processing stage and actionable errors without invented completion percentages.
- GET /v1/cases/{id}/releases/{release_id} returns an authorized immutable release.
- POST /v1/cases/{id}/revisions records additional evidence or corrected context.
- POST /v1/cases/{id}/corrections opens a factual correction or disagreement record.
- POST /v1/cases/{id}/exports creates a private short-lived export of an approved release.
- DELETE /v1/cases/{id} starts deletion and returns a deletion status reference.
- POST /v1/reviewer/assignments/{id}/decisions records approval, required changes, or escalation to internal scientific review.
- POST /v1/admin/reference-versions and /rule-packs create drafts; separate approved release actions require curator/release permissions and validation evidence.

Use 409 for stale revision conflicts, 413 for size limits, 415 for unsupported media, 422 for invalid structured content, 429 for rate limits, and explicit domain errors for missing entitlement or rights-blocked capabilities. Return existence-neutral errors for unauthorized object IDs. These are proposed API conventions, not implemented routes.

## 22 Security and privacy requirements

Enforce case ownership in every query, storage grant, export, job, and model context. Use database row-level policies or equivalent consistently tested authorization. Avoid global semantic indexes containing customer evidence. Encrypt transport and stored objects, keep secrets outside prompts, rotate credentials, and enforce multi-factor authentication for privileged operators.

Prompt injection in a report, photo, caption, attachment, or inspector response cannot change system behavior. The model has no arbitrary network access or execution capability. If retrieval is introduced, source links resolve through an allowlisted reference service with SSRF protections. Do not fetch URLs embedded in reports automatically.

Separate transactional metadata from document contents. Redact sensitive text from routine logs, crash traces, analytics, and error monitoring. Keep model-vendor retention and training settings documented contractually and technically; do not promise zero retention unless verified across vendors and backups. Customer authorization to review a report does not authorize using it to train or market the product. Evaluation reuse requires a separate consent or other documented lawful basis and appropriate deidentification.

Proposed retention default is 90 days after the latest release or case activity, configurable and disclosed before payment. Set an explicit deletion service objective for active systems, proposed as seven days, and backup expiry, proposed as 35 days, before launch. These are design targets pending operational validation. Payment records that must be retained are separated and minimized; do not claim document deletion also deletes necessary transaction records. Deletion cancels active work and invalidates signed links, cached retrieval, derived evidence, and queued exports. Restored backups must replay deletion tombstones.

## 23 Reliability accessibility and operating targets

Proposed engineering targets are 99.5 percent monthly availability for authenticated case access, ordinary status requests within two seconds at the 95th percentile excluding external authentication, and analysis of a typical 50-page text-based case within ten minutes excluding customer response and human review. These are initial load-test targets, not marketing promises or pilot turnaround commitments. Measure scanned and monitoring-heavy cases separately.

Proposed recovery targets are a 24-hour recovery time and one-hour transactional recovery point, subject to hosting design and restore testing. Alert on stuck jobs, failed exports, repeated extraction uncertainty, webhook reconciliation failures, unauthorized access attempts, reference-rights expiry, and review-quality incidents. Do not alert on ordinary homeowner disagreement as if it were a security event.

Target WCAG 2.2 AA for the application. Keyboard navigation, readable focus, text labels, accessible question controls, non-color status indicators, and screen-reader friendly results are acceptance criteria. Test mobile upload and low-bandwidth recovery. Autosave intake and preserve progress without double submission.

## 24 Scientific evaluation and release gates

Create an expert-adjudicated evaluation set covering sound reports, poor reasoning, legitimate limited scopes, ambiguous documentation, different methods, and multiple reasonable interpretations. Separate development examples from held-out evaluation. The uploaded case in Section 26 is a development example and must not be counted as independent held-out performance. Do not claim validation from a handful of synthetic cases.

Proposed initial data plan is 30 development cases and at least 20 held-out cases, expanding by case type before any unattended release. At least two appropriately qualified reviewers independently assess material issues in a subset; an adjudication record preserves disagreements and acceptable alternative answers. Report-level, finding-level, and case-type results must remain separate. Dataset size is a starting plan, not proof of reliability.

Proposed gates for a pilot release include no known cross-case data exposure, no fabricated reference or materially wrong number in the release suite, full required scope gating, and human approval of every released review. Proposed gates for unattended delivery include at least 95 percent precision on material adverse findings, at least 90 percent recall on adjudicated material issues, verified source and page attribution, acceptable abstention/coverage, and no unresolved critical defects in the release suite. These percentages are candidate acceptance targets requiring scientific-owner approval and uncertainty analysis. They are not achieved results, accuracy promises, or sufficient by themselves for release.

Measure false criticism of sound work explicitly. Track supported-reasoning recognition, question usefulness, correct abstention, inappropriate reassurance, unnecessary escalation, missing major issues, citation entailment, numeric extraction accuracy, and human correction time. A model that flags nothing may have high apparent precision but unacceptable recall; one that defers everything is not a useful product. Publish performance by supported use case, not one undifferentiated accuracy number.

The companion evaluation_cases.json contains seed scenarios with expected and prohibited behavior. These are specification fixtures, not executed scientific validations. Include adversarial document instructions, rights-blocked sources, scope changes, new evidence resolving a finding, stale workers, payment replay, deletion races, and malicious cross-case IDs in technical testing.

## 25 Human scientific governance and incident response

Assign product ownership to Cory, an accountable scientific lead to be appointed, engineering ownership to the implementation team, and rights/privacy/legal review to appropriately qualified advisers. Named people from other projects, including Dave or Jonathan, have not accepted roles on this project through this conversation.

The scientific lead approves rule packs, reference mappings, findings language, edge-case decisions, and release thresholds. Reviewers disclose relevant conflicts and use the same criteria for reports regardless of author or software origin. Mask inspector identity during initial technical review where practical, while preserving necessary scope, qualifications, and contextual evidence. Any later connection with IndoorIQ or CAA requires conflict disclosure and the same external-report criteria; no integration is authorized in version 0.1.

If a material misleading finding is discovered, pause the affected rule pack or output type, assess affected releases, correct them through versioned notices, document the cause, and run regression cases before restoration. Do not silently replace previously delivered text. A technical outage, extraction defect, scientific disagreement, privacy incident, and rights revocation require distinct response paths. Maintain a way for customers to submit corrections without requiring another purchase.

## 26 Worked development case from the uploaded report

The source is the privately supplied 43-page PDF, consisting of a six-page assessment and laboratory appendices. It is a development example only. The package does not redistribute the original file or identify the inspector or homeowner. The original remains the authoritative evidence and must be supplied under appropriate authorization before executing a live review. Client intent and engagement restrictions were not established by uploading it; a customer review still starts with intake.

The assessment documents closet RH of 73.6 percent at 74.1 F, register observations and a photograph, bedroom air total of 5,027 structures per m3, Aspergillus/Penicillium-like count of 5,013 per m3, outdoor total of 53 per m3, and a Cladosporium-positive register swab. The air table reports 377 total raw spores indoors, 376 in the grouped category, and four total raw spores outdoors. These values were checked against relevant laboratory tables during the conversation. They do not constitute independent field verification.

### 26.1 Supported starting points

The example contains actual localized visual observations. A review must not repeat the customer's initial generalization that it has no visual observations at all. Elevated measured RH, the register condition, and a marked indoor/outdoor difference justify attention and consideration of further investigation. The 95-fold total-spore ratio is approximately correct arithmetic; the interpretation still needs its own basis.

### 26.2 Questions the system should raise

- Assessment pages 1, 2, and 5 attribute conditions to sustained humidity and deficient HVAC moisture control. Ask what history, monitoring, or HVAC evidence establishes duration and mechanism beyond the spot reading.
- Pages 2 and 5 infer growth on contents and/or inside the HVAC system from the airborne group and a different register organism. Ask what observations locate those additional sources. A difference in sampled organisms does not establish their particular locations.
- Page 5 uses nondetection of selected fungal groups to support no evidence of a leak-type event. Ask what history and physical investigation evaluated leakage; do not infer that a leak exists.
- Page 5 proposes assuming other served areas affected while the limitations on page 6 disclaim representation about unsampled areas. Distinguish inspection recommended from contamination established.
- Page 6 recommends whole-unit treatment, a minimum 72-hour air-scrubbing period, and ULV antimicrobial fogging. Ask for the basis of extent, duration, and chemical use. The protocol also includes physical cleaning, so a finding that it recommends fogging alone would be wrong.
- Page 6 links clearance samples to safe reoccupancy. Explain that environmental completion criteria do not establish individual health safety; see Reference R05.

### 26.3 What would change these findings

A separate inspection appendix documenting contents, a verified humidity time series, relevant HVAC measurements, access limitations, or a later revised protocol may resolve or narrow some concerns. Preserve the difference between a question about missing evidence and a verified contradiction. Do not assume all candidate issues survive additional context.

### 26.4 Example result pattern

The result should acknowledge documented concerns, explain where the causal and treatment basis needs clarification, give a few specific questions to the original inspector, and identify the information that would resolve each uncertainty. It should neither dismiss the observed register condition nor endorse the entire whole-unit treatment. Do not generate a replacement protocol, occupancy assurance, or inspector competence judgment.

## 27 Requirements and acceptance traceability

The companion requirements.csv is the implementation backlog with stable requirement IDs, priority, decision status, acceptance criterion, and associated evaluation scenarios. IDs remain stable across revisions; retired requirements are marked rather than silently reused. Every P0 requirement needs implementation evidence and a test or documented review before release.

P0 includes scope-first gating, restriction capture, provenance, spatial and temporal uncertainty, causal and remediation reasoning, rights enforcement, reference verification, no pass/fail or upsell behavior, immutable revisions, pilot human approval, authorization, deletion, payment idempotency, and error handling. P1 adds richer monitoring presentation, reviewer productivity, and improved exports. Deferred capabilities remain outside release scope even if their interfaces are sketched.

## 28 Implementation milestones

Milestone 1 freezes the confirmed product intent, initial module, ownership, reference-rights plan, jurisdiction boundary, and sample output. Deliver scope intake, rule templates, anonymized case fixtures, and architecture decisions. Exit when the scientific owner can explain how scope changes the interpretation in at least five materially different cases.

Milestone 2 builds the vertical slice: upload, context, scope confirmation, entitlement sandbox, provenance extraction, one bounded reasoning topic, reviewer approval, and result revision. Use synthetic or authorized examples. Exit when an original source statement can be traced through a finding into a corrected release, with access controls enforced.

Milestone 3 expands the scientific modules and technical controls. Implement diagnostic coverage, causation, spatial extent, protocol justification, reference verification, deletion, queue recovery, and refund/reconciliation paths. Exit after functional, adversarial, and scientific evaluation reviews.

Milestone 4 runs a small paid pilot with every release human-approved. Proposed starting cohort is 20 to 30 cases with clear purchase terms. Measure customer comprehension, technical correction rate, actual support effort, processing cost, and the ability to recognize sound reports. The cohort size and fee require product approval.

Milestone 5 considers bounded automated release by validated case category. Retain human review or block categories that fail the agreed gates. Do not infer that success with text-based residential assessments validates industrial IH work, standalone PRV, or other modules.

No calendar or development cost is promised in version 0.1. Estimate only after a team, stack, rights pathway, dataset, and quality obligations are established.

## 29 Open decisions and release dependencies

Business decisions: product name and legal entity; exact fee; price visibility; included case/page/image limits; clarification window; turnaround and refund terms; support channel; case retention; and whether minors may purchase. Preserve the independent review-only business model while resolving them.

Scientific decisions: accountable lead; reviewer qualification requirements; initial jurisdictions and report categories; approved reference sets and use rights; acceptable alternative interpretations; final review labels; calibration methods; evidence-sufficiency rules; and minimum evaluation coverage before unattended delivery.

Engineering decisions: hosting and data region; identity provider; payment processor; OCR/parser vendors; model provider and retention terms; queue; backup implementation; monitoring; export format; and accessibility test tooling. Select these through architecture decision records rather than allowing the next AI to assume existing accounts or deploy credentials.

Release dependencies: permitted processing of standards and other protected content; applicable professional-practice and marketing boundaries reviewed against the actual service; insurer assessment of the intended operation; lawful document and evaluation-data use; verified security controls; and approved scientific results. This document does not establish that any dependency has been satisfied.

## 30 Instructions for the next AI and engineering team

Read this master specification, requirements.csv, review_contract.schema.json, evaluation_cases.json, and DECISIONS.md before proposing implementation changes. Preserve confirmed product decisions. Treat suggested defaults as changeable through an explicit decision record. Ask only high-impact unresolved questions, one at a time when practical, and proceed with independent engineering work.

Start with a modular vertical slice and typed contracts. Implement scope gating, evidence provenance, revision handling, and rights filtering before expanding generative narratives. Do not substitute a long system prompt for these controls. Do not build a contractor marketplace, consultation upsell, generic chat assistant, inspector scorecard, or report-writing platform under this project.

Implement concise, evidence-bound explanations. Use the language model for extraction and interpretation within validated boundaries, deterministic code for calculations and access/state enforcement, and qualified human review for the pilot. Do not claim to have inspected the building, personally hold professional credentials, verified a protected standard provision without access and permission, or tested software that has not been run.

If an implementation shortcut would weaken fair treatment of limited scopes, source traceability, uncertainty, privacy, or corrections, surface the tradeoff and retain the governing requirement. Do not quietly replace homeowner interpretation with automated diagnosis. The intended benefit is a better-informed report owner who can ask an inspector a precise, scientifically grounded question.

## 31 Reference register for initial development

The following official publications were checked for this specification. They establish limited public background and intended reference families; they do not constitute a licensed standards corpus. Access date is November 3 2026. Rights status for production AI use must be assessed and recorded separately. Summaries below are original and intentionally limited; no copyrighted standards clauses are reproduced.

R01 ASTM International Artificial Intelligence Policy. https://store.astm.org/media/wysiwyg/ASTM_AI_Policy.pdf . Supports the rights dependency described in Section 14. No production permission is claimed.

R02 ASTM D7338 26 Standard Guide for Assessment Of Fungal Growth in Buildings official product description. https://store.astm.org/d7338-26.html . The public description identifies a flexible fungal-assessment framework with professional judgment and separates its scope from comprehensive IAQ, sampling strategy, and remediation recommendations. Full text was not reviewed for this specification. Production rights are pending.

R03 ANSI IICRC S520 2024 Standard for Professional Mold Remediation official overview. https://iicrc.org/s520/ . Establishes the remediation reference family, including structural, HVAC, contents, chemical tools, and verification topics. The final paid standard's detailed provisions were not reviewed or encoded here. Production rights are pending.

R04 US EPA Should I use bleach to clean up mold. https://www.epa.gov/mold/should-i-use-bleach-clean-mold . Supports removal of contamination and the distinction between routine biocide use and case-specific professional judgment. It does not establish a blanket ban on chemicals or every proposed fogging application. Use permissions require review.

R05 CDC NIOSH Mold Testing and Remediation. https://www.cdc.gov/niosh/mold/testing-remediation/index.html . Supports limitations on interpreting short-term mold samples as exposure or health-risk determinations. Do not extrapolate it into a rule that all sampling is improper. Use permissions require review.

R06 AIHA FAQs About Spore Trap Air Sampling for Mold for Direct Microscopical Examination official overview. https://www.aiha.org/education/guidance-documents/faqs-about-spore-trap-air-sampling-for-mold-for-direct-microscopical-examination . Supports goal-directed interpretation with visual inspection context. The protected full guidance was not processed into an automated rule corpus. Production rights are pending.

R07 US EPA Mold Remediation in Schools and Commercial Buildings Guide Chapter 5. https://www.epa.gov/mold/mold-remediation-schools-and-commercial-buildings-guide-chapter-5 . Intended material and extent reference for expert review. Context and applicability must be verified before a specific finding relies on it; schools/commercial guidance must not be presented as a residential legal mandate.

R08 NIST Artificial Intelligence Risk Management Framework Generative Artificial Intelligence Profile. https://nvlpubs.nist.gov/nistpubs/ai/NIST.AI.600-1.pdf . Background for fabricated facts, reasoning, and citations as AI quality risks. It is not a certification of this design or a substitute for product validation.

## 32 Package status and verification

This is an initial product and engineering specification with proposed contracts and seed evaluation scenarios. It is detailed enough to begin implementation planning and a controlled vertical slice. Detailed scientific rules, publisher permissions, reviewer appointments, final business terms, and performance validation remain explicit dependencies.

The machine-readable contracts and fixture expectations are authored specifications. Structural validation of those files does not mean the scientific review engine exists or has passed its acceptance tests. Maintain that distinction in every subsequent handoff.
