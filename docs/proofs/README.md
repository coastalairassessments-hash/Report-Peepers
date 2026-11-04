# Proof sheets: the marked-up report (Brick 13)

Made from a synthetic report (`sample_source.pdf`, invented text, no real property or person). Regenerate with:

    WRITE_PROOFS=docs/proofs npx vitest run packages/domain/test/render/proofs.test.ts

- `sample_marked_up.pdf`: the deliverable. The original pages, then the red-ink marks and notes, then the typed "Summary of items to clarify".
- `sample_marked_up.txt`: the plain-text version, same numbers and wording.
- `sample_marked_up_page1-4.png`: page images for a quick look.

Page 3 of the sample has no text layer (like a scan), to show the page-level note. The file passed the verifier (original text unchanged, notes where planned).

Known visual limits to judge: number tags are small and can sit on a neighbouring word; on full-width text the left margin is narrow, so notes wrap tightly; marks and notes are checked by position and text, not by eye, so a person should still look before a customer sees one.
