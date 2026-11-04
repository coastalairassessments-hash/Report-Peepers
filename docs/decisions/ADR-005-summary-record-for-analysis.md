# ADR-005: A code-only record of each summary is saved for analysis

Status: accepted by Cory (direction), 2026-11-04. The field list below is proposed; it applies ADR-002 to the new closing summary page (ADR-004).
Date: 2026-11-04

## Decision
When a review is released, the system saves one small record built from the closing summary and keeps it after the customer's documents are deleted. IndoorIQ uses these records to see which flaws are common and what to prompt users to capture.

The record is built from codes and counts, never from the summary's words:
- release month (not the exact date), report type, service type
- for each item: finding type, decision relevance, evidence strength, a flaw-pattern code, whether new information later resolved it, whether the human reviewer changed it
- a random record id that cannot be traced back to the case

Never saved: item titles or explanations, page numbers, anchors or quoted text, names of any person, company, lab, or inspector, addresses or locations, photos, scope text, case ids, customer ids, and exact dates.

## Why codes and not the summary text
The summary text is written for one homeowner about one report and can contain names and places. ADR-002 and Cory's rule ("we don't care about the whos or the location, we want the common flaws") say the lasting record holds patterns only. The printed summary stays with the customer's deliverable and is deleted on the retention schedule.

## Flaw-pattern codes
A controlled list in `data/flaw-patterns/patterns.json`. The reviewer tags each item from the list when approving; the AI may suggest a tag, code decides nothing. An item that fits no code is tagged `other` and queued for a new code. The first list is a draft seeded from the spec's worked case; the field expert (input I2) owns the real list. The contract needs an optional pattern-code field on a finding (a later contract version, needing Cory's approval before it is built).

## Guards
- A builder function turns an approved result into the record using an allow-list of fields. A test proves no free text, id, date, or name can pass through, including when a finding's text contains a name.
- Reports are never leaked by small groups: aggregated results are only shown or shared when a group is large enough. The minimum group size is not set here; Cory and the attorney decide it (L18).
- Storage sits behind a port with an in-memory version first. No vendor is chosen.

## Consequences
- New Brick 14 after the red-ink renderer: pattern list, record builder, storage port, tests.
- Purchase terms must say anonymous flaw patterns are saved and counted (ADR-002 item 4).
- Attorney item L18.
