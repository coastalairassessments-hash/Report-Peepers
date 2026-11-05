# ADR-006: Reviews are released automatically (no person per report)

Date: 2026-11-05. Status: decided by Cory. Replaces engineering default D05 (human review of every pilot release).

## Decision
The review is a second opinion produced and released by the program with no person touching each report. The release step becomes a setting (`release_mode: auto | human`) so a person can be added back later without a rebuild. Next brick builds the setting.

## What makes this safe without a person
- Every customer sentence is a fixed template, the report's own words with the page, and a question. The AI writes no free-form text to the homeowner.
- Every quote is verified word for word against the report. Anything unanchored is dropped.
- Every sentence goes through the wording filter. A failure holds the question back, never sends it.
- Silent when a page could not be read. Image-read words are marked "please confirm".
- No accusation, no "wrong", no "miscited", no "compliant". Customer words say "common practice" (VOICE_RULE).
- Questions only. Pressure comes from the questions, not from verdicts about a named inspector.

## Purpose (Cory)
An independent second opinion for the homeowner: what is done well, what to ask, so they are educated and not snowed over. Not a blame tool. Over time it makes inspectors better, because their reports can be checked.

## Guardrails that still apply
- C01: no upsells, referrals or lead generation inside this product. IndoorIQ is not promoted in the homeowner review.
- ADR-002: only anonymous flaw-pattern counts are kept; trend data goes to IndoorIQ only as anonymous counts. Product copy must not claim ArcSys has no other interest.
- G02: one attorney read of the service, wording and representations before public launch (once, not per report).
- Citation checks (open): ask "which edition and section?" about the inspector's own citation. No verdict on whether it is right. The guideline database stays internal.

## Consequences
Release-time safety moves from a person to code, so the quiet tests, the wording filter and the quote check are release gates. Reviewer console becomes optional.
