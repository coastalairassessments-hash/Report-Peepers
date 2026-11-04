# ADR-004: The deliverable is the customer's own report, marked up in red handwriting

Status: accepted by Cory, 2026-11-04 (his words: no separate document; mark up the uploaded report in a hand-written style, in red ink, so it stands out). The design rules below are proposed and Cory may change them.
Date: 2026-11-04

## Decision
The main thing the homeowner receives is a copy of the report they uploaded, with the review written on it: circles and underlines on the exact words, short handwritten notes in the margin, numbered so a note and its mark go together. Not a separate review document.

## What stays the same
- The approved structured result (`buildApprovedView`) remains the single source of truth. The markup is another rendering of it, like the text export (spec section 17: PDF, text, and screen must not diverge).
- Every rule about wording, evidence, and approval applies to every note. A note is a finding, question, or limitation from the approved view, never new text.
- The original pages are not changed. Marks are an overlay on a copy, and the output records the hash of the original file and the hash of the approved view.

## Design rules (proposed)
1. Marks attach to exact text through the existing anchors (page, normalized box, exact text). Code verifies that the anchored words really sit on that page before drawing anything.
2. If a page has no readable text layer (a scan), the note goes on that page without a mark on specific words, and the note says so. No guessing a location.
3. No grading marks. No check marks, crosses, "wrong", "fail", stars, or scores. Marks are circle, underline, bracket, arrow, question mark, and numbered tag. A question mark means "ask about this".
4. Notes are short. If a note does not fit its margin, the margin shows the number and the full text goes on an added "margin notes" sheet at the end, in the same handwriting. Notes never cover the report's own text.
5. The five leading questions (spec section 17) go on page 1 as numbered notes.
6. The handwriting font is bundled with the app (open license), so rendering needs no network.
7. A plain text version in reading order always accompanies the PDF, because accessible text is required (spec section 17). Same notes, same numbers.
8. Red must still read when printed in gray: the handwriting style and the numbered tags carry the meaning, not color alone.
9. A clean, typed summary page closes the document (Cory, 2026-11-04). It is built from the same approved result as the margin notes and uses the same numbers, so each line points back to its mark and page. Layout: the questions to ask the inspector first, then items grouped by decision relevance (material, then contextual), then what the report supports, then limits on the review. Each line: number, short title, report page, evidence strength label, next step. No counts of problems, no totals, no score, no ranking, and no "pass" or "fail" language. The section is titled "Summary of items to clarify", not "deficiencies": the spec forbids declaring an inspector deficient (evaluation case on missing broader surveys) and the wording check already blocks accusation language. The margin-notes overflow sheet follows the summary.
10. Pro tier later: the same renderer marks up a draft before the inspector issues it. Not built now.

## Consequences
- Brick 12 must give every anchor a real page and box, so the work moves ahead of any markup.
- Brick 13 builds the markup renderer. Its tasks: verify anchors, place marks and notes without overlap, draw in the handwriting font, add the summary page and the notes sheet, bind hashes, test with synthetic PDFs.
- Spec section 17 wording ("downloadable summary and full review") is read as: the marked-up report is the full review; the text version is the accessible summary. No spec file is edited.
- New attorney items L16 and L17 in `docs/LEGAL_REVIEW.md`.

## Open
- Handwriting font choice: Caveat (SIL Open Font License) is the candidate; confirm the license text ships with the app.
- ~~A PDF writer library is chosen in Brick 13.~~ Settled by Cory, 2026-11-04: all PDFs are made with Typst. Tested the same day (see Tooling).

## Tooling: Typst
- Typst (Apache-2.0) embeds the customer's own PDF pages natively (Typst 0.14 and later), keeps their text selectable, keeps each page's own size and rotation, and draws the red marks and handwriting over them. Tagged, accessible PDF output is built in.
- The app runs the official command-line program, pinned to 0.14.2 and verified by checksum (tarball SHA-256 `a6044cbad2a954deb921167e257e120ac0a16b20339ec01121194ff9d394996d`). It runs as a separate process with no network, with system fonts ignored and only our bundled font folder visible.
- Same inputs and a fixed creation time give byte-identical PDFs (tested), which keeps the output hash meaningful.
- Typst reports a missing font as a warning and still exits normally, silently swapping in another font. The wrapper therefore fails the build on any warning.
- What embedding may not carry over from the customer's original: links, form fields, bookmarks, and document metadata. The text and look of every page are kept. So the claim is "the pages are reproduced unchanged and verified by text comparison", not "the file is byte-identical". If a source page cannot be embedded, no deliverable is made.
- The markup geometry (where marks and notes go) is computed in TypeScript and tested; Typst only draws what the plan says.
