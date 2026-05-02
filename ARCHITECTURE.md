# 🏛️ MCOP Framework Architecture

## Overview

The **MCOP (Meta-Cognitive Optimization Protocol) Framework** implements collective intelligence through stigmergic coordination—a mechanism where agents coordinate through environmental traces rather than direct communication.

> **Canonical expansion.** Across the repository, **MCOP** expands to
> **Meta-Cognitive Optimization Protocol**. Earlier documents and packages
> sometimes used "Multi-Cognitive Optimization Protocol" or "Meta-Cognitive
> Operating Protocol"; those are historical variants of the same project.
> See [`PLAIN_ENGLISH_GLOSSARY.md`](./PLAIN_ENGLISH_GLOSSARY.md#mcop) §1.

**Core Insight:** Just as ant colonies coordinate via pheromone trails, AI agents can coordinate through persistent "cognitive traces" in a shared memory substrate.

---

## System Components

### 1. **StigmergyV5** - Collective Memory Engine
- Stores context→synthesis mappings as "pheromone traces"
- Uses cosine similarity for pattern matching
- Merkle-chained for tamper evidence

### 2. **NovaNeoEncoder** - Context Vectorization
- Converts inputs to numerical tensors
- Entropy-based normalization
- Configurable dimensionality

### 3. **HolographicEtch** - State Change Ledger
- Append-only audit trail
- Tracks parameter evolution

---

## Key Design Decisions

### Why Cosine Similarity?
- Scale-invariant (direction > magnitude)
- Fast O(d) computation
- Ideal for semantic vectors

### Why Merkle Chains?
- Tamper-evident history
- Distributed verification
- Minimal overhead (SHA-256)

## Long-Form Video Generation

`LongFormVideoOrchestrator` (`src/core/longFormVideoOrchestrator.ts`) extends
the triad to coherent video sequences beyond per-call provider ceilings
(PAI 3 min, Veo ~2 min, Sora ~1 min) by treating generation as a recurrent
process over the existing memory substrate:

- **Short-term memory** ↔ recent stigmergy traces (FramePack analogue).
- **Long-term retrieval** ↔ `StigmergyV5.getResonance` against the embedded
  narrative prompt (SemanticPack analogue).
- **Direct Forcing** ↔ each clip's *generated* fingerprint — not the prompt
  embedding — is fed back into the bank, closing the train/inference gap
  described in arXiv 2510.01784.
- **Provenance** ↔ one `SynthesisProvenanceTracer.synthesize` event per clip,
  Merkle-chained.

A self-contained Python reference of MemoryPack + Direct Forcing on a
minimal video DiT lives at `examples/memorypack_direct_forcing.py`; an
end-to-end TypeScript demo wiring the orchestrator around a stub adapter
lives at `examples/long_form_video_pipeline.ts`.

The orchestrator does not bundle a diffusion backbone. Production
deployments inject a `VideoClipAdapter` backed by `MagnificMCOPAdapter`
(`veo-3.1` / `seeddance-2.0` / `kling-v3`) or an in-house Wan/CogVideoX
runner.

---

**See full architecture details in codebase comments and tests**
