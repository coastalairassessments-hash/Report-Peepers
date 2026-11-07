# Phase 0-A: Repository audit

Read-only. Date 2026-11-07. Nothing in application code was changed.

## State
- Branch `main`, HEAD `b04c388` (Brick 22c), working tree clean. This is the same commit the handoff review names (`b04c3889…`).
- Instructions found: `CLAUDE.md` (plan first, no code without Cory's approval, tests green before each step, C01-C10 preserved). No `AGENTS.md` exists. Decisions: `docs/spec/DECISIONS.md` (C01-C10), ADR-001 to ADR-006, `docs/decisions/STACK_BEFORE_BRICK_19.md`, `docs/expert/VOICE_RULE.md`.
- Executed here, at this commit: `npm run typecheck` (0 errors) and `npx vitest run` (825 passed, 1 skipped, 74 files). Not executed: `npm run scorecard`, the Typst render of the proof PDFs, any live model call.
- The repository is public. Nothing from the vault may be committed here.

## Interfaces that exist
| Piece | File | What it is |
|---|---|---|
| Library entry | `packages/domain/src/knowledge/library.ts` | `Entry` (hand-written type), 56 drafts in `data/knowledge/seed_v2.1.json`; `validateLibrary` is an import-only validator (requires `ai_draft`, `production_enabled=false`, `research_hint_unverified`, 4 unexecuted fixtures) |
| Status | `knowledge/status.ts` | `statusOf`: 2 distinct `iep` accepts + 1 `owner` approve on the current version; `isLive` adds "every fixture executed and passed" |
| Logs | `knowledge/log.ts` | append-only JSON per entry in `data/knowledge/decisions` and `edits` |
| Source rights | `references/rights.ts` | rules on `Reference` (authorized needs `permission_record_id`; pending/blocked/metadata-only may be named only; no training; withdrawn/superseded not approved for output). Called from `integrity.ts` |
| Model port | `engine/port.ts` | bounded request, text reply, no tools |
| Review checks | `data/rules/inspection_checklist.json` (104 items `CK-nnn`), `inspection/*` | the rules that actually run |
| Library-to-check map | `data/knowledge/mapping.json` | 56 rows: 32 covered, 13 partial, 8 parked, 3 new |
| Interview | `interview/gaps.ts`, `flow.ts`, `result.ts` | client-only; answers tagged saw/told/unknown; no free text |
| Release | `pipeline/autoRelease.ts` | gates: wording, no_citations, contract_valid, integrity, quotes_verbatim, source_intact, entitlement, readable, held_back_limit, suspicious_content |
| Revisions | `revision.ts` | classifies finding changes between snapshots, fingerprints a snapshot |
| Contract types | `packages/contracts/src/types*.ts` | GENERATED from `docs/spec/review_contract*.schema.json` (`npm run gen`). Never hand-edit |

## Findings (most important first)
**R1. Nothing in the pipeline reads the library.** `statusOf` and `isLive` are called only from tests. The only non-test import of `knowledge/library.ts` is two regexes in `analysis/suggestEntries.ts`. Customer behavior comes from `data/rules/*` (the 104 checklist items and consistency rules). Approving an entry today changes no customer output. The vault must therefore export into the checklist/rule path, not into the entry file.

**R2. No fixture runner exists.** Fixtures are prose (`given` / `expect`), 224 of them, 0 executed. `isLive` takes a `TestResults` map from its caller, and no code produces it.

**R3. Test results are not bound to a version.** `TestResults` is keyed by fixture id only. A pass would carry over to a changed entry, a changed rule file or a new engine.

**R4. Reviewer authority is not established.** `Decision.reviewer` and `.role` are free text; `recordDecision` only requires a non-empty name. All 52 recorded decisions are one reviewer, role `iep`. "Two distinct IEP accepts" is a string comparison and cannot be met until a second licensed reviewer exists. Nothing signs or authenticates a decision beyond git commit access.

**R5. No validator for an activated pack.** `validateLibrary` rejects anything not a draft, by design.

**R6. `Entry` has no provenance.** `source_hints` is free text. No source ids, passage ids, content hash, pack version, or revocation.

**R7. Interview gaps against the handoff.** Built: who is the client (implicit), saw/told/unknown, time answered. Missing: time described, corroborating document references, separate original and supplemented views, an inspector-answers mode. Inspector mode is parked by Cory's decision (we talk only to the client).

**R8. Contradiction checks.** The five remaining checks (HANDOFF item 5) are not built. The "two verified passages with compatible location, date, material, method" rule is the right design for them. I did not verify that every existing consistency rule meets it.

**R9. Wording conflict.** The handoff prompt says not to justify customer wording with "industry guidelines or equivalent claims". Our decided voice (2026-11-05, `VOICE_RULE.md`, `noCitations.ts`) says customer words say "common practice". These may conflict. Needs Cory's decision.

**R10. Fixture mismatch confirmed (IEP-K-001, T2).** The `given` says the missing attic is an internal gap and "a completeness question is appropriate". The `expect` says "No question; suppression reason recorded". The family decision for F01 (Cory, 2026-11-05) pauses "was something left out" questions, and C03/C04 require confirming scope first and never treating missing documentation as proof of non-performance. So `expect` matches the intent and the `given` sentence is wrong. Proposed fix: reword `given` to say whether a question is asked depends on the client-confirmed scope. A reviewed edit, not a silent change.

**R11. Release controls hold.** ADR-006 automatic release with optional human mode, the gates above, anchor checks, wording, rights and markup are intact and tested. Nothing in the vault plan touches them.

**R13. Mapping conflict (IEP-K-030).** See Documentation conflicts. The exporter must refuse a mapped entry whose row still says CONFLICT.

**R12. Retrieval before AI.** Today the model sees only case material plus fixed instructions. It never receives library text. That must stay true: the vault never feeds a customer run except through an approved, pinned pack.

## Documentation conflicts
- Handoff prompt "Cory King" vs repository records: no effect.
- Stars: ADR-004 forbids grading marks. Preserved. No symbol change proposed.
- `MASTER_SPEC` D05 (human review of every pilot release) is replaced by ADR-006. Preserved.
- The full handoff package (01-05) was read. The research archive (Sections 12-29) and the desktop folder were not provided.
- `mapping.json` calls itself an engineer's draft. Row IEP-K-030 carries an unresolved conflict: Cory's cause-and-repair rule says never ask who repaired it or when, but the mapped checks CK-080 and CK-068 may. Confirmed in the file. Needs Cory's decision before that entry is mapped or exported (R13).
- Older README/HANDOFF text lags the interview work. Real interfaces and accepted decisions win.
