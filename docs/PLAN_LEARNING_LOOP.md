# Plan: the learning loop (Bricks 20a-20c)

Status: approved by Cory 2026-11-06. 20a, 20b, 20c built (synthetic data only). Not yet wired to storage or to the release step (Brick 19).

## Already built (ADR-005, Brick 14)
- Summary record builder with allow-listed fields and a fail-closed scrub.
- Flaw-pattern codes (`data/flaw-patterns/patterns.json`), storage port (in memory), and `countPatterns` with a minimum group size.

## What is missing
**20a. Monthly pattern report.** Takes saved records and returns, per month and service type: top flaw patterns, top clarification questions (grouped by wording), how often items were resolved later, how often the reviewer changed an item. Groups under the minimum size are hidden. Pure function plus a markdown view for Cory.

**20b. Software-weakness report.** From case outcomes, not documents: how often cases land in needs_attention and why (which automatic gate), how often wording was withheld by the scrub, how many items were tagged `other`. This tells us where the software is weak.

**20c. Suggested library entries.** When `other` items or a repeated question reach a set count, the system drafts a library entry with status `ai_draft`. It goes through the existing review path (two licensed reviewers, then owner approval). Code never publishes it.

## Guards (tests first)
- Reports read only SummaryRecord fields; a test proves no case id, date, or document text can appear.
- Small groups are hidden (min size stays an open decision, L18).
- A suggested entry can never start with any status other than `ai_draft`.
- Nothing retrains a model. Nothing edits live questions.

## Not in scope
Storage vendor, retention numbers, the terms line (attorney list), the notes-vault view.

## Order
20a, then 20b, then 20c. Types and tests green before each next step.
