# Brick 13: The Red-Ink Markup Renderer (Typst) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn an approved review into the customer's own report with red handwritten markup on the exact words, numbered margin notes, and a clean closing summary page, all made with Typst (ADR-004). A plain-text version with the same numbers always comes with it.

**Architecture:** Three separated parts. (1) A pure TypeScript **planner** takes the approved view, the verified anchors, and the extracted pages, and produces a **markup plan** (JSON): per page, marks with boxes, numbered notes with positions, overflow list, and the summary page content. All geometry and every rule live here and are tested. (2) A pinned **Typst runner** compiles a template that reads the plan and the customer's PDF and only draws. (3) A **verifier** reads the output back with our own extractor and checks it against the plan and the source. Nothing is delivered unless the verifier passes.

**Tech Stack:** TypeScript, vitest, Typst 0.14.2 command-line program (pinned, checksum-verified), Caveat handwriting font (SIL Open Font License, vendored with its license), existing `pdfjs-dist` extractor, `pdf-lib` fixtures (dev only).

**Spec:** `docs/spec/MASTER_SPEC.md` sections 13, 17, 22; `docs/decisions/ADR-004-red-ink-markup-output.md`; `ADR-005` (the summary also feeds the saved record, Brick 14).

## Global Constraints

- Synthetic PDFs only. No real report, no customer data. Typst runs with no network, system fonts ignored, project root limited to a temp folder, and a time limit.
- Fail closed: any Typst warning (including a missing font, which Typst otherwise swaps silently), any embed failure, or any verifier failure means no deliverable and a processing issue. No half-marked document is ever released.
- Only published, fingerprint-matching releases render (reuse `exportRelease` gates). Notes are text from the approved view only; the renderer writes no wording of its own except fixed labels from a rules file.
- Mark vocabulary is fixed in `data/rules/markup.json`: circle, underline, bracket, arrow, question mark, numbered tag. No check marks, crosses, stars, "wrong", "fail", scores, counts of problems, or rankings. A test scans every rendered string for banned vocabulary (the integrity wording lists).
- Marks sit on verified anchors only (`verifyAnchor`). A scanned page or an anchor without a box gets a page-level note with no mark, and says so.
- Notes never cover the report's own text (planner treats extracted spans as obstacles) and never leave the page.
- Same inputs and fixed creation time give byte-identical output. The output records the source file hash, the approved view hash, and the plan hash.
- Layout numbers (margins, note width, text size, length cap) are proposed defaults in `data/rules/markup.json`, not hard-coded, and are not scientific thresholds (D07).
- Red must still read in gray: handwriting style, shapes, and numbered tags carry meaning, not color alone. Marks are decorative to screen readers; notes and the summary are real, tagged text.
- Types check and all tests pass before each next task. Commit after each task.

## Review Focus

- Missing font, bad font name, unreadable source page, oversized page: build fails, nothing delivered.
- Pages of different sizes and rotated pages (90, 180, 270): marks land on the displayed words; the output page keeps the source's displayed size.
- Two findings anchored on the same words, or on overlapping words: marks and numbers do not collide; both stay readable.
- A note too long for its margin: the margin keeps the number only and the full text appears on the notes sheet; a page with many notes still never overlaps report text.
- A finding with several anchors (for example an internal inconsistency across two pages): one number, one mark per anchor, one note.
- Scanned page, anchor without box, anchor that fails verification: page-level note, no mark, and the plain-text version says why.
- Zero findings: a valid output (original pages plus a summary saying nothing needs clarifying within scope), never an empty or crashing document.
- Very many findings (50 or more): summary spans pages cleanly; numbering stays stable and unique.
- Unicode, quotes, long unbroken strings, and Typst control characters (`#`, `$`, backticks, `[`, `]`, `@`) inside a note: shown as plain text, never interpreted as Typst markup (injection). Notes enter the template as data, never spliced into source.
- The original pages: text of every output page equals the source page's text; page count is source pages plus summary pages plus notes sheet.
- Known gap, recorded not fixed: links, form fields, bookmarks, and metadata of the customer's original are not carried over.

## Tasks

### Task 1: Typst runner, pinned tooling, handwriting font

**Files:**
- Create: `tools/typst/README.md` (version, checksum, how to install), `scripts/install-typst.mjs` (download the pinned release, verify SHA-256, unpack to `.tools/typst`), `assets/fonts/Caveat-Medium.ttf` and `assets/fonts/OFL.txt`, `packages/domain/src/render/typst.ts`
- Modify: `.github/workflows/ci.yml` (run the installer), `.gitignore`
- Test: `packages/domain/test/render/typst.test.ts`

**Interfaces:**
- Pinned release: Typst 0.14.2, `typst-x86_64-unknown-linux-musl.tar.xz`, SHA-256 `a6044cbad2a954deb921167e257e120ac0a16b20339ec01121194ff9d394996d`. The installer refuses any other checksum.
- `compileTypst({ template, files, data, timeoutMs }) => Promise<{ ok: true, pdf } | { ok: false, reason, diagnostics }>`. Works in a fresh temp folder; passes `--ignore-system-fonts --font-path assets/fonts --creation-timestamp <fixed> --root <tmp>`; the plan JSON and source PDF are written as files, never spliced into the template text; any `warning:` or non-zero exit is a failure; a timeout kills the process.
- Font license check: `OFL.txt` ships beside the font.

