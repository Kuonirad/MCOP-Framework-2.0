# ADR 2026-05-11: Automated Evidence Retrieval & Guardian Meta-Reasoner

## Status
Accepted (shipped on `claude/automated-evidence-retrieval-YRVpF` for v3.3 /
unreleased TypeScript core).

## Context
Two adjacent gaps surfaced after the v3.2 grounding-index work:

1.  **Manual evidence curation** was the single largest source of overhead in
    the reasoning loop. Hypotheses had no way to acquire Evidence except from
    a maintainer hand-attaching it before calling `MCOPEngine.solve()`.
2.  The **Guardian v0.1** calibration language already referenced a
    framework-wide grounding threshold but only audited it post-hoc, as
    documentation and audit logs. The framework had latent self-reflective
    capability that wasn't wired into the live reasoning loop.

The roadmap explicitly flagged this convergence point as the logical next
step: *automated evidence retrieval + configurable grounding thresholds
(minimum 0.70) to further reduce manual overhead while preserving human
primacy.*

## Decision
We introduced two cooperating surfaces:

1.  **`EvidenceRetriever`** — a plug-in abstract base (Python
    `mcop.evidence_retrieval`, TypeScript `src/utils/evidenceRetriever.ts`)
    with a default deterministic in-memory cosine backend and a
    `CompositeEvidenceRetriever` fan-out. The engine calls into it from
    `_gather_evidence`, and the TypeScript `CouncilScorer` calls into it
    from `score()`. Retrieved Evidence is **appended**, never overwriting
    human-supplied items.
2.  **`GuardianMetaReasoner`** — a meta-reasoner that audits hypotheses,
    chains, and solutions against a configurable grounding threshold with a
    **0.70 strict-mode floor**. Verdicts attach to artefact metadata; below
    the threshold solutions surface a `Guardian contested (…)` badge in
    `key_uncertainties`.

Additionally:

- `MCOPConfig.grounding_threshold` default rose from `0.40` to `0.70` to
  align the engine's pass/fail bar with the Guardian floor.
- `ReasoningChain` gained a `metadata` dict so Guardian verdicts (and
  future per-chain annotations) have a stable home.
- `CouncilScorer.score()` now accepts `{ retriever, guardian }` options and
  downgrades a composite-ratified verdict to `contested` when the Guardian
  flags `requires_human_review` — human primacy in the ratification path.

## Rationale
- **Plug-in, not policy.** The retriever abstract base means production
  deployments swap in BM25 / FAISS / OpenSearch / a vector DB without
  touching engine code. The framework ships a deterministic default so
  parity tests and CI stay reproducible.
- **Configurable but principled.** The threshold is a configuration
  value, but going below `MIN_GROUNDING_FLOOR = 0.70` requires an
  explicit `strict_mode=False`. The framework refuses to let an
  operator silently lower its evidence-hygiene bar.
- **Additive verdicts preserve human primacy.** The Guardian flags and
  recommends; it never rewrites. Downstream reviewers always see the
  underlying artefact alongside the verdict.

## Consequences
- The engine's default behaviour shifts: more hypotheses will be marked
  `CONTESTED` until corpora are wired up. This is intentional — it
  surfaces the actual evidence deficit instead of papering over it with
  a low threshold.
- `pnpm test` now exercises three new TypeScript test files; the Python
  test suite gains three new files under `mcop_package/tests/`.
- A short docs entry lives at
  [`docs/features/automated-evidence-retrieval.md`](../features/automated-evidence-retrieval.md).

## Alternatives Considered
- **Hard-code 0.70.** Rejected — production deployments legitimately
  need to dial up (high-stakes domains) and sometimes dial down for
  exploratory smoke tests. A configurable threshold with an explicit
  strict-mode floor is the smallest contract that respects both.
- **Auto-pruning below-threshold artefacts.** Rejected — silently
  dropping contested hypotheses would violate human primacy. The
  framework surfaces the deficit instead.
- **Embedding-based default retriever.** Rejected for the default —
  would have introduced a network/embedding-runtime dependency on a
  surface that needs to stay deterministic. Production deployments are
  free to subclass.
