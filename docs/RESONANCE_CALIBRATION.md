# Resonance Calibration — Killing the Magic Number

> **TL;DR** — The stigmergic resonance threshold is no longer the
> uncalibrated constant `0.65`. When you don't pass an explicit threshold,
> `StigmergyV5` now derives it in closed form from the encoder's noise model:
> τ(M, α, n) = Φ⁻¹((1−α)^(1/n)) / √M. For the stock configuration (hash
> backend, 2048-trace buffer, α = 1%) that is **τ ≈ 0.7816**. Under the same
> null model the legacy `0.65` admitted a **21.5%** per-query false-resonance
> rate at full buffer occupancy (Gaussian bound; ≈ 5.6% measured by Monte
> Carlo with real SHA-256 tensors).

## What the hash backend provably is

`NovaNeoEncoder` with `backend: 'hash'` (or `'novaNeoWeb'`) maps a text to
32 SHA-256 bytes, rescales each byte affinely onto `[-1, 1]`, and tiles the
result to the configured dimensionality. Two consequences follow directly:

1. **It is exact-match memory.** The same text always produces the same
   tensor (cosine 1); different texts produce statistically independent
   tensors. There is no semantic locality in this keyspace — nearby meanings
   do *not* produce nearby tensors. Combined with the RFC 8785 canonical
   digest chain, the hash backend is best described as **tamper-evident,
   content-addressed exact-match memory**.
2. **Its noise floor has a closed form.** Tiling adds no information: the
   cosine of two tiled tensors equals the cosine of the underlying
   32-vectors, so the effective dimensionality is `M = min(dimensions, 32)`
   — for every practical configuration, **M = 32**, regardless of whether
   you configured 128, 256, or 1024 dimensions.

## The null model and the threshold formula

For two unrelated texts the tensor components are i.i.d. and zero-mean, so
the cosine score is asymptotically `Normal(0, 1/M)`. A resonance query takes
the **best** score over up to `n` buffered traces, so the probability that an
unrelated query spuriously resonates is

```
P(false resonance) = 1 − Φ(τ·√M)ⁿ
```

Inverting for a target budget α (Šidák correction) gives the analytic
threshold shipped in [`src/core/resonanceCalibration.ts`](../src/core/resonanceCalibration.ts):

```
τ(M, α, n) = Φ⁻¹((1 − α)^(1/n)) / √M
```

| Configuration | τ |
| --- | --- |
| Hash backend (M = 32), n = 2048, α = 0.01 — **new default** | **0.7816** |
| Hash backend (M = 32), n = 2048, α = 0.05 | 0.7169 |
| Hash backend (M = 32), n = 1, α = 0.01 | 0.4112 |
| Embedding backend, M = 256, n = 2048, α = 0.01 | 0.2763 |

## The 21.5% finding

Evaluating the legacy constant against this null model:

```
falseResonanceRate(0.65, M = 32, n = 2048) = 0.2148
```

i.e. with a full default buffer of unrelated traces, **roughly one in five
queries produced a "resonant" match that was pure hash noise** — which the
temporal-pheromone layer then *reinforced*, depositing weight on unrelated
trails.

The Gaussian figure is a conservative upper bound: the bounded, uniform-ish
components of real SHA-256 tensors have sub-Gaussian cosine tails. Monte
Carlo with real SHA-256 tensors (2 000 independent queries against 2 048
unrelated traces each) measures:

| Threshold | Gaussian bound | Measured (SHA-256 MC) |
| --- | --- | --- |
| 0.65 (legacy) | 21.5% | ≈ 5.6% |
| 0.7816 (calibrated) | 1.0% | 0 / 2 000 |

Both numbers point the same way: `0.65` sat well inside the noise band of
the very backend it was the default for, and the calibrated floor clears it
with margin. Reproduce with:

```ts
import { analyticThreshold, falseResonanceRate } from '@kuonirad/mcop-core';

falseResonanceRate(0.65, 32, 2048);            // 0.2148
analyticThreshold(32, { alpha: 0.01, candidates: 2048 }); // 0.7816
```

(The exact figures are pinned in `src/__tests__/resonanceCalibration.test.ts`.)

## What changed in `StigmergyV5`

- **No config (most users):** the base threshold is now
  `analyticThreshold(32, { alpha: 0.01, candidates: maxTraces })` ≈ 0.7816
  instead of 0.65. The adaptive threshold (on by default) still takes over
  once ≥ 3 traces are recorded, so steady-state behaviour is dominated by
  the observed weight distribution exactly as before; the calibrated value
  governs the cold-start window and the hysteresis anchor.
- **Explicit `resonanceThreshold` or numeric `adaptiveThreshold`:** wins,
  unchanged — existing tuned deployments are unaffected.
- **New `noiseFloor` config** for tuning the calibration:

```ts
const stigmergy = new StigmergyV5({
  noiseFloor: {
    alpha: 0.001,              // tighter false-resonance budget
    backend: 'embedding',      // semantic backend: no 32-dim saturation
    tensorDimensions: 256,
  },
});
```

## Dual-key traces: identity and locality as orthogonal axes

The calibration makes explicit what the hash keyspace can and cannot do:
cryptographic identity, not semantic recall. Rather than letting one tensor
pretend to do both, a trace can now carry **two keys bound under one
canonical digest**:

```ts
const hashKey = hashEncoder.encode(text);          // cryptographic identity
const semanticKey = embedEncoder.encode(text);     // semantic locality

stigmergy.recordTrace(hashKey, synthesis, metadata, {
  semanticContext: semanticKey,
});

stigmergy.getResonance(hashEncoder.encode(text));                       // exact-match / integrity axis
stigmergy.getResonance(embedEncoder.encode(query), { keyspace: 'semantic' }); // semantic-recall axis
```

Properties:

- The semantic key is part of the digested payload, so it is sealed by the
  same Merkle chain — tampering with either key breaks verification.
- Traces recorded without a semantic key keep their digests **byte-identical
  to v5** (the field is omitted, not `null`), so existing chains, golden
  fixtures, and TS↔Python parity are untouched.
- Semantic queries skip single-key traces instead of scoring garbage.

## Scope and honesty notes

- The closed form models the *unrelated-text* null. It bounds false
  resonance; it says nothing about recall on related texts (the hash
  keyspace has none by construction — that is what the semantic key is for).
- For the embedding backend the i.i.d. assumption is an approximation
  (feature-hashed components are weakly dependent); treat its floor as an
  unrelated-text noise estimate, not a guarantee.
- The Monte Carlo figures above model traces as random independent texts.
  Live buffers with templated/correlated text will sit between the
  exact-duplicate and fully-independent regimes.
- A known side-effect is under investigation: spurious resonance acted as an
  unintended ε-greedy exploration channel under temporal pheromone dynamics.
  Raising the floor removes that accidental noise channel; if ablation shows
  it carried real exploration value, it should return as a *deliberate,
  tunable* channel (e.g. `curiosityBonus`), not as an artifact of an
  uncalibrated constant.
