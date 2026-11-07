# Phase 0-E: Integration contract (vault to Report Peepers)

Rule: reuse what exists. No second review engine, no parallel markup path. Generated types (`packages/contracts/src/types*.ts`) are changed only by editing the schema in `docs/spec/` and running `npm run gen`.

## Mapping
| Vault | Report Peepers today | How it connects |
|---|---|---|
| Source `SRC-` (legal_access) | `Reference` in the contract (`ai_use_status`, `permission_record_id`, `allowed_uses`) and `references/rights.ts` | A source's `legal_access` maps to `ai_use_status`; the same rights rules run on the pack's source list |
| Passage `SRC-#` | none (`Entry.source_hints` is free text) | Internal only. Never exported to customer text |
| Claim `CLM-` | `Entry.principle` / `rationale` | The Entry gains `claim_ids`, `source_passage_ids`, `content_hash` (hand-written type in `knowledge/library.ts`) |
| Proposed check `CHK-` | `ChecklistItem` in `data/rules/inspection_checklist.json` (`id`, `group`, `topic`, `looks_for`, `needs`, `applies_when`, `materiality`, `leading_question`, `record_request`) | An approved CHK exports as one checklist item. Note: `leading_question` there means "the question placed first on the page", not a leading question in the bad sense |
| Library entry `IEP-K-` | `data/knowledge/mapping.json` links entries to `CK-` ids | Mapping stays the bridge; the exporter refuses an entry with no mapped check |
| Interview gap | `data/rules/interview_gaps.json`, `interview_outcomes.json` | A CHK that needs client information exports a gap rule; fixed notes follow the existing `ai_draft` to `approved` flow |
| Done well | `done_well` from checklist items found supported | No change. Wording stays the existing fixed templates |
| Customer wording | `wordingProblems`, `citationProblems`, `NAMES_STANDARD`, `NUMERIC_LIMIT` | Run on every exported sentence. Failure blocks the pack |
| Release | `autoRelease.ts` gates | Unchanged. A pack never bypasses a gate |
| Provenance | `provenance.run_id`, `model_version`, `input_snapshot_sha256` in the snapshot | Pack hash recorded first on `CaseRecord` (system field, no contract change). A snapshot field needs a schema v0.4 and `npm run gen`: deferred |

## New pieces (all in `packages/domain`, none touch generated files)
- `knowledge/pack.ts`: `Pack` type, `validatePack` (rights, wording, fixture binding, hash), `loadPack`.
- `knowledge/fixtureRunner.ts`: executes a fixture against the real check code and returns a result bound to `entry content hash + rule file hash + engine version`.
- `knowledge/reviewers.ts`: reviewer registry check used by `statusOf` so only registered reviewers' decisions count.
- `knowledge/status.ts`: `isLive` takes bound results; a result for another hash does not count.
- `pipeline/types.ts`: optional `Services.pack` and `Services.packMode: "off" | "shadow" | "on"`.

## Gaps and migrations
1. Library and pipeline are disconnected (R1). Migration: the exporter writes a pack; `inspection` builders read checklist items from the pack when mode is `on`, else from `data/rules` as today.
2. Existing 56 drafts and 52 decisions keep working unchanged. They become `legal_access: own_work`, `technical_verification: unverified`.
3. Shadow mode: run the pack beside the current rules on synthetic cases, record the differences, change nothing for customers.
4. Fixture text fix for IEP-K-001 T2 goes through the existing edit log (R10), reviewed by Cory.
5. Interview additions (time described, corroborating document references, original vs supplemented views) are new optional fields on the answer record; the store's field whitelist is updated deliberately in the same change.
6. Pack hash on the snapshot is deferred to a schema v0.4.

## Not changed
`autoRelease` gates, markup export, anchors, retention, access, the model port (still no tools).