- [ ] Step 1: Failing tests: hello document compiles and the same inputs give identical bytes; a bad font name fails (warning treated as failure); a syntax error fails with diagnostics; a hanging template is killed by the timeout; Caveat is listed by `typst fonts` with only our folder visible; no network access is attempted.
- [ ] Step 2: Run, confirm fail. Step 3: Implement. Step 4: Run all tests and typecheck.
- [ ] Step 5: Commit "Brick 13.1: pinned Typst runner and handwriting font".

### Task 2: The markup plan (planner), with source locations in the approved view

**Files:**
- Create: `packages/domain/src/render/plan.ts`, `data/rules/markup.json`
- Modify: `packages/domain/src/release.ts` (each approved finding carries its verified source locations: document, page index, printed label, box; the text export prints "p. N")
- Test: `packages/domain/test/render/plan.test.ts`, additions to `release.test.ts`

**Interfaces:**
- `planMarkup(view, extractedDoc, opts) => MarkupPlan`: `pages[]` (index, displayed size, marks `{kind, box, number}`, notes `{number, text, box}`), `overflow[]`, `summary` (leading questions, material items, contextual items, what the report supports, limits; each line: number, title, page, strength label, next step), `issues[]` (anchors that could not be marked, with the reason).
- Mark kind per finding type from `markup.json`. Numbering: stable, in page then position order, unique across the document.
- Placement: candidate positions in margins first, then free space; obstacles are extracted spans and already placed notes; deterministic tie-breaks; no randomness.
- The summary page is titled "Summary of items to clarify". Order: the questions to ask the inspector, material items, contextual items, what the report supports, limits on the review. No counts, totals, scores, or rankings.

- Decisions made while building (amend ADR-004 rule 5): leading questions are listed first on the summary page; page 1 gets one handwritten pointer to it; no leader lines; tags may sit on words, notes never do; an anchor that does not verify gets no mark; findings with no usable location appear on the summary and the notes sheet only.

- [x] Step 1: Failing tests for every Review Focus item that concerns placement, numbering, overflow, scanned pages, multiple anchors, zero and many findings, banned vocabulary.
- [x] Step 2: Run, confirm fail. Step 3: Implement. Step 4: Run all tests and typecheck.
- [x] Step 5: Commit "Brick 13.2: markup planner".

### Task 3: The Typst template and renderer

**Files:**
- Create: `packages/domain/src/render/markup.typ` (template), `packages/domain/src/render/renderMarkup.ts`
- Test: `packages/domain/test/render/renderMarkup.test.ts`

**Interfaces:**
- `renderMarkup(sourcePdf, plan) => Promise<{ ok: true, pdf } | { ok: false, reason }>`. The template reads the plan with `json()` and each source page with `image(..., page: n)`; sets each output page to the source page's displayed size; draws marks (decorative) and notes (real text, red, Caveat) at plan positions; then the summary pages (real headings and list or table structure) and the notes sheet.
- Accessible output (Typst tagging on, PDF/UA-1 requested); marks marked as artifacts; the document title and language set.

- [x] Step 1: Failing tests on synthetic sources: output page count and sizes; rotated and mixed-size pages; Typst control characters in notes stay literal; every note's text is extractable from the output; build fails when the plan names a missing source page.
- [x] Step 2: Run, confirm fail. Step 3: Implement. Step 4: Run all tests and typecheck.
- [x] Step 5: Commit "Brick 13.3: Typst renderer".

### Task 4: Verifier, text version, and the release pipeline

**Files:**
- Create: `packages/domain/src/render/verifyMarkup.ts`, `packages/domain/src/render/exportMarkup.ts`
- Test: `packages/domain/test/render/verifyMarkup.test.ts`

**Interfaces:**
- `verifyMarkup(sourcePdf, outputPdf, plan) => { ok } | { ok: false, problems[] }`: original page text equals output page text for every source page; each note's extracted text sits where the plan says (within a stated layout allowance); no note box overlaps source text; page count as planned; no banned vocabulary in any rendered string.
- `exportMarkup(snapshot, fingerprint, sourcePdf, extractedDoc) => Promise<{ ok: true, pdf, text, hashes } | { ok: false, reason }>`: runs the release gates, plans, renders, verifies, then returns the PDF and the plain-text version (same numbers and wording), with source, view, and plan hashes. Any failure returns a reason and no files.

- [ ] Step 1: Failing tests: a good run passes; a tampered output (a note moved onto text, a page text altered, a banned word added) fails; unpublished or changed releases refused; the text version matches the PDF notes one for one.
- [ ] Step 2: Run, confirm fail. Step 3: Implement. Step 4: Run all tests and typecheck.
- [ ] Step 5: Commit "Brick 13.4: verifier and export pipeline".

### Task 5: Proof sheets, coverage, notes, roadmap

**Files:**
- Create: `docs/proofs/` (rendered synthetic example: PDF and page images) for Cory to look at
- Modify: `tests/evaluations/cross_examination_coverage.json` (XC009, XC008, XC012 as far as proven), `docs/ROADMAP.md`, `docs/EXPERT_WITNESS_REVIEW.md`, regenerate `docs/EVALUATION_SCORECARD.md`

- [ ] Step 1: Render the synthetic example, review the page images myself for overlap and legibility, send them to Cory. Step 2: Update maps only for tests that exist. Step 3: `npm run check`; commit, push, confirm CI green.

**Exit:** a published synthetic review renders to the customer's own pages with red handwritten marks on verified words, numbered notes, a clean summary page, and a matching plain-text version; the verifier proves the original pages are intact; builds are repeatable; CI green. Brick 14 (saved summary record) follows.
