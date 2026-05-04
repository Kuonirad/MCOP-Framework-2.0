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

## C4 Model

### Context

MCOP sits between human operators, agent runtimes, and external model providers.
Operators submit prompts, vetoes, and refinement feedback. Agent runtimes call
the triad APIs directly. Provider adapters translate optimized synthesis
requests into model-specific REST, SSE, or local inference calls. The framework
returns cryptographically linked traces so downstream systems can replay why a
decision was accepted, rejected, or routed.

### Containers

| Container | Path | Responsibility |
|:---|:---|:---|
| Next.js app | `src/app` | Browser/server UI, API routes, and observability endpoints. |
| TypeScript triad | `src/core` | Encoder, stigmergy memory, etch ledger, provenance tracer, vector math. |
| Adapter layer | `src/adapters` | Provider-specific integration behind a common request/result contract. |
| npm core package | `packages/core` | Publishable ESM/CJS core surface for consumers outside the app. |
| Python package | `mcop_package` | Cross-runtime canonical encoding and CLI/reference implementation. |
| Automation | `.github/workflows`, `scripts` | CI, supply-chain checks, SBOM, parity guards, publishing. |

### Components

| Component | Primary contract | Notes |
|:---|:---|:---|
| `NovaNeoEncoder` | text → `ContextTensor` | Deterministic SHA-256/hash-trick vectorization with optional normalization. |
| `StigmergyV5` | context/synthesis → `PheromoneTrace` | Circular-buffer retention, adaptive resonance thresholding, Merkle root tracking. |
| `HolographicEtch` | context/synthesis → `EtchRecord` | Confidence-gated append ledger plus rejection audit ring. |
| `SynthesisProvenanceTracer` | synthesis request → chained event | Composes encoder, memory, and etch into a replayable lineage. |
| `vectorMath` | numeric primitives | Shared magnitude, cosine, padding, and dimensionality guard utilities. |
| Adapter implementations | `AdapterRequest` → provider result | Isolate auth, retries, attribution, and provider-specific payloads. |

### Code-level invariants

- Canonical hashes use RFC 8785 JSON serialization via `canonicalDigest`.
- Bounded memory uses `CircularBuffer` to avoid O(n) overflow shifts.
- Resonance scans remain O(n × d), where `n` is retained trace count and `d`
  is comparable vector dimensionality.
- Ragged vectors are deterministically zero-padded at MCOP boundaries rather
  than silently changing tensor magnitudes.
- Low-confidence etches are retained in a dedicated audit ring, not committed
  into the accepted etch stream.

## Stigmergic Coordination and Feedback Control

`StigmergyV5` is intentionally decentralized: local trace writes and local
resonance reads produce system-level continuity without a central planner. The
adaptive resonance threshold samples recent trace weights, estimates the local
mean and dispersion, then applies a hysteresis band before changing acceptance
behavior. This creates negative feedback against high-entropy domains that would
otherwise miss useful traces, while damping oscillation when the trace
distribution is stable.

Memory pressure is bounded by `CircularBuffer`. Eviction is deterministic,
oldest-first, and observable through buffer statistics. This keeps the memory
substrate homeostatic under bursty agent traffic while preserving the latest
coordination traces for self-organization.

## Boundary Contracts

- **TypeScript ↔ Python:** canonical fixtures under `tests/parity` must hash
  byte-identically across runtimes.
- **Browser ↔ server:** Next.js API routes own network boundaries; core modules
  remain deterministic and side-effect-light except for UUID/timestamp capture
  during trace creation.
- **Framework ↔ consumer:** public exports in `src/core/index.ts` and
  `packages/core/src/index.ts` are additive; breaking protocol changes require
  docs and tests.
- **Provider adapters:** external APIs must be isolated behind typed clients so
  tests can inject deterministic mocks.

## ADR Index

| Decision | Location |
|:---|:---|
| Testing strategy | [`docs/adr/2026-04-25-testing-strategy.md`](./docs/adr/2026-04-25-testing-strategy.md) |
| Meta-layer integration | [`docs/adr/2026-04-28-meta-layer-integration.md`](./docs/adr/2026-04-28-meta-layer-integration.md) |
| Resonance-indexed Merkle forest preregistration | [`docs/preregistrations/RESONANCE_INDEXED_MERKLE_FOREST.md`](./docs/preregistrations/RESONANCE_INDEXED_MERKLE_FOREST.md) |

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
