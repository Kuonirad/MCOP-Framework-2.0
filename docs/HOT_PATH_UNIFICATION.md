<!--
SPDX-License-Identifier: Apache-2.0
Copyright (c) 2026 Kevin John Kull (Kuonirad) and KullAILABS MCOP Framework contributors
-->

# Hot-Path Unification

**Status date:** 2026-05-29
**Module:** [`src/hardware/hotPathRouter.ts`](../src/hardware/hotPathRouter.ts) · reference kernels in [`referenceKernels.ts`](../src/hardware/referenceKernels.ts)
**Prerequisite for:** the conformance spec (roadmap advance #4)

## Why this exists

The five hot-path operations each reached the accelerator — or didn't — on their
own terms:

| Operation | Where it lived | Accelerator story |
| --- | --- | --- |
| **encode** | `NovaNeoEncoder` | inline, no routing |
| **recall** | `StigmergyV5` | inline cosine |
| **etch** | `HolographicEtch` | inline write |
| **evolve** | `NovaEvolveTuner` | dispatched `meta-dry-run` ad hoc |
| **homeostasis** | `ProteomeOrchestrator` | applied in-loop |

The provenance story was therefore per-module and uneven. That fan-out is
precisely what makes a conformance spec impossible to write (there is no single
contract to specify) and a second maintainer hard to onboard (the hot path has
five front doors). You cannot specify one boundary's contract until the hot path
*has* one boundary.

## The boundary

`HotPathRouter` is that boundary. **Encode, recall, etch, evolve, and
homeostasis** all flow through a single `dispatch` that:

1. **routes** to the wired [`Accelerator`](../src/hardware/Accelerator.ts) when
   it is in CUDA mode (microservice / ONNX / native compute on the device), or
   runs the deterministic **CPU reference kernel** otherwise;
2. **attaches uniform provenance** — every result carries the same
   `AcceleratorProvenance` shape (`kernel`, `device`, `mode`, `merkleRoot`, …);
   and
3. **appends a Merkle-chained entry** to one hot-path provenance log, so the
   whole hot path is a single auditable, replayable stream.

```ts
import { HotPathRouter, createDefaultAccelerator } from '@/hardware';

const router = new HotPathRouter({ accelerator: await createDefaultAccelerator() });

const enc = await router.encode({ tensor, bias });
const rec = await router.recall({ query, library });
const upd = await router.etch({ context, synthesis });
const evo = await router.evolve({ candidates });
const hom = await router.homeostasis({ state, decay, floor, ceil });

router.getProvenanceLog(); // one ordered, chained record of the whole hot path
router.getHotPathRoot();   // deterministic Merkle root over all calls
router.getStats();         // calls, per-op counts, CUDA→CPU fallbacks
```

The chain hash is built from **deterministic fields only** (op, kernel, device,
mode, output) — never the wall-clock timestamp — so `getHotPathRoot()` replays
identically across runs for the same inputs and accelerator. The per-call
`AcceleratorProvenance.merkleRoot` (which does include a timestamp) is preserved
on each result for the existing provenance ecosystem.

## Cross-runtime parity

The CPU reference kernels in `referenceKernels.ts` are **byte-for-byte ports of
`mcop_cuda_server/kernels.py`**. Parity is not asserted by eye: a golden fixture
is generated from the Python reference and the TypeScript reference is checked
against it.

```
python3 tests/parity/generate_hotpath_fixtures.py   # regenerate from Python
pnpm hotpath:test                                    # TS reproduces the golden outputs
```

If either runtime drifts, that side's test fails. This is the parity baseline
the conformance spec will pin both implementations against.

## What is verified

- **Parity**: the TS reference reproduces the Python reference for every kernel
  (`hotPathParity.test.ts` against `tests/parity/hotPathKernels.golden.json`).
- **Unification**: a spy accelerator in CUDA mode receives all five ops with
  their canonical kernel names — proving every op routes through the one
  boundary (`hotPathRouter.test.ts`).
- **Provenance + determinism**: every result carries uniform provenance; the
  hot-path Merkle root is identical across runs for identical inputs.

## What comes next

This unblocks **advance #4 — the conformance spec**: with a single boundary and
a shared golden fixture, the contract any reimplementation (or second
maintainer) must satisfy becomes writable — "the five hot-path ops produce these
outputs and this provenance shape" — turning *"it works because the author knows
how"* into *"it works because the conformance suite passes."*
