# ADR-003: Where calculation records live in the contract

Status: proposed (needs Cory's approval; changes the spec contract)
Date: 2026-11-03

## Problem
Spec section 16 says every calculation must record its formula, inputs, units, rounding, and limitations, and that reported, derived, and corrected values are separate records. The v0.1 contract (`review_contract.schema.json`) has no place to store them.

## Built so far
`CalcRecord` in `packages/domain/src/calc/record.ts`, with helpers for the ratio, monitoring coverage, and moisture scale checks. A "not computable" result is also a record, so a review can explain why it gave no number.

## Proposal
Add an optional `calculations` list to the case snapshot in a v0.2 schema, one `CalcRecord` per calculation, each linking to its source evidence ids. Findings may reference calculation ids. Integrity checks would reject a finding that cites a number with no matching record.

## Options
1. Add `calculations[]` to the schema as v0.2 (recommended).
2. Keep records outside the snapshot in a separate table. Simpler, but a release would no longer carry its own numbers.

## Consequences
Option 1 means a version bump and a small migration of the generated types. Existing v0.1 snapshots stay valid.
