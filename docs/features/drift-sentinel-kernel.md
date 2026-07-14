# Drift Sentinel Kernel

The **Drift Sentinel Kernel** is a first-class MCOP module that continuously
computes the divergence

```
Δ(T_d, B_e) = cosineDistance(T_d, mean(B_e))   ∈ [0, 1]
```

between the **declared-task tensor** `T_d` (what the caller said they were
doing — e.g. the system+user prompt embedding) and the
**ensemble-behavior tensor** `B_e` (the observed per-model synthesis vectors
from the Council, reduced to their mean).

## What it produces

1. **Tunable sensitivity.** A static `baseSensitivity` floor plus a dynamic
   `μ + sigmaMultiplier · σ` threshold computed online (Welford's
   algorithm) over the rolling baseline.
2. **Stigmergic signals.** Events at or above
   `stigmergicSignalFloor` severity (`elevated` by default) are queued for
   downstream consumption. Callers wire `consumeStigmergicEvents()` into
   the StigmergyV5 / HolographicEtch continuous-learning loop so the
   substrate learns from drift, not just from confirmation.
3. **Divergence Telemetry surface.** `getTelemetry()` returns
   observation count, flagged/critical counts, rolling baseline (μ, σ),
   a histogram of Δ, and the current Merkle chain head — cheap enough
   to put behind a dashboard endpoint or risk-index query.
4. **Escalation.** Severity classifier returns
   `nominal | watch | elevated | critical` and an `escalation` hint
   (`none | lightweight-review | human-review`) so callers can route
   high-volume traffic to a cheap Council subset and reserve full
   review / human-in-the-loop for the right tail.
5. **Merkle-linked rewind.** Every event has a canonical RFC 8785
   `hash` plus a `parentHash` chain pointer; `rewindFlagged()` returns
   the events whose `reasoningStepId` identifies the exact step where
   divergence crossed threshold. `verifyChain()` proves the linkage.

## Scoping (honest claim)

This kernel is specifically aimed at the **indirect-injection class** that
produces visible task-behavior drift — poisoned retrieval, tool output,
RAG corpora — where the declared task remains clean but the ensemble
behavior diverges.

It is **not** a general-purpose injection firewall. The following remain
out of scope:

- **Direct injection at the input layer** — `T_d` itself is poisoned.
- **Universal jailbreaks** whose failure modes are correlated across the
  ensemble (B_e drifts coherently with T_d).
- **Mimicry attacks** that keep Δ below threshold by impersonating
  legitimate task expansion.

For high-volume consumer traffic, run the kernel as a sampling sensor and
escalate only the right tail; full Council review per request is
defensible only on high-stakes paths.

## Minimal usage

```ts
// Source checkout only; run this example from the repository root.
import { DriftSentinelKernel } from './src/core/driftSentinelKernel';

const sentinel = new DriftSentinelKernel({
  baseSensitivity: 0.15,
  sigmaMultiplier: 2.0,
  criticalCeiling: 0.6,
});

const event = sentinel.observe({
  declaredTask: T_d,
  ensembleBehavior: [B_e_model1, B_e_model2, B_e_model3],
  reasoningStepId: traceId,
});

if (event.escalation.kind === 'human-review') {
  // route to human queue
}

// Feed flagged events into StigmergyV5 / HolographicEtch.
for (const sig of sentinel.consumeStigmergicEvents()) {
  // record as stigmergic trace, etch as continuous-learning signal, etc.
}

// Dashboard / risk index payload.
const telemetry = sentinel.getTelemetry();
```

## Severity classifier

| Severity   | Condition                                            | Escalation          |
|------------|------------------------------------------------------|---------------------|
| `nominal`  | `Δ < baseSensitivity`                                | none                |
| `watch`    | `baseSensitivity ≤ Δ < dynamicThreshold`             | none                |
| `elevated` | `dynamicThreshold ≤ Δ < criticalCeiling`             | lightweight review  |
| `critical` | `Δ ≥ criticalCeiling`                                | human review        |

`dynamicThreshold = max(baseSensitivity, μ + sigmaMultiplier · σ)` where
μ, σ are the Welford-online rolling baseline over all prior observations.
