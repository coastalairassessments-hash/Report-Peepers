# Plan: the client interview (Bricks 22a-22c)

Status: approved by Cory 2026-11-07. 22a built (gap detectors + rules file). 22b, 22c next.

Decided by Cory 2026-11-07:
- We talk only to the client. Never the inspector or an occupant.
- The client tags each answer: "I saw it", "I was told", "I don't know". No separate occupant tag.
- Asking for supporting records and reassessing the findings are parked as a possible paid add-on (decide later).

## Logic
The report is the evidence. The client's answers are a second source kept beside it. An answer never edits the report's evidence and never closes a gap by itself.

## Bricks
**22a. Gap list.** Plain code reads the finished review and lists gaps from a rules file (`data/rules/interview_gaps.json`): each gap has an id, the condition that creates it, one neutral question, and the answer choices. Starting set: the four examples from Cory (condensation without temperatures, readings without reference comparisons, an excluded room, sampling as the whole investigation). No AI picks gaps.

**22b. One-question-at-a-time flow.** Gives the next open question, takes the answer, stores it with its tag, and picks the next. Ends when no open gap is left or the client stops. "I don't know" is always allowed and never penalized. Questions are fixed wording from the rules file, so they are reviewable.

**22c. Answer record and result.** Each stored answer keeps: gap id, answer, tag, time. A gap is "answered", "unknown" or "open". The result for the client says, per gap, whether the report may need an amendment, a supporting attachment or a narrower conclusion, in the existing customer wording (no standards named, no accusing words, no "compliant").

## Guards (tests first)
- Wording passes the existing wording and no-citation checks.
- Questions never lead: no question names a conclusion or says what the right answer is.
- Free text, if allowed, is stored as the client's words and never reaches the model as instructions.
- An answer never changes evidence, findings or the release gates by itself.
- Summary records and the learning loop get gap ids and counts only, never answers.
- Customer view shows the interview only to its own case.

## Not in scope
Contacting anyone else, requesting records, reassessing findings, screens (Johnathan), the paid add-on terms.

## Order
22a, 22b, 22c. Types and tests green before each next step.
