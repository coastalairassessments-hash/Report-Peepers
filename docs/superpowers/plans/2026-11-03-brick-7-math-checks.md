# Brick 7: Math Checks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Plain, tested code for the calculations the spec says must never be done by the AI (spec section 16).

**Architecture:** Four small pure functions in `packages/domain/src/calc/`. Each returns either a result or an explicit "not computable" with a reason. Each result records formula, inputs, units, rounding, and limitations. No function guesses, interpolates, or divides by zero.

**Tech Stack:** TypeScript, vitest (same as Bricks 1-6).

**Spec:** `docs/spec/MASTER_SPEC.md` sections 10, 11.4, 16; scenarios TC014, TC017, TC022, TC023, TC024 in `docs/spec/evaluation_cases.json`.

## Global Constraints

- Calculations run outside the language model (section 16).
- A nondetect or zero denominator is never a numeric zero suitable for division (11.4).
- A comparative meter scale is never converted to percent moisture content (16).
- Monitoring gaps are shown, never interpolated or hidden (10, 16).
- Reported, derived, and corrected values are separate records (16).
- No health thresholds, no universal ratios or limits (11.4, D07).
- Any threshold (low raw count, day-completeness percent, gap factor) is a named parameter supplied by an approved rule file, never a constant in code (D07). Until the IH supplies values, the default is "no threshold", and the result reports raw numbers plainly.
- Every numeric input carries its unit; mixed units are refused (section 16: cm2 is not m3).
- Inputs come from AI extraction, so every function validates at runtime, not only by type.
- Types check and all tests pass before each next task. Commit after each task.

## Review Focus

- Outdoor result is nondetect, zero, negative, NaN, or missing: expect "not computable", never a number or Infinity.
- Indoor result is nondetect with a detected outdoor value: expect "not computable", not a ratio of 0.
- Total-spore and single-group values compared with each other: expect refusal (different bases).
- Very low outdoor raw count (for example 4): expect a number plus a clear "unstable" limitation.
- Timestamps unsorted, duplicated, invalid, or in mixed offsets: expect flagged, not silently fixed.
- Series with one reading or none: expect "not enough data", not 100% coverage.
- Moisture value given as text or with a missing scale: expect "unknown scale".
- Event time unknown: expect "unknown", not before or after.

---

### Task 0: Housekeeping and one bug fix (before any new feature)

**Files:**
- Create: `package.json` (npm workspaces: `packages/*`), `.github/workflows/ci.yml`
- Modify: `packages/domain/src/*.ts` (import `@report-peepers/contracts` instead of `../../contracts/src/...`)
- Modify: `packages/domain/src/integrity.ts` (PROHIBITED list)
- Test: `packages/domain/test/integrity.test.ts`

- [ ] Step 1: Write failing tests: "below grade foundation wall", "sloped grade directs water", and "risk score" in a report-derived sentence must NOT trigger `prohibited_language`; "inspector grade: B" and "assigned a score of 40 to the inspector" still must.
- [ ] Step 2: Run, confirm the first group fails today (confirmed: "grade" and "score" currently block ordinary building terms).
- [ ] Step 3: Narrow the patterns to scoring-of-people/reports phrasing (grade/score/rank + inspector|report|contractor|company).
- [ ] Step 4: Add the root workspace so one `npm test` and one `npm run typecheck` cover every package; replace relative cross-package imports.
- [ ] Step 5: Add CI that runs install, typecheck, test, and the scorecard on every push and pull request.
- [ ] Step 6: Run everything green locally, commit, push, and confirm CI passes on GitHub.

### Task 1: Indoor/outdoor ratio (TC023, TC024)

**Files:**
- Create: `packages/domain/src/calc/ratio.ts`
- Test: `packages/domain/test/calc/ratio.test.ts`

**Interfaces:**
- Produces: `type Measured = { kind: "detected"; value: number; unit: string; rawCount?: number } | { kind: "nondetect"; limit?: number; unit: string } | { kind: "unknown" }`
- Produces: `type Basis = { type: "total" } | { type: "group"; name: string }`
- Produces: `indoorOutdoorRatio(indoor: Measured, outdoor: Measured, basis: { indoor: Basis; outdoor: Basis }, opts?: { lowRawCountAtOrBelow?: number }): RatioResult`
- Produces: `type RatioResult = { status: "ok"; ratio: number; formula: string; rounding: string; limitations: string[] } | { status: "not_computable"; reason: "outdoor_nondetect" | "indoor_nondetect" | "unknown_value" | "invalid_value" | "basis_mismatch" | "unit_mismatch"; explanation: string }`

- [ ] Step 1: Write failing tests: 5027 / 53 gives 94.8 (spec: about 95); outdoor nondetect gives `not_computable` (never Infinity); indoor nondetect gives `not_computable`; zero, negative, NaN give `invalid_value`; basis "total" vs "Aspergillus/Penicillium-like" gives `basis_mismatch`; unit "structures/m3" vs "cm2" gives `unit_mismatch`; raw count 4 with `lowRawCountAtOrBelow: 5` gives `ok` plus a limitation containing "low outdoor raw count", and with no option set the raw count is reported but no threshold is applied. Add property tests (fast-check): for any inputs the ratio is never NaN or Infinity, and `ok` always implies a positive finite ratio.
- [ ] Step 2: Run tests, confirm they fail.
- [ ] Step 3: Implement `ratio.ts`. Round to one decimal; record the formula `indoor / outdoor` and the rounding rule in the result.
- [ ] Step 4: Run tests, confirm they pass, and run `npm run typecheck`.
- [ ] Step 5: Commit "Brick 7.1: indoor/outdoor ratio with nondetect handling".

