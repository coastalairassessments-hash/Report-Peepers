# Plan: a first look while the report loads (draft for Cory's approval)

Why: a customer may upload only part of a report, for example a lab results report with no inspection narrative. Today nothing notices, so the full checklist would run and ask misleading "the report doesn't say..." questions. Cory's idea (2026-11-07): load the report, look at it right away, ask a few simple questions, and if it is only a lab report, explain kindly and do not charge.

## What the customer sees
1. They upload the file. A free first look starts (no payment yet).
2. The first look says what kind of document it seems to be: inspection or assessment report, lab results only, or unclear.
3. If lab results only or unclear, one question: "Is this the only part of the report you have?" (yes / no / not sure).
   - "No, I have more": ask them to add the rest. Nothing is charged until the report is there.
   - "Yes, this is all": a fixed, polite message explains that the review is for the full inspection or assessment report. No charge, nothing stored beyond the normal deletion period.
   - "Not sure": offer both paths in the same message.
4. If it looks like a full report, nothing changes: the usual intake questions (Q01 to Q13) follow.
5. The first look may also tell them, before they pay, what it cannot read (image-only pages, over the page limit), so there are no surprises.

## What the program does (plain code, no AI)
- New `src/ingest/documentKind.ts`: counts marker words from `data/rules/document_kind.json` (draft, Cory tunes). Lab markers: "chain of custody", "analytical results", "laboratory report", "spores/m3", "analyst". Inspection markers: "scope", "observations", "visual inspection", "moisture readings", "recommendations", "limitations". Rule: lab markers present and almost no inspection markers means lab only; neither means unclear; otherwise inspection report.
- It reads text with the existing isolated reader. Pages with no text layer count as unreadable, so the result is "unclear", never "lab only".
- Result stored on the case as `document_kind` (system only). The customer view shows only the fixed message.
- New fixed customer messages live in `data/rules/first_look_messages.json`, each with an `approved` flag (Cory approves, same pattern as interview notes). Unapproved wording is never shown.
- A "lab only, nothing more" case moves to a closed state with no entitlement charge. Held-case handling after payment is a separate item.

## Bricks (tests first, typecheck and tests green after each)
1. Document-kind detector + rules file + tests (lab only, full report, mixed, unreadable pages, hostile text).
2. Fixed messages file with approval flags + wording tests.
3. Case step: question, three answers, outcomes (continue / ask for more / close without charge) in the state machine, with tests.
4. Wire into intake after upload (screens are Johnathan's; this is the data and rules he calls).

## Not in this plan
Charging rules, refunds and held cases after payment. Screens. Any AI step.
