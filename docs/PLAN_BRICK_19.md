# Plan: Brick 19, storage and access (vendor-neutral)

Status: approved by Cory 2026-11-06 ("can we build brick 19"). Built 19a, 19b, 19c the same day. Synthetic data only. No vendor chosen: the code sits behind ports and an in-memory adapter, and Johnathan's hosting and email picks plug in later.

Decisions this follows: STACK_BEFORE_BRICK_19.md items 2, 4 and 5 (no accounts; emailed private link plus a one-time code; 90 days after delivery then deletion).

## Already built
Access-enforcing case repository (customer isolation, locked releases), file store port, `readReleased`.

## What this brick adds
**19a. Access by link and code.** A private link token (256-bit random, only its hash is stored) bound to one case and the verified sender address. Opening it asks for a one-time code sent to that address. Rules: link expires (default 14 days), code expires (10 minutes), a code works once, 5 wrong codes lock the link, compare in constant time, a session is read-only and covers only that case's released outputs. Time, randomness and hashing are injected so tests are exact.

**19b. Retention.** Stamp `delivered_at` when a case is released. `purgeExpired` deletes the uploaded file, the released copy and the case content 90 days after delivery, leaving only a tombstone (id, deleted_at). Files are shared by content hash, so a file is deleted only when no live case still points at it. Anonymous summary records are untouched. Undelivered (abandoned) cases are not covered by the decided rule: flagged as an open question, not guessed.

**19c. Customer view.** A customer sees only released material. Before release, the draft review, issues and inspection review are hidden. Closes the "customers can read unapproved drafts" gap in the code, not only in the screens.

## Tests first
Wrong, expired, reused or locked codes all fail the same way and say nothing about which. Another case's token never opens this case. A purge never deletes a file another live case uses, never touches an undelivered case, and never touches summary records. A customer view never carries draft fields.

## Not in scope
Real email sending, hosting, the web screens, the abandoned-case rule, the 35-day backup rule (vendor setting).

## Order
19a, 19b, 19c. Types and tests green before each next step.
