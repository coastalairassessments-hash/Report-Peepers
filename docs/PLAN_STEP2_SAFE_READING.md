# Plan: step 2, safe reading of real files (Bricks 21a-21d)

Status: approved by Cory 2026-11-06 ("steps 1 to 3"). Synthetic data only.

## 21a. Hidden text and text aimed at the program
Scan each extracted page. Flag a page when text sits off the page or is too small to read, or when the text addresses an AI ("ignore previous instructions", "you are an assistant", and similar). Phrases live in `data/rules/instruction_phrases.json`, limits in `data/rules/hidden_text.json`. The flag names the page and the rule only, never the text. A flagged case goes to needs attention (a new automatic gate), so a person looks before anything is sent. The scan is required in the services, so forgetting to set it fails to compile (fail closed).
Not covered here: text drawn in the same color as the page (needs the PDF's drawing commands). Listed as a known gap.

## 21b. Isolated reading worker
Reading a PDF moves to a separate process with a time limit, a memory limit, no inherited secrets, no file writes and no child programs. Its answer is checked against a strict shape and a size cap before use. Cutting off the network is a hosting setting (Johnathan); the code says so and does not pretend otherwise.

## 21c. Source-rights gate
Any reference material must carry an authorized status before it can be used or shown. Anything else is refused at load.

## 21d. Wire-up and tests
Adversarial tests: hostile PDFs, oversized output, a worker that hangs or crashes.

Order: 21a, 21b, 21c. Types and tests green before each next step.
