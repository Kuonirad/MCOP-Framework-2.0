# ADR 2026-04-28: Meta Layer Integration (Placement Linter & Council Scorer)

## Status
Accepted

## Context
The M-COP Framework 2.0 requires robust governance and audit mechanisms to maintain repository hygiene and ensure the quality of collective reasoning outputs. As part of the post-ratification sequence for the `HolographicEtch` and `Universal Adapter Protocol`, we identified the need for a "Meta Layer" that operates independently of the core runtime but provides essential audit signals.

## Decision
We are implementing the Meta Layer as two primary components:

1.  **Placement Linter (`scripts/placement-linter.mjs`)**: A CI-gated script that audits the repository layout against the conventions defined in `CONTRIBUTING.md`. It ensures that new files are placed in correct directories (e.g., `src/core`, `src/adapters`) and prevents directory bleed.
2.  **Council Scorer (`src/utils/councilScorer.ts`)**: A utility to score `VirtualCouncil` outputs across three dimensions: Grounding, Coherence, and Diversity. This provides a deterministic "verdict" (ratified/contested/rejected) for collective reasoning results.

## Rationale
- **Independent Value**: The placement linter provides immediate value for the upcoming `/docs/` migration by ensuring new documentation and architectural artifacts land in the correct locations.
- **Separation of Concerns**: By shipping these as a standalone "Meta Layer" PR, we reduce the review surface of the subsequent "Provenance Bridge" PR, which will wire these components into the CI and runtime.
- **Deterministic Governance**: The Council Scorer replaces hand-curated quality assessments with a deterministic, auditable scoring mechanism.

## Consequences
- **CI Impact**: The `pnpm audit:placement` command is now a blocking gate in the main CI workflow.
- **Maintenance**: The `CONVENTIONS` array in `placement-linter.mjs` must be updated when new top-level directories or allowed extensions are introduced.
- **Extensibility**: The Council Scorer is designed to be extended with NOVA-NEO resonance checks for more advanced grounding scores in future sprints.

## Alternatives Considered
- **Monolithic PR**: Bundling the Meta Layer with the Provenance Bridge was rejected because it would have tripled the review surface for only 20% more functional value.
- **Manual Audits**: Hand-curating placement and council quality was rejected as non-scalable and prone to human error.
