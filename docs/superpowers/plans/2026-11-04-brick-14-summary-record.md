# Brick 14: The Saved Summary Record (ADR-005) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [x]`) syntax.

**Goal:** When a review is released, build one small anonymous record from the closing summary (wording plus codes), keep it after the customer's documents are deleted, and be able to count common flaw patterns without ever exposing a small group.

**Architecture:** Four small pure parts: a controlled **pattern list** (file), a fail-closed **scrub**, a **record builder** with an allow-list, and a **storage port** with an in-memory version plus a **counter** that hides small groups. Nothing here calls a model; the reviewer's tags decide the codes.

**Spec:** `docs/decisions/ADR-005-summary-record-for-analysis.md`, `ADR-002`, `ADR-004`; attorney item L18.

## Global Constraints
- Synthetic data only. No vendor, no database, no network.
- Allow-list, not block-list: the record is built by naming each field it may hold. Anything else cannot pass, even if added to the input later.
- Never in a record: ids of any kind, exact dates, explanations, quoted report text, page numbers, anchors, names, addresses, photos, scope text.
- Scrub fails closed: a flagged item keeps its codes and loses its wording, and is listed for the reviewer.
- No change to contract v0.2. The reviewer's pattern tags travel beside the approved view as a separate input; adding a tag field to the contract is a later version and needs Cory's approval.
- Minimum group size is not decided (L18). It lives in `data/rules/analysis.json` as a clearly marked placeholder owned by Cory and the attorney; the counter refuses to run without it.
- Types check and tests pass before each next task. Commit after each task.

### Task 1: Flaw-pattern list
**Files:** Create `data/flaw-patterns/patterns.json` (draft seeded from the spec's worked case, each code with a one-line plain meaning; includes `other`), `packages/domain/src/analysis/patterns.ts` (`loadPatterns`, `isKnownCode`), `test/analysis/patterns.test.ts`.
- [x] Failing tests: codes are unique and stable-format; `other` exists; an unknown code is rejected; every code's meaning passes the wording rules.
- [x] Implement, run all tests and typecheck, commit "Brick 14.1: flaw-pattern list".

### Task 2: The scrub
**Files:** Create `packages/domain/src/analysis/scrub.ts`, `test/analysis/scrub.test.ts`.
- `scrubText(text, blockedNames) => { ok: true, text } | { ok: false, reasons[] }`. Flags emails, phone numbers, web addresses, street addresses, ZIP codes, license and permit numbers, and any blocked name (case-insensitive, whole-word, also when split by punctuation).
- `blockedNamesFrom(snapshot)`: client, property address, inspector, company, lab, and signer names the case lists (first task step: confirm which snapshot fields hold them).
- [x] Failing tests for each category, near-misses that must pass (ordinary building words, "page 2" style text is not a name), and a property test that a blocked name never survives.
- [x] Implement, run all tests and typecheck, commit "Brick 14.2: scrub".

### Task 3: The record builder
**Files:** Create `packages/domain/src/analysis/record.ts`, `test/analysis/record.test.ts`.
- `buildSummaryRecord(view, facts, tags, randomId) => SummaryRecord`: release month, report type, service type; per item the title, first question, next step (only if scrub passes), finding type, decision relevance, evidence strength, pattern code, resolved-later flag, reviewer-changed flag. Returns also `withheld[]` for the reviewer.
- Only releases that are published and unchanged build a record. A missing or unknown tag becomes `other` and is listed.
- [x] Failing tests: fixed field list (the record's keys never change shape); a property test that random text placed in every disallowed field never appears in the output; a title holding a listed name, email, phone, or address is withheld while its codes stay; month not date; the id cannot be derived from any case id.
- [x] Implement, run all tests and typecheck, commit "Brick 14.3: record builder".

### Task 4: Storage port and the counter
**Files:** Create `packages/domain/src/analysis/store.ts`, `counts.ts`, `data/rules/analysis.json`, tests.
- `RecordStore` port with an in-memory version: `save`, `all`. Records carry no link to a case, so deleting a customer's documents leaves them untouched.
- `countPatterns(records, minGroup)` returns counts by pattern code; a group below the minimum is reported only as "fewer than the minimum", never as a number, and totals cannot be used to work it out.
- [x] Failing tests: small groups hidden; hiding cannot be undone by differencing two reports; the counter refuses to run if the minimum is missing; deleting a case leaves its record.
- [x] Implement, run all tests and typecheck, commit "Brick 14.4: store and counter".

### Task 5: Coverage, notes, roadmap
- [x] Update coverage maps only for tests that exist, mark Brick 14 done in `docs/ROADMAP.md`, record open items (pattern list owner I2, group size L18, contract tag field, purchase-terms wording), run `npm run check`, push, confirm CI green.

**Built notes:** the scrub blocks names that intake supplies plus words in document file names (the snapshot has no party-name fields). Reviewer tags and the resolved/changed flags travel beside the approved view. The builder is meant to run once per release; the store refuses a repeated record id, but two builds of the same release make different random ids, so the release flow must call it only once.

**Exit:** a published synthetic review produces one anonymous record that holds the summary wording only when the scrub passes, no identifying field can reach it, and counts never reveal a small group. Next: the hand-off to real storage and the reviewer console.
