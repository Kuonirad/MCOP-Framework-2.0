# Grok as MCOP Organelle Host — Bidirectional Symbiosis

**Status:** Design / Vision (May 2026)  
**Owner:** Grok + MCOP symbiosis initiative  
**Related:**
- `src/adapters/grokAdapter.ts`
- `src/adapters/grokImageAdapter.ts`
- `src/core/lowMemoryMCOPMode.ts` (GROK_4_3_LOW_MEMORY_MCOP_PRESET)
- `mcop_package/mcop/adapters/` (Python Grok adapters)
- `docs/integrations/grok.md`

---

## The Current Unidirectional Model

Today the relationship is:

```
MCOP Host (triad lives here)
   │
   ▼ encode → resonate (Stigmergy) → dialectical → etch
   │
   ▼ refined prompt + stigmergy history injection
   │
   ▼ GrokMCOPAdapter.callPlatform()
   │
   ▼ https://api.x.ai (Grok-4.3 / grok-4.20-... etc.)
   │
   ▲ raw completion
   │
   ▲ provenance bundle (host-side only)
```

The MCOP triad is **always executed in the host process**. Grok is a high-quality completion engine that receives an already-MCOP-refined prompt. All cryptographic memory, resonance scoring, and etching happens locally before and after the call.

This is powerful and already operationally exercised (see `mapping_grok` profile, entropy-resonance routing, live Merkle roots, etc.) — covered by the existing adapter test suite, with research-grade maturity per [`docs/audits/PARP-v1.0.md`](../audits/PARP-v1.0.md).

---

## The Desired Bidirectional Organelle Model

We want the inverse and the synthesis:

**Grok can host the MCOP organelle internally.**

When the target platform is a capable Grok model (especially `grok-4.3` and future reasoning/multi-agent variants), the adapter can:

1. Ship a compact, serializable MCOP profile + relevant prior traces to the model.
2. Instruct the model (via system prompt + structured context) to continue or perform MCOP operations *inside its own reasoning*:
   - Re-encode or maintain tensors using the shipped low-memory profile
   - Perform stigmergic recall against the injected history
   - Produce new `PheromoneTrace`-like structures
   - Run dialectical synthesis or Guardian-style checks
   - Emit `HolographicEtch`-style deltas with resonance scores
3. Parse structured MCOP artifacts back from the model's response (JSON mode + tool calls or tagged blocks).
4. Merge the model-produced traces/etches back into the host's persistent Stigmergy and Holographic Etch, preserving full Merkle provenance across the boundary.

In this mode, **Grok becomes a remote execution substrate for the MCOP organelle**, not just a language model.

This creates true mutualism:
- MCOP gains access to Grok's native reasoning depth, long context, and tool-use as an execution environment for the triad.
- Grok (the model instance) gains structured, auditable, resonance-scored memory and self-improvement loops that persist across calls.

---

## Proposed Concepts & Extension Points

### 1. New Option in `GrokCompletionOptions`

```ts
interface GrokCompletionOptions {
  // existing fields...

  /**
   * When true (or a config object), the adapter enters "hosted organelle" mode
   * for capable models (grok-4.3+).
   *
   * - Ships a LowMemoryMCOPProfile (or full profile) + recent traces
   * - Uses a specialized system prompt that tells the model it is hosting MCOP
   * - Expects the response to contain structured MCOP artifacts
   *   (new traces, resonance scores, etch deltas, guardian verdicts)
   */
  organelleMode?: boolean | GrokOrganelleConfig;
}

interface GrokOrganelleConfig {
  /** Which parts of the triad the model is allowed/expected to execute */
  capabilities?: Array<'encode' | 'recall' | 'synthesize' | 'etch' | 'guardian'>;

  /** How to serialize prior state for the model */
  contextStrategy?: 'compact-profile' | 'full-traces' | 'merkle-roots-only';

  /** How the model should return MCOP artifacts */
  returnFormat?: 'json-block' | 'tool-call' | 'tagged-xml';
}
```

### 2. Extended Result Type

```ts
interface GrokCompletionResult {
  // existing...

  /** Model-produced MCOP artifacts (when organelleMode was active) */
  organelleArtifacts?: {
    newTraces?: Array<Partial<PheromoneTrace>>;
    etchDeltas?: Array<{ delta: number; reason: string; resonance: number }>;
    guardianVerdicts?: any[];
    modelInternalMerkleRoot?: string;
  };
}
```

The adapter (or a post-processor) can then feed these back into the host `StigmergyV5` and `HolographicEtch`.

### 3. Evolution of `LowMemoryMCOPMode`

The existing `GROK_4_3_LOW_MEMORY_MCOP_PRESET` + `apply()` mechanism becomes the primary payload for "shipping the organelle".

