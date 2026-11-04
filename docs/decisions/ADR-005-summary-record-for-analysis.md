# ADR-005: A code-only record of each summary is saved for analysis

Status: accepted by Cory, 2026-11-04. Updated the same day: Cory wants the summary wording itself saved, because the deficiencies carry no client or inspector information. The scrub guard below is how that stays true. The field list is proposed; it applies ADR-002 to the closing summary page (ADR-004).
Date: 2026-11-04

## Decision
When a review is released, the system saves one small record built from the closing summary and keeps it after the customer's documents are deleted. IndoorIQ uses these records to see which flaws are common and what to prompt users to capture.

The record holds the summary's items, for analysis:
- release month (not the exact date), report type, service type
- for each item: the short title, the clarification question, and the next step, as printed on the summary page, plus finding type, decision relevance, evidence strength, a flaw-pattern code, whether new information later resolved it, and whether the human reviewer changed it
- a random record id that cannot be traced back to the case

Never saved: finding explanations, page numbers, anchors, text quoted from the report, names of any person, company, lab, or inspector, addresses or locations, photos, scope text, case ids, customer ids, and exact dates.

## Why a scrub comes first
Summary wording is written about one report and could still carry a name or place by accident (an inspector's company in a title, a street in a question). Cory's rule is "we don't care about the whos or the location, we want the common flaws" (ADR-002). So wording is saved only after a scrub that fails closed:
- The scrub removes or blocks emails, phone numbers, web addresses, street addresses, ZIP codes, license and permit numbers, and any name the case itself lists (client, property address, inspector, company, lab, signers).
- Any item the scrub flags is saved as codes only, with its wording withheld, and is listed for the reviewer.
- The reviewer confirms the saved wording at approval. The customer's marked-up report, with page numbers and quotes, stays with the customer and is deleted on the retention schedule.

## Flaw-pattern codes
A controlled list in `data/flaw-patterns/patterns.json`. The reviewer tags each item from the list when approving; the AI may suggest a tag, code decides nothing. An item that fits no code is tagged `other` and queued for a new code. The first list is a draft seeded from the spec's worked case; the field expert (input I2) owns the real list. The contract needs an optional pattern-code field on a finding (a later contract version, needing Cory's approval before it is built).

## Guards
- A builder function turns an approved result into the record using an allow-list of fields. Tests prove no id, date, explanation, quote, or page reference can pass through, and that a title containing a listed name, email, phone number, or address is withheld.
- Reports are never leaked by small groups: aggregated results are only shown or shared when a group is large enough. The minimum group size is not set here; Cory and the attorney decide it (L18).
- Storage sits behind a port with an in-memory version first. No vendor is chosen.

## Consequences
- New Brick 14 after the red-ink renderer: pattern list, record builder, storage port, tests.
- Purchase terms must say anonymous flaw patterns are saved and counted (ADR-002 item 4).
- Attorney item L18.
