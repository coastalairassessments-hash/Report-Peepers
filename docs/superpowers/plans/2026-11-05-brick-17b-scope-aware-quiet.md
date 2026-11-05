# Brick 17b: scope-aware questions and "must stay quiet" tests

Source: second-opinion spec (evidence states, counterexamples). Taken: items 1-2 only. Not taken: new stack, commercial rules, vector search.

## Logic (plain)
The client already told us the limits (time, samples, budget, areas, methods, access). Today a gap question can ignore that. After this brick:
- A gap on a topic a stated limit explains is not asked as "why wasn't this done". It moves to a short list, "Not expected given the limits you described".
- If the report still draws a conclusion on that topic, one scoped question stays: "You described {limit}. How did that limit affect this conclusion?"
- Silence is never read as "not done" (C04, C06). A report that says an area was inaccessible or excluded is respected.
- New evidence state: referenced but not supplied ("see attached lab report" and no lab pages). Becomes a request for the file, not a gap.

## Tasks (tests first, tsc and tests green between each)
1. Data: `data/rules/scope_effects.json` maps each restriction kind to the checklist topics it explains. Cory confirms the mapping.
2. `buildInspectionReview` takes the confirmed scope. Affected gaps are demoted and reworded as above. Unknown or unconfirmed limits change nothing.
3. Referenced-not-supplied check in the self-consistency set, with wording.
4. Quiet tests: one sample per rule (every id in gap_wording checks and map rules) where it must not fire, plus a meta-test that fails if a new rule has no quiet sample.
5. Re-run the synthetic thin and complete proofs; update README proof sheet and ROADMAP.

## Not in this brick
Reviewer scoring of questions (next), three separate scope records, source-rights gate, draft-read fix, instruction flag.

## Open for Cory
The topic mapping in task 1 is a draft from me; it needs a field expert's eye.