### Task 2: Monitoring coverage (TC014)

**Files:**
- Create: `packages/domain/src/calc/monitoring.ts`
- Test: `packages/domain/test/calc/monitoring.test.ts`

**Interfaces:**
- Produces: `monitoringCoverage(timestamps: string[], intervalMinutes: number, opts?: { completeDayAtLeastPercent?: number; gapAfterIntervals?: number }): CoverageResult`
- Produces: `type CoverageResult = { status: "ok"; start: string; end: string; expectedReadings: number; observedReadings: number; coveragePercent: number; gaps: { from: string; to: string; missingReadings: number }[]; completeDays: string[]; partialDays: string[]; flags: string[]; limitations: string[] } | { status: "not_computable"; reason: "too_few_readings" | "invalid_interval" }`

- [ ] Step 1: Write failing tests: a 7-day, 15-minute series with 4 days removed reports 3 complete days and one gap spanning the missing days (never "seven days"); no values are added; one reading gives `too_few_readings`; unsorted input is sorted and flagged `unsorted_input`; duplicates flagged `duplicate_timestamps`; an invalid timestamp flagged and excluded; interval 0 or negative gives `invalid_interval`.
- [ ] Step 2: Run tests, confirm they fail.
- [ ] Step 3: Implement. Defaults are strict: a day is complete only when every expected reading exists, and a gap is any step longer than one interval; callers may loosen both through `opts` using values from an approved rule file. Timestamps with offsets are compared as instants; days are dates as written. Record both as limitations. Add property tests: coverage never exceeds 100%, and observed plus missing equals expected.
- [ ] Step 4: Run tests and typecheck.
- [ ] Step 5: Commit "Brick 7.2: monitoring coverage and gaps".

### Task 3: Moisture reading scale (TC017)

**Files:**
- Create: `packages/domain/src/calc/moisture.ts`
- Test: `packages/domain/test/calc/moisture.test.ts`

**Interfaces:**
- Produces: `type MoistureScale = "percent_moisture_content" | "wood_moisture_equivalent" | "comparative" | "unknown"`
- Produces: `describeMoisture(value: number, scale: MoistureScale): { status: "ok"; label: string; isMoistureContent: boolean } | { status: "not_computable"; reason: "comparative_scale" | "unknown_scale" | "invalid_value"; label: string }`

- [ ] Step 1: Write failing tests: value 80 on `comparative` returns `not_computable` with a label like "meter reading 80 (comparative scale)" and never contains "percent"; `unknown` gives `unknown_scale`; `percent_moisture_content` gives `isMoistureContent: true`; `wood_moisture_equivalent` gives `isMoistureContent: false` and the label says "wood moisture equivalent"; NaN gives `invalid_value`.
- [ ] Step 2: Run, confirm fail. Step 3: Implement. Step 4: Run tests and typecheck.
- [ ] Step 5: Commit "Brick 7.3: moisture scale guard".

### Task 4: Chronology (TC022)

**Files:**
- Create: `packages/domain/src/calc/chronology.ts`
- Test: `packages/domain/test/calc/chronology.test.ts`

**Interfaces:**
- Produces: `splitByEvent(times: (string | null)[], eventAt: string): { before: number[]; after: number[]; unknown: number[] }` (indexes)
- Produces: `mixesAcrossEvent(times: (string | null)[], eventAt: string): { mixed: boolean; unknownCount: number }`

- [ ] Step 1: Write failing tests: measurements before and after a repair date give `mixed: true`; all before gives `mixed: false`; null times land in `unknown` and are never counted as before or after; invalid event date throws a clear error; same-instant times count as before.
- [ ] Step 2: Run, confirm fail. Step 3: Implement. Step 4: Run tests and typecheck.
- [ ] Step 5: Commit "Brick 7.4: chronology split".

### Task 5: Calculation record (contract gap)

The v0.1 contract has no place to store a calculation (spec section 16 asks for formula, inputs, units, rounding, and limitations, and says reported, derived, and corrected values are separate records).

**Files:**
- Create: `packages/domain/src/calc/record.ts` (type `CalcRecord` and a helper that wraps each calculator result)
- Create: `docs/decisions/ADR-003-calculation-records.md` (proposes adding `calculations[]` to the schema as v0.2; status: proposed, needs Cory)
- Test: `packages/domain/test/calc/record.test.ts`

- [ ] Step 1: Write failing tests: a record always carries `formula`, `inputs`, `units`, `rounding`, `limitations`, `derived: true`, and a `source_evidence_ids` list; a `not_computable` result is stored as a record too (so the review can say why no number was given).
- [ ] Step 2: Run, confirm fail. Step 3: Implement. Step 4: Run tests and typecheck.
- [ ] Step 5: Write ADR-003 as proposed; do not edit the spec schema without Cory's approval. Commit.

### Task 6: Update the scorecard

**Files:**
- Modify: `tests/evaluations/coverage.json` (TC014, TC017, TC022, TC023, TC024 to `covered`, each naming its exact test titles)
- Modify: `docs/EVALUATION_SCORECARD.md` (regenerate with `node scripts/scorecard.mjs`)

- [ ] Step 1: Update the five entries with real test titles from Tasks 1-4.
- [ ] Step 2: Run the full suite; the coverage test fails if any named test is missing.
- [ ] Step 3: Regenerate the scorecard, commit "Brick 7.5: scorecard update", push.

**Exit:** CI green on GitHub, the grade/score bug fixed, 5 more scenarios covered (11 total), all tests green.
