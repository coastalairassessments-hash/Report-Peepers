# ADR-002: Retention and common-flaw pattern tracking

Status: accepted by Cory (direction), 2026-11-03
Owner: Cory

## Decision
1. Customer documents are deleted after the retention window (spec default 90 days after last activity). We do not build a stored collection of reports, and no list of "bad" reports or inspectors (C02).
2. We do keep a pattern log of common flaws. Each entry is only:
   - report type and service type
   - finding type and a flaw-pattern code (for example "cause stated without supporting history")
   - whether the finding was later resolved by new information
   - whether a human reviewer changed it
   No names, no locations, no addresses, no report text, no photos.
3. Pattern counts may inform IndoorIQ and other software (what to prompt users to capture). Only aggregated counts leave the review system, never documents.
4. Purchase terms include a plain line that anonymous flaw patterns are counted to improve reviews.

## Open items
- Any IndoorIQ link still needs conflict disclosure (MASTER_SPEC section 25) and an explicit go-ahead.
- Whether the consent line is a checkbox or part of terms: legal review (G02).
- Optional paid homeowner "vault" for longer storage: deferred.

## Consequences
Storage cost stays near zero. Pattern log becomes a small table fed by finding records; built after Brick 5.