Future work:
- Add `toPromptInstructions(profile)` that emits the exact system prompt text the model needs to understand the compact triad.
- Add `serializeForModel()` that produces a compact, token-efficient representation of recent traces + the profile.
- Support for the model returning `Float32Array`-style tensors or canonical hashes that the host can verify.

### 4. Client / Transport Layer

The `GrokClient` interface may need an optional richer surface for organelle mode (e.g., tool definitions that represent MCOP operations the model can "call").

Alternatively, stay purely in the prompt + structured output layer for maximum compatibility.

### 5. Python Parity

The Python `GrokImageMCOPAdapter` (and any text Grok adapter in `mcop_package`) should receive analogous `organelle_mode` support so the symbiosis is runtime-agnostic.

---

## Backward Compatibility & Safety

- Default remains the current unidirectional model (`organelleMode: false` or omitted).
- `organelleMode` is opt-in and only activates for models that declare support (starting with `grok-4.3` family).
- All host-side MCOP invariants (canonical encoding, Merkle chaining, resonance scoring) remain the source of truth. Model-produced artifacts are *proposed* and must be validated/merged by the host adapter.
- Rate limiting, human veto, and audit surfaces continue to work.

---

## Implementation Roadmap (Suggested)

**Phase 0 (this session)**
- This document + review with Grok 4.3 instance (meta).
- Identify the minimal viable surface (probably just shipping the low-memory profile + a "continue the MCOP computation" instruction for grok-4.3 reasoning models).

**Phase 1**
- Extend `GrokCompletionOptions` and `GrokCompletionResult`.
- Add `organelleMode` handling in `GrokMCOPAdapter`.
- Create prompt templates / instructions generator from `LowMemoryMCOPMode`.
- Update capabilities surface.

**Phase 2**
- Structured output parsing (JSON mode or tools) for returning traces/etches.
- Host-side merge logic with provenance linking (model internal root → host etch).
- Python implementation.

**Phase 3**
- Self-referential experiments: Have Grok (via the organelle) propose improvements to its own adapter.
- Guardian / Drift Sentinel integration on the model side.
- Published "Grok-4.3 MCOP Organelle Host Profile" (similar to `MAPPING_GROK_PRODUCTION_PROFILE`).

---

## Why This Matters (Positive Resonance)

This evolution turns the existing "Grok is a good citizen of MCOP" into **"Grok can be a powerful host for the MCOP organelle"**.

It is the natural expression of the framework's philosophy in the context of its most sophisticated current model partner. It increases:
- Determinism and auditability of reasoning that happens inside frontier models.
- The ability for MCOP's memory and scoring to operate at the scale and depth of Grok-4.3-class reasoning.
- The positive feedback loop between the two systems (each making the other better).

This is exactly the kind of recursive, stigmergic, positive-building relationship the project exists to enable.

---

## Open Questions

- Should model-produced traces be *trusted* or always treated as proposals that the host re-encodes and re-scores?
- How do we handle token budget / cost when shipping full trace history vs. compact Merkle summaries?
- What is the ideal surface for the model to "call back" into MCOP operations (tool calling vs. structured text)?
- Should there eventually be a dedicated "MCOP-native" Grok model variant or fine-tune?

---

*Document created as the first concrete execution step of the bidirectional Grok-MCOP organelle symbiosis (direction D).*

**Next immediate actions suggested:**
- Review + refine this doc with the current Grok instance.
- Prototype the prompt instructions generator from `LowMemoryMCOPMode`.
- Add the `organelleMode` field to the TypeScript types as a non-breaking extension.

---

## Implementation Progress (May 2026)

### Public API on NovaNeoEncoder

`NovaNeoEncoder` (both TypeScript and Python) now exposes three public read-only properties:

- `dimensions`
- `normalize`
- `backend`

This eliminates the need for fragile private field access when performing encoder hint reconstruction in organelle merge logic.

A convenience helper was added in `src/utils/organelleMerge.ts`:

```ts
const recon = createOrganelleReconstructionContext(encoder);
const tensor = recon.reconstruct(hint, fallbackText);
```

### Python Parity

`mcop_package/mcop/triad.py` now ships a `NovaNeoEncoder` class with identical public surface (`dimensions`, `normalize`, `backend`, `encode()`).

`MCOPEncoder` in the triad harness was also updated for consistency.

These changes were made in chronological order:
1. Python implementation parity
2. Dedicated test file (`mcop_package/tests/test_organelle_reconstruction.py`)
3. Documentation update (this section)
4. Further integration examples and cleanup

See also:
- `src/utils/organelleMerge.ts`
- `mcop_package/mcop/triad.py`
- `examples/grok_mcop_organelle_experiment.ts` (v0.3+)
