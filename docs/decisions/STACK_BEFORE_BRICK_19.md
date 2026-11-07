# Stack decision before Brick 19 (proposed, not decided)

Decision owner: Cory. Security review: Johnathan. No vendor is selected here.

## Situation
The core is TypeScript on Node 22 with vitest, JSON Schema contracts and a pinned Typst for rendering. Storage, accounts, queues and screens do not exist. D04 proposed TypeScript web/API plus Python workers, PostgreSQL and S3-compatible storage.

## Recommendation
Stay in TypeScript end to end for the MVP.
- One language, one test suite, and the domain package is reused as is.
- PostgreSQL for cases and the append-only logs; S3-compatible private storage for uploaded reports and releases (customer isolation and deletion schedules enforced in the repository, which already has the access rules and tests).
- A database-backed queue for analysis jobs (no separate queue product until volume asks for it).
- Run PDF parsing and OCR as a separate, locked-down worker process with no network, so a hostile file cannot reach customer data.
- Defer Python workers. Revisit only if a real-report parsing need cannot be met in the current code.
- Model calls go through the existing port, so the model provider can change without a rebuild.

## Choices still open (need Cory and Johnathan)
1. Hosting and region (US only?).
2. Sign-in method for homeowners.
3. Email intake provider (Brick 19+).
4. Where the review page's decisions live long term (repo files today).
5. Retention periods and deletion schedule (ADR-002 sets the principle, not the numbers).

## Not decided here
Payments (deferred), vendor accounts, and package versions.

## Decisions recorded with Cory (2026-11-06)
1. Hosting and region: Cory delegates the provider to Johnathan. Fixed constraints for Johnathan: US-only data, private storage, no public access to customer files. Johnathan reports his pick back as a written decision record.
2. Homeowner access: no accounts or passwords. The homeowner emails the report in. We email back a private, unguessable, expiring link, and the page then asks for a one-time code sent to the same address (two steps). Reviews are never attached to email. The reply goes only to the verified sender address. Link lifetime and code rules go to Johnathan's security review.
3. Email provider (in and out): Cory delegates to Johnathan, to be chosen together with hosting. It must pass inbound email to our program, send reliably, and support sender verification (SPF, DKIM, DMARC). Written decision record from Johnathan.
4. Library decisions long term: move to the main database once it exists. Add-only, each row with reviewer, time and entry version; nothing overwritten. The repo files (data/knowledge/decisions, edits, family_decisions.json) stay as an exported backup copy.
5. Retention: 90 days after the review is delivered, then permanent deletion of the uploaded report and the review. Anonymous summary records are kept (no names, addresses or document text). A customer can ask for earlier deletion. The attorney confirms the number against the terms (open item).

All five stack questions answered 2026-11-06. Hosting and email provider await Johnathan's written decision record.
