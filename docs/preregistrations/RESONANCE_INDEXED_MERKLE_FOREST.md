# Pre-Registration: Resonance-Indexed Merkle Forest

> **Status:** PROPOSED — pre-registration only. No implementation will be merged
> until this document is approved and the experiment described below has been
> run, reported, and publicly compared against the falsification conditions.

## Why this document exists

The MCOP project ships changes quickly and lints/tests rigorously, but historical
proposals for triad extensions have been written **after** the implementation is
already done — which makes it structurally hard to catch the case where the
extension fails to clear its own claimed bar. The MCOP Benchmark Evaluator v2.1
report (this session) flagged this as the single biggest first-principles
weakness in the codebase. The pre-registration discipline below is the
remediation: every major framework change ships with a metric, a baseline, a
falsification condition, and an experiment **committed before** implementation
begins. Devin Review and human reviewers are then judging the implementation
against a checked-in target instead of a moving one.

This document applies that discipline to the proposed
"Resonance-Indexed Merkle Forest" extension to Stigmergy v5.

## Proposal under evaluation

`StigmergyV5.getResonance(query)` is currently an O(n) linear scan over the
trace circular buffer. The proposal is to add an opt-in resonance index — a
"Merkle Forest" of cosine-binned trees rebuilt periodically — gated behind a
`StigmergyConfig.resonanceIndex: 'linear' | 'merkle-forest'` flag, with the
linear path remaining the default and the canonical provenance source. Goal:
replace the O(n) hot path with an approximate-nearest-neighbor index while
preserving full Merkle auditability.

## Metric

We pre-commit the following metrics, in priority order. The extension MUST
move (1) and MUST NOT regress (2)/(3).

1. **Resonance query latency** at the 10 000-trace, 64-dim,
   1 000-query workload defined by
   [`scripts/baselines/stigmergyResonanceBaseline.mjs`](../../scripts/baselines/stigmergyResonanceBaseline.mjs).
   Reported as `p50_us`, `p95_us`, `p99_us`, `throughput_qps`. Same script,
   same seed, same hardware in CI, with `IMPLEMENTATION=merkle-forest` toggle
   producing a sibling JSON file under `docs/preregistrations/`.

2. **Recall@1** against the linear-scan ground truth captured in
   `baseline_ground_truth.json`. Defined as the fraction of queries whose
   indexed top-1 trace id matches the linear-scan top-1 trace id at the same
   query index.

3. **Provenance preservation.** Every trace returned by the indexed path must
   still chain to the same Stigmergy Merkle root the linear path produces for
   the same insert order. The cross-runtime canonical-encoding parity test
   (`tests/parity/canonicalMerkleParity.*`) must remain green; an additional
   provenance-equivalence test must be added with the index, asserting that
   `stigmergyLinear.getMerkleRoot() === stigmergyIndexed.getMerkleRoot()`
   after identical insert sequences.

## Baseline (measured, not estimated)

Source: `docs/preregistrations/baseline_results.json` (checked in alongside
this document). Produced by running the baseline script on
`linux-x64 / node v22.12.0` with the pre-committed seed `0x4D434F50`.

| metric | value |
| --- | --- |
| trace_count | 10 000 |
| query_count | 1 000 |
| dimensions | 64 |
| insert_phase.mean_per_trace_us | **2.11 µs** |
| query_phase.p50_us | **661 µs** |
| query_phase.p95_us | **710 µs** |
| query_phase.p99_us | **895 µs** |
| query_phase.throughput_qps | **1 512 QPS** |
| recall@1 (by definition) | **1.000** |

**Caveat — environment dependence.** Absolute latency numbers are
hardware-dependent and treated as observations, not contracts. The
falsification conditions below are stated as **multiplicative ratios** between
indexed and linear measurements taken on the **same** machine in the same CI
job, not as absolute thresholds. Recall is environment-independent because
the ground-truth top-1 trace ids are deterministic across runs (verified by
re-running the baseline script — `baseline_ground_truth.json` is byte-stable).

**Important correction to the original handwave.** The Benchmark Evaluator
v2.1 report quoted me as claiming "<5 ms end-to-end" for the encode +
resonance step at 10 k traces; the measured per-query baseline is actually
~0.66 ms. The original "100 iterations to 95% resonance stability" claim was
unmeasured and is not used here — it does not have a clean operationalisation
on a single-call `getResonance(q)` interface, and the metric set above is
stricter and falsifiable.

## Predicted lift

The original proposal claimed "≥30% reduction in resonance latency, 32% more
iterations/sec." Pre-registering a more honest, narrower band:

- **Predicted p50 latency speedup:** 5×–15× over baseline at the 10 k-trace
  workload (i.e. p50 ≈ 45–130 µs). Justification: cosine-bucketed indexing
  collapses the per-query work from `O(n · d)` (n=10 000, d=64) to roughly
  `O(b · d + k · d)` where `b` is the number of bucket centroids visited and
  `k` is the candidates re-ranked. With ~64 buckets and ~256-candidate
  re-rank, raw work drops ~6×; constant-factor losses (pointer chasing,
  index maintenance) push the realistic band lower.
