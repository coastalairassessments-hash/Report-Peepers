# ADR-007 (PROPOSED): Private knowledge vault and exported pack

Date: 2026-11-07. Status: PROPOSED, waiting for Cory. Nothing is built from it yet.

## Decision
1. **Separate private repository** for the vault (sources, passages, claims, proposed checks). This repository stays public and holds only code, schemas, synthetic fixtures and exported packs that are approved.
2. **Canonical authoring format:** one Markdown file per record with YAML front matter (Obsidian-readable). Code reads the front matter; the body is notes. Derived files (JSON, search index) are rebuilt and never edited.
3. **Stable ids, never reused:** `SRC-0001` source, `SRC-0001#p5-q2` passage, `CLM-0001` claim, `CHK-0001` proposed check. Existing `IEP-K-nnn` and `CK-nnn` keep their ids. A collision gets an explicit alias record. No merging on URL or similar title.
4. **Typed links** in front matter: `supports`, `qualifies`, `competes_with`, `counterevidence_for`, `applies_to`, `see_also`, `derived_from`. A body wikilink is a reading aid only and carries no meaning.
5. **Three knowledge levels** on every claim: `field_reference` (what to look for or ask), `diagnostic_science` (why it happens, competing explanations), `specialist_reference` (method detail and limits). Report Peepers exports a small, controlled selection.
6. **Four separate states** per claim, none implies another: `legal_access` (own_work, public, licensed, permission_recorded, pending, blocked, unknown), `technical_verification` (unverified, passage_checked, reviewer_verified), `applicability` (unscoped, scoped with conditions), `production_approval` (draft, in_review, approved, revoked). Unknown stays unknown. `legal_access` reuses the existing `ai_use_status` meaning and `rights.ts` rules.
7. **Approvals and revocation are append-only events** with reviewer id, role, time and the content hash of the version approved. A revocation is also an event and removes the item from the next pack. Old events are never edited.
8. **Reviewer registry** (id, role, license reference, active dates) in the private repo. Only a registered reviewer's event counts. Cory's roles (IEP and owner) are recorded as two separate roles.
9. **Derived index** (full-text or vector) is rebuildable, holds only items whose `legal_access` allows indexing, and is never a source of truth. Retrieval is filtered before any text reaches an AI.
10. **Export = a versioned pack:** a JSON file with a hash, built only from approved, applicable items whose fixtures were executed and passed against that exact content hash and engine version. It carries a manifest (source versions, approval event ids, fixture results, rights check, pack hash, rollback target). Report Peepers loads a pack through a validator, behind a flag (`off`, `shadow`, `on`). A case records the pack hash it used.
11. **Failure behavior:** if the pack is missing or invalid, use the last valid compatible approved pack if allowed, else abstain or `needs_attention`. Never fall back to drafts.
12. **Separation from customer cases:** customer reports never enter the vault and are never used for training. Vault records never contain case text. The learning loop (ADR-005) stays counts-only.

## Added after reading the full handoff package (02_SYSTEM_DESIGN)
- **More record types:** besides Source, Passage, Claim and Check: `Method` (inputs, units, instrument and mode, calibration, limits, what the result cannot support), `Relationship`, `Approval`, `FixtureRun` (fixture and check hashes, engine/rule/prompt version, actual result; `executed=true` alone is not proof), `ReleaseManifest`.
- **Link predicates:** `supports`, `qualifies`, `contradicts`, `alternative_explanation`, `evaluated_by_method`, `applies_to_assembly`, `supersedes`. "Related to" is not allowed to mean causation. Suggested links stay `proposed` until reviewed.
- **First index:** local SQLite with lexical search and typed links, disposable and rebuildable. No graph database, no embeddings, no autonomous agents, no fine-tuning, no second review engine at the start.
- **Markdown is the authority for content; events are the authority for decisions.** No competing editable database rows. Editing content changes its hash and ends its activation eligibility.
- **Status values stay as they are:** ai_draft, in_review, revise, discussion, rejected, iep_accepted, approved, parked. Import quarantine and source-access states are separate dimensions and never bypass Entry activation.
- **Separate dimensions:** extraction, rights, source verification, applicability, technical review, test execution, release eligibility.
- **Roles:** owner, author, technical reviewer, read-only. An invitation or edit access is not approval authority. Authenticated identity before any shared access.
- **Revocation:** blocks new use, lists affected packs and cases, queues an impact review, never rewrites a released review.
- **Evidence lineage:** ten summaries of one paper are one lineage. Repetition and agreement by another AI are not authority. Customer documents are never training data.

## Why
R1-R6 in `docs/vault/REPOSITORY_AUDIT.md`: today approving an entry changes nothing, results are not bound to a version, reviewer authority is a free-text name, and entries carry no provenance.

## Not decided here
Where the private repo lives and who has access (Cory). The search technology. The second licensed reviewer.
