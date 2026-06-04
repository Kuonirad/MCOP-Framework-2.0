<!--
SPDX-License-Identifier: Apache-2.0
Copyright (c) 2026 Kevin John Kull (Kuonirad) and KullAILABS MCOP Framework contributors
-->

# Temporal Stigmergy

**Status date:** 2026-05-29
**Module:** [`src/core/temporalStigmergy.ts`](../src/core/temporalStigmergy.ts) · integrated into [`StigmergyV5`](../src/core/stigmergyV5.ts)
**Roadmap:** advance #3 of four (see [`EFFICACY_PROGRAM.md`](./EFFICACY_PROGRAM.md) → "What comes next")

## Why this exists

Stigmergy is named after how social insects coordinate through the environment:
an ant lays a pheromone trail, and crucially that trail **evaporates** unless
other ants keep re-walking it. Useful trails are reinforced into highways;
obsolete ones fade. The *temporal* dynamics are the whole point of the metaphor.

Stigmergy v5 had none of them. A trace's `weight` was the cosine similarity
**frozen at record time**, and recency was only a tiebreaker in the ranking. A
six-month-old trace and a six-second-old one of equal similarity were treated
identically. Memory only ever accumulated — it never decayed, and re-encountering
a useful trail did not strengthen it.

This advance adds the two missing forces.

## The model

A small, deterministic [`PheromoneLedger`](../src/core/temporalStigmergy.ts)
sits *beside* the Merkle-sealed trace chain — it tracks a pheromone level per
trace id and **never touches the trace hashes**, so provenance is unchanged.

- **Evaporation.** A deposit decays with a configurable half-life:

  ```
  strength(t) = max(floor, deposit · 2^(−Δt / halfLife))
  ```

  After one half-life an un-reinforced trail is at half strength. `floor = 0`
  gives true evaporation; `floor > 0` lets a trail persist faintly forever.

- **Reinforcement.** Re-traversing a trail decays it to *now*, adds a gain
  (saturating at `strengthCap`), and resets its decay clock. A trail walked
  often stays strong; a trail walked once fades.

Time is **injected** (`now: () => number`), never read from a wall clock inside
the model, so a replayed sequence of deposits and reinforcements yields
identical strengths — the same falsify-first determinism the rest of MCOP
enforces.

## How it changes Stigmergy

Temporal dynamics are **opt-in**. With `temporalDynamics` omitted or
`enabled: false`, `StigmergyV5` behaves exactly as before — weights are static,
no clock is read, and no new fields appear on results. When enabled:

| Surface | Behaviour |
| --- | --- |
| `recordTrace` | Lays down a pheromone deposit at the trace's weight; forgets the ledger entry of any trace evicted from the bounded buffer. |
| `getResonance` | A resonant match counts as **re-traversal** and reinforces the matched trail (configurable via `reinforceOnResonance`); the result carries `pheromoneStrength`. |
| `getResonantRecent` | Folds current strength into the ranking, so a **stale trail sinks below an equally-similar fresh one**. Each trace carries its `pheromoneStrength`. |
| New API | `isTemporalEnabled`, `getPheromoneStrength`, `reinforceTrace`, `pruneFadedTraces`, `getTemporalStats`. |

```ts
import { StigmergyV5 } from '@/core';

const stig = new StigmergyV5({
  resonanceThreshold: 0.65,
  temporalDynamics: {
    enabled: true,
    halfLifeMs: 60_000,       // trails halve every minute…
    reinforcementGain: 0.25,  // …and re-traversal tops them back up
    floor: 0,                 // true evaporation
  },
  // now: () => logicalClockMs,  // inject for deterministic replay
});

const trace = stig.recordTrace(context, synthesis);
// …time passes, the trail evaporates…
const hit = stig.getResonance(query);     // a match reinforces the trail
hit.pheromoneStrength;                     // current strength of the matched trail
stig.pruneFadedTraces(1e-3);               // drop trails that have faded away
```

## What is verified

- **Decay law** halves on schedule, respects the floor, and guards clock skew.
- **Reinforcement** decays-to-now, adds the gain, resets the clock, and saturates
  at the cap.
- **Integration**: a fresh trail ranks above an equally-similar stale one;
  resonance reinforces; strength evolution is deterministic under a replayed
  clock; and with dynamics disabled the v5 surface is byte-for-byte unchanged.

Run them with `pnpm temporal:test`.

## What comes next

Only advance #4 remains — extracting a **conformance spec** so the framework
survives its Bus-Factor-1 risk. With #1 (efficacy), #2 (the fast control loop),
and #3 (this) in place, the honest closing question is whether decay + the
closed loop actually improve downstream reasoning — which is exactly what the
pre-registered efficacy program from advance #1 exists to adjudicate.