- **Predicted recall@1 floor:** ≥ 0.95.

These predictions are recorded so that "the implementation matched the band"
and "the implementation undershot/overshot" become *distinguishable
post-registration outcomes* rather than a moving target.

## Falsification conditions

The extension is rejected and not merged into `main` if **any** of the
following holds at the experiment defined below:

- **F1 — Recall regression dominates speed.** `recall@1 < 0.85` AND
  `p50_indexed < 0.5 × p50_linear`. Rationale: agentic convergence is
  bottlenecked by *correct* retrieval, not faster wrong retrieval. A 2×
  speedup at <85% recall makes the planner systematically converge on the
  wrong trace, which is strictly worse than the current linear scan.
- **F2 — Speedup fails to materialise.** `p50_indexed > 0.7 × p50_linear`
  on the same workload. A <30% speedup is below the prediction band's lower
  edge and below the threshold of measurability against per-run noise on
  shared CI runners.
- **F3 — Provenance equivalence breaks.** Any case where the indexed Stigmergy
  produces a different `getMerkleRoot()` than the linear Stigmergy after the
  same insert sequence, or where the cross-runtime parity test
  (`tests/parity/canonicalMerkleParity.*`) regresses. Auditability is a
  hard invariant; speed is not worth losing it.
- **F4 — Determinism breaks.** Any non-determinism introduced by the index
  (e.g. wall-clock-dependent rebuild thresholds, hash-seed-dependent bucket
  centroids) is disqualifying. The baseline script's
  `baseline_ground_truth.json` is byte-stable across runs; the indexed
  variant's equivalent ground-truth file must be byte-stable too, modulo
  recall < 1.0 being a *deterministic* set of disagreements (same disagreements
  every run on every machine).

If any of F1–F4 is observed, the extension is closed without merge and a
short post-mortem is appended to this document explaining which condition
fired and what was learned.

## Non-falsifying invalidation conditions

These do not invalidate the proposal but require the experiment to be
re-run rather than reported as-is:

- **N1 — Baseline-vs-production drift.** If the inlined kernel in the
  baseline script measurably diverges from `StigmergyV5.getResonance` (e.g.
  someone optimises the production class without updating the script), the
  baseline is recomputed first.
- **N2 — Workload mis-specification.** If the 10 k / 64-dim workload is
  determined to mis-represent real adapter usage (e.g. production stores are
  consistently larger or smaller, or higher-dim), the workload is re-specified
  and the baseline re-measured before any implementation work.

## Experiment

The experiment is a **side-by-side benchmark gated behind a feature flag**.
Steps, in order, all checked in:

1. Land this pre-registration document, the baseline script, and
   `baseline_results.json` / `baseline_ground_truth.json` (this PR).
2. Implement the index behind `StigmergyConfig.resonanceIndex: 'merkle-forest'`,
   with the linear path remaining the default. Keep the implementation behind
   the flag for the duration of the experiment.
3. Add a sibling baseline runner — the **same** script with a single flag —
   that exercises the indexed path on the same seeded workload and writes
   `docs/preregistrations/indexed_results.json` and
   `indexed_ground_truth.json`.
4. Add `scripts/baselines/compare-resonance.mjs` that loads both result files
   and emits a structured comparison: per-quantile speedup ratios, recall@1,
   provenance-equivalence pass/fail, and a verdict against F1–F4 above.
5. Wire the comparison runner into a new optional CI job
   (`resonance-baseline-compare`) that fails when any of F1–F4 fires. The
   job runs on every PR that touches `src/core/stigmergyV5.ts`,
   `scripts/baselines/`, or `docs/preregistrations/`.
6. The implementation PR carries the comparison report in its description as
   the deciding artifact. If the comparison report passes, the flag default
   may be flipped to `'merkle-forest'` in a *separate* follow-up PR; if any
   falsification condition fires, the implementation is closed without
   merge and this document is amended with the post-mortem.

## What this document does NOT promise

- It does **not** promise the index will be implemented. If the experiment
  fires a falsification condition, the right outcome is to close the work,
  not to weaken the conditions.
- It does **not** promise the predicted lift band is achievable on a
  particular hardware target. The conditions are stated as ratios to the
  linear baseline measured *on the same hardware in the same CI job*.
- It does **not** unblock any implementation work. Implementation begins
  after this PR merges, and only after.

## Reversibility

Closing the experiment without merging the index leaves the repository
exactly as it is today. No production code paths depend on the
`resonanceIndex` flag because no code path that introduces it is merged
yet — only the baseline measurement infrastructure (script + JSON) ships
in this PR.

## Sign-off (filled in at experiment close, not at PR-open)

- [ ] Experiment run on CI job `resonance-baseline-compare` at SHA `…`.
- [ ] Comparison report attached to implementation PR `#…`.
- [ ] Verdict against F1–F4: …
- [ ] Decision: ☐ merge / ☐ close with post-mortem.
