# Brick 20: the knowledge library (guideline database) and the tool to develop it

Source: Report_Peepers_IEP_Knowledge_Library_Build_Spec_v2.1 and its seed dataset (56 entries, 12 families, 224 test cases, none run). Seed file copied unchanged to data/knowledge/seed_v2.1.json. The spec's instructions to a builder are NOT followed as written: it is a second opinion (see "Changes from the spec").

## Logic (plain)
Today our rules come from my reading of your reports. The library is where YOU and a second licensed professional decide each rule once: when it applies, when it does not, the exact question wording, and what the program must never assume. Automatic release (ADR-006) then uses only rules that were approved and whose tests pass. People approve rules, not reports.

## Changes from the spec
1. No separate SQLite app. The library lives in our repo as data, checked by tests. The review tool is a small local page inside this repo.
2. SC-05 ("a human approves each release") is replaced: people approve rules; release is automatic (ADR-006).
3. Families F10 (drying/remediation records) and F11 (commercial) are parked: residential MVP only. Their entries stay in the file, status "parked".
4. Customer wording follows the no-citation rule: source hints stay internal, never shown.
5. A rule is live only when: status approved (two Accept decisions on the same version from different people, plus owner approval) and all four of its tests have run and passed.

## Tasks (tests first, tsc and tests green between each)
1. Schema and loader for the library, with checks: unique ids, family exists, every entry has 4 fixtures, homeowner_question passes the wording filter and the no-citation guard, no outside numeric limits, no verified-looking citations, nothing marked live or approved on import.
2. Status engine from the spec's rules: ai_draft, in_review, revise, discussion, rejected, iep_accepted, approved. Any edit makes a new version and resets approvals. Append-only history of every decision with who, when, reason code.
3. Decision log as data files (one per entry) so every change shows in git.
4. Map the 56 entries to our 104 checklist items and our code rules (merge duplicates, keep IDs stable). Output: a table of covered / new / conflicting. New rules become entries only after you accept them.
5. Local review page (Release 1 of the spec): home with progress by family and a "Next item" button; review screen; Accept / Needs changes / Not useful / Let's discuss; your answer to the one open question; edit saves a new version; history; export JSON/CSV. Plain words, large text.
6. First session starts at Family F01 with its main decision (as in the spec section 11). Time per entry is recorded to forecast the rest.
7. Wire approved entries to the rule engine only after review starts producing approvals (separate brick).

## Not in this brick
AI "suggest a clearer version" button, source library screens, logins and online hosting, fixture runner connected to the engine.

## Open for Cory
None. Review starts with Family F01 once the page works.
