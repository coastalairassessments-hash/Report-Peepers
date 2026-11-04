# Brick 10: Contract v0.2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the case snapshot a place to store the calculation records and the extra fields the plain-code checks already use, as decided in ADR-003 (accepted), without breaking any v0.1 snapshot.

**Architecture:** A new schema file `docs/spec/review_contract.v0.2.schema.json` copied from v0.1 with additions only. The v0.1 file is not edited. Every new field is optional, so a v0.1 snapshot is still valid under v0.2 rules once `schema_version` is accepted as "0.1" or "0.2". Generated types and `validateCaseSnapshot` follow the schema. Integrity checks start reading the stored fields and keep falling back to the separate inputs they take today.

**Tech Stack:** TypeScript, ajv, json-schema-to-typescript, vitest.

**Spec:** ADR-003; `docs/spec/MASTER_SPEC.md` section 16; `packages/domain/src/calc/record.ts`.

## Global Constraints

- Confirmed decisions C01-C10 are untouched. The v0.1 schema file stays byte-for-byte unchanged (a test checks its hash).
- All additions optional. A v0.1 snapshot, including `example_case.json`, validates and passes integrity checks exactly as before.
- No new numeric thresholds in code (D07).
- Types check and all tests pass before each next task. Commit after each task.
- Synthetic data only.

## Review Focus

- A v0.1 snapshot with `schema_version: "0.1"` still validates; a v0.2 snapshot with `"0.2"` validates; any other version fails with a clear message.
- Version routing picks the schema by `schema_version`. A snapshot labeled "0.1" that carries v0.2-only fields is rejected, because the v0.1 schema forbids extra fields. Test it.
- A finding citing a number with no matching calculation record is flagged; a finding citing a "not computable" record is fine and must say why.
- A calculation whose source evidence id does not exist is a dangling reference.
- Reported, derived, and corrected values stay separate records (spec 16); a correction links to what it corrects and never overwrites it.
- Reference `published_on` unreadable or missing must still block a verified departure and never throw (as in Brick 8).
- Scope conflict stored as structured accounts must still produce the same `scope_conflict_unrecorded` behavior.

## Tasks

### Task 1: The v0.2 schema file and version routing

**Files:**
- Create: `docs/spec/review_contract.v0.2.schema.json`
- Modify: `packages/contracts/src/validate.ts`, `packages/contracts/package.json` (gen script for v0.2 types)
- Test: `packages/contracts/test/` (new `v02.test.ts`)

**Interfaces:**
- New top-level optional `calculations[]`: `id`, `kind`, `formula`, `inputs[]` (value, unit, evidence_id), `rounding`, `result` (value, unit, or `null`), `not_computable_reason`, `limitations[]`, `record_type` (reported, derived, corrected), `corrects_id`, `source_evidence_ids[]`. Shape follows `CalcRecord`.
- New optional fields exactly as in ADR-003: Reference `publication_status`, `published_on`; snapshot `report_issued_on`, `expected_area_names[]`; Finding `assumptions[]`, `calculation_ids[]`; Release `reviewer_conflict_disclosure`; Scope `conflict_accounts[]` (agreement account, client account, sources).
- `validateCaseSnapshot` routes by `schema_version` ("0.1" or "0.2").

- [ ] Step 1: Write failing tests: v0.1 example still valid; same example with `"0.2"` valid; a v0.2 snapshot with a calculation valid; a bad calculation (missing formula) invalid; v0.1 file hash unchanged.
- [ ] Step 2: Run, confirm fail. Step 3: Build the v0.2 schema, regenerate types, route validation. Step 4: Run all tests and typecheck.
- [ ] Step 5: Commit "Brick 10.1: contract v0.2 schema".

### Task 2: Store and check calculation records

**Files:**
- Modify: `packages/domain/src/calc/record.ts` (convert to and from the stored shape), `packages/domain/src/integrity.ts`
- Test: `packages/domain/test/integrity.test.ts`, `packages/domain/test/calc/record.test.ts`

**Interfaces:**
- Issue codes: `calculation_source_missing` (dangling evidence id), `finding_number_without_calculation` (finding lists `calculation_ids` that do not exist), `correction_overwrites` (a corrected record with no `corrects_id`, or pointing at a missing record).

- [ ] Step 1: Failing tests for each issue code, plus a round trip: a `CalcRecord` stored in a snapshot and read back is identical.
- [ ] Step 2: Run, confirm fail. Step 3: Implement. Step 4: Run all tests and typecheck.
- [ ] Step 5: Commit "Brick 10.2: calculation records in the snapshot".

### Task 3: Checks read the stored fields

**Files:**
- Modify: `packages/domain/src/referenceTiming.ts`, `packages/domain/src/areas.ts`, `packages/domain/src/intake.ts`, `packages/domain/src/integrity.ts`
- Test: matching existing test files

**Interfaces:**
- Reference timing reads `publication_status` and `published_on` from the reference when present; falls back to the separate input.
- Area check reads `expected_area_names` and `report_issued_on` when present.
- Scope conflict reads `conflict_accounts` when present; the text-in-description form still works for v0.1.
- New rules: a finding with `assumptions` empty on a cause claim is flagged `cause_finding_without_assumptions` (E2); a published release with no `reviewer_conflict_disclosure` is flagged `publish_missing_conflict_disclosure` (E5), v0.2 snapshots only.

- [ ] Step 1: Failing tests, one per field, each also proving the v0.1 fallback still passes.
- [ ] Step 2: Run, confirm fail. Step 3: Implement. Step 4: Run all tests and typecheck.
- [ ] Step 5: Commit "Brick 10.3: checks use v0.2 fields".

### Task 4: Coverage, notes, roadmap

**Files:**
- Modify: `tests/evaluations/cross_examination_coverage.json` (XC008 conflict disclosure, XC012 as far as covered), `tests/evaluations/coverage.json` where a scenario now has a named test, `docs/EXPERT_WITNESS_REVIEW.md` (E2, E5 done), `docs/ROADMAP.md`, regenerate `docs/EVALUATION_SCORECARD.md`

- [ ] Step 1: Update maps only for tests that exist. Step 2: `npm run check`; commit, push, confirm CI green.

**Exit:** v0.2 schema live beside untouched v0.1; calculation records stored and checked; E2 and E5 enforced; CI green.
