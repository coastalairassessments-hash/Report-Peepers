# Slice 1 plan (for Cory's approval, no code until approved)

Goal: prove the core chain headless, with synthetic data only: scope confirmed -> evidence with provenance -> finding -> revision.
Decision: no UI in slice 1. Rules and data first; screens come in slice 2.

Bricks (each ends with types + tests green):
1. Contracts: TypeScript types generated from `docs/spec/review_contract.schema.json`; validate `example_case.json`.
2. Case state machine from `workflow_transitions.json`, enforced with guards; illegal transitions rejected.
3. Scope intake: question bank Q01-Q12, one question at a time, "unsure" path, scope snapshot + confirmation.
4. Evidence + provenance: every finding must link to a source span; unlinked findings rejected.
5. Revisions: new evidence creates an immutable new revision; findings marked unchanged/resolved/modified/retracted.
6. Evaluation harness: run seed cases from `evaluation_cases.json` against the rules (no AI model yet).

Exit: one synthetic finding traced from source text through a correction into a second release.
Not in slice 1: AI model calls, uploads, payments, hosting, standards content.
