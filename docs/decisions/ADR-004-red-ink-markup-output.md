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
9. Pro tier later: the same renderer marks up a draft before the inspector issues it. Not built now.

## Consequences
- Brick 12 must give every anchor a real page and box, so the work moves ahead of any markup.
- Brick 13 builds the markup renderer. Its tasks: verify anchors, place marks and notes without overlap, draw in the handwriting font, add the notes sheet, bind hashes, test with synthetic PDFs.
- Spec section 17 wording ("downloadable summary and full review") is read as: the marked-up report is the full review; the text version is the accessible summary. No spec file is edited.
- New attorney items L16 and L17 in `docs/LEGAL_REVIEW.md`.

## Open
- Handwriting font choice: Caveat (SIL Open Font License) is the candidate; confirm the license text ships with the app.
- A PDF writer library is chosen in Brick 13 after a dependency check (the common one, pdf-lib, has had no release since 2022).
