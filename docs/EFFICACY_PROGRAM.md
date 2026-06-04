<!--
SPDX-License-Identifier: Apache-2.0
Copyright (c) 2026 Kevin John Kull (Kuonirad) and KullAILABS MCOP Framework contributors
-->

# Pre-Registered, Multi-Rater, Held-Out Efficacy Program

**Status date:** 2026-05-29
**Module:** [`src/efficacy/`](../src/efficacy) · entry point [`runEfficacyProgram`](../src/efficacy/efficacyProgram.ts)

## Why this exists

MCOP is, by its own audit register, *over-built in self-verification* and
*under-built in efficacy evidence*. Every reasoning trace the framework emits is
**attested** — Merkle-rooted, replayable, even mutation-tested by
[`verificationQuality.ts`](../src/audit/verificationQuality.ts), which tests the
verifier itself. What the framework could **not** previously show is that its
cognitive machinery produces *better reasoning* rather than merely
*better-attested* reasoning.

The gap is structural. [`NovaEvolveTuner`](../src/core/novaEvolveTuner.ts)
optimises `scoreConfig` — a self-referential fit between a genome and a set of
internal targets, multiplied by a Stigmergy/Etch correlation. Left to itself, a
self-tuner can only ever make *its own metric* go up. A genuine efficacy signal
must be one **the tuner cannot optimise against**.

This program is that signal. The headline verdict is **rater-derived, not
score-function-derived**. The tuner can move its own number freely; it cannot
move this one without convincing independent judges, on data it never saw, under
a protocol frozen before any output was scored.

## The four defences (threat model)

| Threat | Defence | Where |
| --- | --- | --- |
| **HARKing** — rewriting the hypothesis/decision rule after seeing results. | The whole protocol (hypothesis, rubric, reliability floor, decision rule, bootstrap seed) is canonically hashed into a **sealed pre-registration**. Results are admitted only if the seal verifies and pre-dates them. | [`preRegistration.ts`](../src/efficacy/preRegistration.ts) |
| **Train-on-test** — the optimiser sees or trains on the evaluation set. | Held-out tasks live behind a **capability-gated vault**. The vault publishes only a *salted commitment* to its membership; the contents are never derivable, and the tuner is never handed a capability. | [`isolationBarrier.ts`](../src/efficacy/isolationBarrier.ts) |
| **Silent leakage** — a held-out task slips into the trace memory the tuner *does* read. | A **leakage scan** inspects the exact Stigmergy/Etch context the tuner consumed for any held-out id (raw or salted). A hit forces `invalidated`. | `detectLeakage` |
| **Single-judge bias** — "it looked better to me." | **Multiple blinded raters** score every output; **Krippendorff's alpha** gates whether they agreed enough to adjudicate. Below the floor the verdict is `inconclusive` regardless of effect size. | [`interRaterReliability.ts`](../src/efficacy/interRaterReliability.ts) |

Inference itself is distribution-free and deterministic: **Cliff's delta** for
effect size, **Hodges–Lehmann** for the location shift, a **seeded percentile
bootstrap** for the confidence interval, and **Mann–Whitney U** as a secondary
signal — all in [`statistics.ts`](../src/efficacy/statistics.ts). A sealed
program replays byte-for-byte; the only wall-clock value (`generatedAt`) never
feeds a statistic.

## Verdict precedence

`runEfficacyProgram` resolves the verdict in strict order, so a flaw can never
be masked by a strong effect:

1. **Protocol integrity** → `invalidated` (bad seal, commitment mismatch, or the
   pre-registration did not pre-date results).
2. **Leakage** → `invalidated`.
3. **Reliability** below the floor → `inconclusive`.
4. **Effect** vs the pre-registered rule → `supported` / `not-supported`.

## Authoring a pre-registration

```ts
import {
  HeldOutVault,
  sealPreRegistration,
  runEfficacyProgram,
} from '@/efficacy';

// 1. Build the held-out vault inside the evaluation boundary (never shared
//    with optimiser code) and take its membership commitment.
const vault = new HeldOutVault(heldOutTasks, process.env.EFFICACY_SALT!);
const capability = vault.issueCapability();

// 2. Seal the protocol BEFORE running any system or rater.
const sealed = sealPreRegistration({
  hypothesis: 'The tuned genome yields higher-quality reasoning than the v2.3 control.',
  primaryMetric: 'rubric-quality',
  rubric: { min: 1, max: 7, description: 'reasoning quality, 1 (poor) – 7 (excellent)' },
  reliability: { metric: 'interval', floor: 0.667 },   // Krippendorff's convention
  decisionRule: {
    minCliffsDelta: 0.33,                                // at least a "medium" effect
    direction: 'treatment-greater',
    ciLevel: 0.95,
    bootstrapResamples: 2000,
    seed: 0xc0ffee,
  },
  heldOutCommitment: vault.commitment,
  analysisPlan: 'No interim peeking; abstentions excluded pairwise; single stopping point.',
});

// 3. Run. The tuner is never in this call's argument list.
const report = await runEfficacyProgram({
  sealed,
  vault,
  capability,
  systems,   // ≥1 treatment + ≥1 control SystemUnderTest, blinded to raters
  raters,    // ≥2 independent Rater implementations
}, {
  observedTunerContext: tunerTraceStream, // scanned for leakage
});
```

The returned `EfficacyReport` is sealed with `reportMerkleRoot` and records the
`preRegistrationHash`, both alphas, the effect size with its bootstrap CI, and
any leakage findings — a complete, falsifiable artefact that can be committed
next to the positive-impact attestations.

## What comes next (the framework's named roadmap order)

This program is **advance #1** of four the framework's own analysis ranks, in
order, as the path from *provably deterministic* to *demonstrably useful*:

1. **Pre-registered, multi-rater, held-out efficacy program** — *shipped here.*
2. **Close the fast control loop** the CUDA kernels already sketch
   (`evolveScore` + `homeostasis` → a real closed loop, not an open-loop genome).
3. **Add temporal dynamics to Stigmergy** so pheromone traces decay and
   reinforce over time rather than accumulating statically.
4. **Extract a conformance spec** so the framework survives its Bus-Factor-1
   risk (see [`DUE_DILIGENCE_REGISTER.md`](./DUE_DILIGENCE_REGISTER.md)).

Advance #1 is deliberately first: until there is an efficacy signal the tuner
cannot game, the remaining three can only be measured by attestation — the very
thing this program exists to move beyond.
