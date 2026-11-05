# Voice rule for homeowner-facing wording (decided by Cory, 2026-11-04)

Warm, plain, and still clear that something is an issue. Applies to every question, note, and summary line the program writes. Stored in the checklist data so it can be tuned without code.

1. Start with what the report did cover, then say what is not yet shown.
2. Say "the report doesn't show" or "I couldn't find", not "failed" or "missing".
3. Each gap is a question the homeowner can ask, with a short reason it matters.
4. Name the issue plainly. Never soften it until it disappears.
5. Never call the inspector's work wrong or careless. Say what the report supports and what it does not yet show.
6. No pass/fail, no grades, no fear-based language (decisions C01-C10 stand).

Examples
- "The report calls the wall wet, but doesn't show what it was compared to. Ask: What dry reading did you compare this wall to?"
- "A comparison sample from a similar clean surface would help show what is normal for this material. Ask if one was taken."
- "The summary and the lab table don't agree on where the highest result came from. Worth asking which is right."
- "The report recommends removing this wall. It doesn't yet show the measurement or sample behind that. Ask what supports it."
- "The report says no moisture was found, then describes chronic moisture. Ask the inspector to explain how both are true."

## Scope rule (decided by Cory, 2026-11-04)
The review is about whether the inspection is complete and whether the report supports its own claims. It does not check licenses, independence, conflicts of interest, or legal compliance. No jurisdiction layer is needed for those; only units and customary standards may vary by place later.

## Cause and repair rule (decided by Cory, 2026-11-04)
An assessment needs to state the cause (the causation). It does not need to say who repaired it or when. Never ask the homeowner to follow up on repairs; ask only whether a cause is stated and what supports it.

## Comparison sample (decided by Cory, 2026-11-04)
The outdoor sample is the control (comparison) sample. Do not ask for a separate "comparison" sample when an outdoor reference exists.

## Common practice, no citations (Cory, 2026-11-05)
- Customer-facing words say "common practice" or "customary practice". They never name a standard, publisher, edition or clause, and never say "compliant", "conforms", "meets the standard" or "industry guideline".
- We build our own guideline database (principles in our own words, each with its source recorded internally). It makes the questions better. It is not shown as citations.
- Only content whose publisher permission is cleared may go into the database. Sources that bar AI use (for example ASHRAE) stay out until written permission and counsel review.
- A "see: document, edition, section" line may be added later for an item whose source is cleared and checked. It is a separate decision, not part of this rule.
- Guard: packages/domain/test/noCitations.test.ts fails if any customer-facing data file breaks this rule.
