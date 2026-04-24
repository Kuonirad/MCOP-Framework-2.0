# P_GoT × MCOP — v1.0 Formalization

The **Pheromone Graph of Thoughts (P_GoT)** is a directed, tensor-labeled
reasoning graph that composes the three existing MCOP pillars
(`NovaNeoEncoder`, `StigmergyV5`, `HolographicEtch`) into a single
structure with auditable provenance.

## 7-tuple definition

A P_GoT graph is defined as:

```
G = (V, E, Φ, Ψ, Λ, Ω, τ)
```

| Symbol | Meaning                                              | Source in code                 |
| ------ | ---------------------------------------------------- | ------------------------------ |
| V      | Thought nodes                                        | `ThoughtNode` (`pGoT_types`)   |
| E      | Directed edges between thoughts                      | `ThoughtEdge` (`pGoT_types`)   |
| Φ      | Context tensors per node (NovaNeo embeddings)        | `ContextTensor` (`types`)      |
| Ψ      | Synthesis vectors per node                           | `number[]`                     |
| Λ      | Pheromone trace layer (Merkle chain)                 | `StigmergyV5` (`stigmergyV5`)  |
| Ω      | Holographic etch commitments                         | `HolographicEtch` (`holographicEtch`) |
| τ      | Graph version / ordering timestamp                   | ISO-8601 string                |

## Algorithms

Implemented in `src/core/pGoT_algorithms.ts` as the `PGoT` class:

- `addThought(text, synthesisVector, label?, metadata?)` — encode text with
  NovaNeo (Φ), record a stigmergy trace (Λ), and etch a holographic
  commitment (Ω).
- `addEdge(from, to, weight, kind?)` — add a typed edge to E with a per-node
  `maxFanout` guard.
- `reasonFrom(query, steps)` — iterative resonance search: at each step,
  probe Λ with the current vector, follow the best-matching trace back to
  its node, and etch a new Ω record. Returns a `ReasoningStep[]` with the
  resonance score, etch status, and Merkle root at each step.
- `snapshot()` — immutable copy of (V, E, Φ, Ψ, Ω, τ).
- `merkleRoot()` — latest Λ Merkle root (hash of the most recent trace).
- `entropy(id)` — NovaNeo entropy estimate of Φ(node).

## Invariants

1. **Merkle continuity of Λ** — every trace recorded by `StigmergyV5`
   embeds the previous trace's hash, so any mutation of a past thought
   breaks the chain.
2. **Etch gating by Ω** — `HolographicEtch.applyEtch` rejects records
   below `confidenceFloor`; low-confidence thoughts leave no Ω entry.
3. **Bounded fanout** — `PGoTConfig.maxFanout` caps out-degree per node
   (default 16) to prevent pathological reasoning blow-up.
4. **Provenance binding** — `thoughtId` is stored in the trace metadata,
   so `reasonFrom` can recover the originating V node from any Λ trace.

## Composition

```
         ┌─────────────┐
  text → │ NovaNeo (Φ) │ ─┬─→ Λ trace (StigmergyV5)
         └─────────────┘  │
                          └─→ Ω etch (HolographicEtch)
```

Each `addThought` call writes to all three layers atomically at the
application level; no layer is optional.

## Versioning

This document describes P_GoT × MCOP **v1.0**. Breaking changes to the
7-tuple, the class surface, or the invariants above require a new
version directory under `docs/formalization/`.
