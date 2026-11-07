# Step 3: better questions (plan)

Goal: ask sharper questions from what the report says about itself. Plain code finds the pair of passages; no AI judges. Questions only, never a verdict (P01).

## Rule for every new check
Fire only when two located passages (page + word-for-word text) both exist and fit together (same room or same material, or the same sentence). If only one side is found, or they do not fit together, stay silent. All patterns live in `data/rules/cross_checks.json` (draft, Cory tunes).

## The checks (module `src/inspection/crossChecks.ts`)
1. `cover_count_vs_sections`: a count stated up front (for example "12 samples") against the number of sections actually found.
2. `confirmed_vs_needs_lab`: "confirmed" for a spot that another line says still needs a lab (same room or material).
3. `rating_without_reading`: a Elevated / Not Elevated rating whose rule needs a number, with no number on that row.
4. `instrument_not_listed`: an instrument used in the findings that the report's own equipment list does not include (silent if the report has no equipment list).
5. `number_vs_standard`: a number set against its own stated limit in one sentence, where the words and the numbers disagree.
6. `citation_without_edition`: a named standard with no edition (year) or section; asks "which edition and section?" Single quote.
7. Second reader for lab numbers read from images (brick 3b): a number read from an image page is only used if a second, independent read agrees; otherwise it becomes a question.

## Wiring
Results join `contradictions` in `pipeline/analyze.ts`; wording per check in `data/rules/gap_wording.json` (checked by `wordingProblems`). Tests first; typecheck and tests green after each brick.
