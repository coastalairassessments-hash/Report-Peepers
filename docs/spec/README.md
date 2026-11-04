# Environmental Report Review System Handoff

Read MASTER_SPEC.md first. It is the canonical detailed specification assembled from the project conversation. The Word document is a readable rendering of that same specification. This package is an initial design, not deployed software or a validated scientific engine.

## Files

- MASTER_SPEC.md: product purpose, restrictions-first intake, scientific reasoning, remediation review, evidence provenance, references, architecture, API, revisions, security, evaluation, worked case, milestones, and open decisions.
- DECISIONS.md: confirmed intent, proposed defaults, release dependencies, and change discipline.
- requirements.csv: stable implementation requirements and measurable acceptance criteria linked to seed evaluation scenarios.
- review_contract.schema.json: JSON Schema interchange contract for a case snapshot and review release.
- example_case.json: synthetic example demonstrating evidence links, confirmed limits, and a narrowly worded finding. It is not the customer's real case.
- evaluation_cases.json: seed product, scientific, and adversarial scenarios with required and prohibited behavior. These are not executed tests of an implemented engine.
- workflow_transitions.json: proposed server-side case and payment transitions with guards.
- PACKAGE_MANIFEST.json: file checksums and version metadata.

## Start here for the next AI

Preserve the confirmed decisions and independent review-only model. Build a bounded vertical slice around scope confirmation, provenance, and revisions. Keep unknown information explicit. Separate evidence from inference. Enforce publisher rights before retrieval or model access. Require internal human approval for pilot releases. Implement deterministic checks for numbers and server-enforced authorization/state changes.

Do not contact inspectors or other people, publish customer findings, deploy hosting, connect payment accounts, ingest protected standards, train on customer documents, or assert professional credentials merely because this package describes a future system. Those actions require their own authorization and applicable release dependencies.

## Structural verification

The package author validated JSON syntax, the synthetic example against the JSON Schema, requirement/scenario ID links, allowed-transition references, and archive integrity. Scientific accuracy targets and product acceptance tests remain to be executed against an implementation and qualified review dataset. The source report is not redistributed in this archive.
