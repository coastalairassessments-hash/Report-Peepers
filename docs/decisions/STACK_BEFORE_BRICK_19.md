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
