# ADR-001: Pricing models and the Pro tier

Status: accepted by Cory, 2026-11-03
Owner: Cory
Date: 2026-11-03

## Ideas on the table
1. Homeowner pays a flat fee per report.
2. Pros (industry professionals) subscribe for a limited number of reports, then buy extra "tokens" for more.

## Proposed decision
- Launch with (1). It matches confirmed decisions C01-C02 (independent review, nominal flat fee, no upsells).
- Treat (2) as a separate, later product. The spec lists professional subscriptions as an unapproved suggestion (MASTER_SPEC section 2), so adding it needs an explicit owner decision.
- Design billing as "credits": one homeowner report = 1 credit; a Pro plan = N credits per month + top-up packs. Core code only asks "valid credit for this case?" (entitlementVerified fact in the case state machine). Pricing can change without rebuilding.

## Owner rationale
Homeowners come first. Pros will adopt after their own reports have been reviewed, and will then want to check reports before they issue them. The Pro tier is therefore a pre-issue check, built after the homeowner product is proven.

## Open issues before any Pro tier
- Conflict of interest: a subscribing Pro may be the author of a report under review, or a competitor of that author.
- No inspector scoring or ranking (C02) must hold for Pro accounts.
- Pro use is likely a pre-delivery self-check, which is a different workflow from a homeowner's second opinion.
- Any link to IndoorIQ or CAA needs conflict disclosure (MASTER_SPEC section 25).
- Fee amounts, credit sizes, refunds: still open business decisions (G05).

## Consequences
Payment build stays deferred. No code depends on a price.
