<!--
SPDX-License-Identifier: Apache-2.0
Copyright (c) 2026 Kevin John Kull (Kuonirad) and KullAILABS MCOP Framework contributors
-->

# Fast Control Loop

**Status date:** 2026-05-29
**Module:** [`src/control/`](../src/control) · entry point [`FastControlLoop`](../src/control/fastControlLoop.ts)
**Roadmap:** advance #2 of four (see [`EFFICACY_PROGRAM.md`](./EFFICACY_PROGRAM.md) → "What comes next")

## Why this exists

The framework already had both ends of a feedback loop and never joined them.
The CUDA kernels sketch a `homeostasis` op (an **actuator** that drags state
toward an equilibrium) and an `evolveScore` op (a **sensor**). The
[`ProteomeOrchestrator`](../src/proteome/ProteomeOrchestrator.ts) applies the
homeostatic pull-back every step — but **open-loop, at a fixed gain** set by the
genome. The only adaptation was the *slow* [`NovaEvolveTuner`](../src/core/novaEvolveTuner.ts),
which re-tunes that gain every N tasks against a self-referential score. Between
those slow meta-tunes, nothing observed the substrate's actual state and
corrected it.

`FastControlLoop` is the missing inner controller. It closes the loop on a fast
tick, using a real control law instead of a constant.

## The loop

Each tick:

1. **observe** — `plant.measure()` returns the process variable (e.g. the
   proteome's `equilibriumScore`);
2. **control** — [`PIDController`](../src/control/pidController.ts) computes a
   control effort from `setpoint − measurement`;
3. **actuate** — `plant.actuate({ value })` applies that effort (e.g. sets the
   effective homeostasis pull-back) and advances the plant.

Every tick is canonically hashed and Merkle-chained, so the whole trajectory
replays byte-for-byte — the same determinism the rest of MCOP enforces.

### The controller

A textbook positional-form PID, hardened for an auditable substrate:

| Property | Why it matters here |
| --- | --- |
| **Deterministic** | No clock, no RNG — a sealed control trace replays exactly. |
| **Anti-windup** | The integral is clamped *and* held (conditional integration) whenever the output is saturated and integrating would only deepen saturation — the classic fix for "integrator winds up while the actuator is pinned". |
| **Derivative on measurement** | Default; avoids a derivative "kick" when the setpoint changes. |

### The verdict

A loop that runs is not a loop that *worked*. After the run the trajectory is
classified into an auditable verdict, in precedence order:

- `converged` — settled within tolerance for the whole settle window;
- `diverging` — ended materially further from target than it started;
- `oscillating` — error keeps changing sign without settling (limit cycle);
- `saturated` — actuator pinned most of the run, target unreachable in-bounds;
- `unsettled` — ran out of ticks before any of the above resolved.

## Slow ↔ fast coupling

`controlTargetsFromGenome` maps a NOVA-EVOLVE genome's edge-of-chaos knobs onto
the inner loop's targets, so re-tuning the slow genome moves the fast loop's
goalposts by construction:

- `homeostasis` sets **where to aim** — a stronger intended pull-back ⇒ a tighter
  target equilibrium score, mapped into `[0.4, 0.8]`;
- `mutationTemperature` sets **how hard to push** — more exploration noise ⇒ a
  gentler proportional gain, so the loop tracks the trend instead of fighting
  per-step Gaussian jitter.

```ts
import {
  FastControlLoop,
  PIDController,
  ProteomeControlPlant,
  controlTargetsFromGenome,
} from '@/control';
import { ProteomeOrchestrator } from '@/proteome/ProteomeOrchestrator';

const proteome = new ProteomeOrchestrator({ nodeCount: 150, stateDim: 32, seed: 0xc0ffee });
const plant = new ProteomeControlPlant(proteome, { coupleMutationTemperature: true });

const targets = controlTargetsFromGenome(tuner.getCurrentConfig()); // slow → fast
const pid = new PIDController({ ...targets });

const report = await new FastControlLoop(plant, pid).run(200);
// report.verdict, report.steadyStateError, report.merkleRoot …
```

## What is verified

- **Control theory, not vibes.** On a `FirstOrderPlant` (known DC gain), the
  tests assert the analytically-predicted behaviour: PI control drives
  steady-state error to ~0 (`converged`); P-only control leaves the predicted
  residual `1/(1+K·Kp)` and never settles.
- **Every verdict** is exercised with a scripted trajectory.
- **The real substrate.** A `ProteomeControlPlant` run is deterministic
  (same seed + targets ⇒ same Merkle root) and the closed loop tracks the
  setpoint with lower mean error than a fixed open-loop knob.

Run them with `pnpm control:test`.

## What comes next

Advances #3 (temporal dynamics for Stigmergy) and #4 (a conformance spec for the
bus-factor risk) remain. With #1 (efficacy) and #2 (this loop) in place, the next
honest step is to let the efficacy program adjudicate whether closing the loop
actually improves downstream reasoning — exactly the contrast advance #1 was
built to measure.
