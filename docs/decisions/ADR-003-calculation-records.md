# ADR-003: Contract additions for v0.2 (calculation records and related fields)

Status: accepted by Cory, 2026-11-03 (option 1). Build plan: docs/superpowers/plans/2026-11-03-brick-10-contract-v0.2.md
Date: 2026-11-03

## Problem
Spec section 16 says every calculation must record its formula, inputs, units, rounding, and limitations, and that reported, derived, and corrected values are separate records. The v0.1 contract (`review_contract.schema.json`) has no place to store them.

## Built so far
`CalcRecord` in `packages/domain/src/calc/record.ts`, with helpers for the ratio, monitoring coverage, and moisture scale checks. A "not computable" result is also a record, so a review can explain why it gave no number.

## Proposal
Add an optional `calculations` list to the case snapshot in a v0.2 schema, one `CalcRecord` per calculation, each linking to its source evidence ids. Findings may reference calculation ids. Integrity checks would reject a finding that cites a number with no matching record.

## Further fields the Brick 8 checks need
The checks are built and tested using separate inputs because the v0.1 contract has no place for these. Proposed v0.2 additions:
- Reference: `publication_status` (published, draft, withdrawn, superseded) and `published_on`.
- Snapshot: `report_issued_on`, and `expected_area_names` (rooms the client expects the report to cover).
- Finding: `assumptions[]` (expert-witness review E2).
- Release: `reviewer_conflict_disclosure` (E5).
- Scope conflicts: structured accounts (agreement and client) instead of text inside the description.

## Options
1. Add `calculations[]` to the schema as v0.2 (recommended).
2. Keep records outside the snapshot in a separate table. Simpler, but a release would no longer carry its own numbers.

## Consequences
Option 1 means a version bump and a small migration of the generated types. Existing v0.1 snapshots stay valid.
