# Universal MCOP Adapter Integration Protocol (v2.1)

> Multi-platform edition. Status: implemented.

## Purpose

This document specifies how to connect the **Meta-Cognitive Optimization
Protocol (MCOP) v2.0** to external creative-production platforms. MCOP is a
deterministic cognitive layer built on three core primitives:

- **NOVA-NEO Encoder** — deterministic prompt tensorization with tunable
  entropy.
- **Stigmergy v5** — vector-resonance store that preserves stylistic
  continuity and cross-generation pheromones.
- **Holographic Etch** — rank-1 update that records provenance via a Merkle
  audit trail.

By decoupling the cognitive engine from specific services, MCOP can
orchestrate image, video, and narrative generation across any platform
without sacrificing determinism, provenance, or human control.

## Architecture

```
src/
└── adapters/                       # TypeScript adapters
    ├── types.ts                    # IMCOPAdapter contract + provenance shapes
    ├── dialecticalSynthesizer.ts   # Human-in-the-loop refinement seam
    ├── baseAdapter.ts              # Abstract pipeline (encode → resonance → etch)
    ├── magnificAdapter.ts          # Magnific image/video/upscale adapter (ex-Freepik)
    ├── freepikAdapter.ts           # Legacy backward-compat wrapper → magnificAdapter
    ├── utopaiAdapter.ts            # Long-form narrative adapter
    └── genericProductionAdapter.ts # 20-line scaffold for new platforms

mcop_package/mcop/adapters/         # Python adapters
    ├── base_adapter.py             # BaseMCOPAdapter + parity stigmergy/etch
    └── higgsfield_adapter.py       # Cinematic video adapter (Kling/Veo/Sora)

examples/
    ├── full_film_production_pipeline.ts
    ├── magnific_production_flow.ts   # Post-rebrand Magnific v1/ai/ API usage
    ├── freepik_production_flow.ts    # Legacy compat wrapper (deprecated)
    ├── higgsfield_cinematic_pipeline.py
    └── multi_platform_orchestrator.ts
```

Each adapter subclasses the language-appropriate base class
(`BaseAdapter` in TS, `BaseMCOPAdapter` in Python) and exposes high-level
convenience methods (`generateOptimizedImage`, `optimizeCinematicVideo`,
…). Adapters are responsible for:

1. Calling `encoder.encode()` on incoming prompts or scripts with the
   appropriate entropy targets.
2. Querying `stigmergy.getResonance()` against prior traces to align with
   previous assets / brand style.
3. Passing the encoded prompt through the **dialectical synthesizer**
   for human-in-the-loop editing.
4. Applying `etch.applyEtch()` to record provenance and produce a Merkle
   root.
5. Recording the new trace via `stigmergy.recordTrace()` so future calls
   can resonate against this generation.
6. Invoking the downstream platform API/SDK and returning both the result
   and the provenance metadata.

> **Order matters.** Resonance is queried *before* recording so the
> current call never self-resonates against a trace it just emitted.

## Base Adapter Contract (TypeScript)

```ts
interface IMCOPAdapter<TRequest = AdapterRequest, TResult = unknown> {
  generate(input: TRequest): Promise<AdapterResponse<TResult>>;
  getCapabilities(): Promise<AdapterCapabilities>;
}
```

`AdapterRequest` carries the prompt, optional `styleContext` tensor,
domain hint, entropy target, optional `humanFeedback`, and a
platform-specific `payload`. `AdapterResponse` returns the platform
result alongside a Merkle root and a `ProvenanceMetadata` bundle:

```ts
interface ProvenanceMetadata {
  tensorHash: string;       // SHA-256 of the encoded tensor (Float64 LE)
  traceId?: string;
  traceHash?: string;       // Stigmergy Merkle hash for this generation
  resonanceScore: number;   // Cosine score against prior traces
  etchHash: string;         // Holographic etch hash (empty if skipped)
  etchDelta: number;
  refinedPrompt: string;    // Output of the dialectical synthesizer
  timestamp: string;
}
```

Adapters MUST be lightweight (no heavy dependency footprint) and MUST
NOT modify the MCOP core. Stateful concerns (rate-limit caching,
long-form stitching, …) live inside the adapter.

## Example: Magnific (TypeScript)

```ts
import {
  HolographicEtch,
  NovaNeoEncoder,
  StigmergyV5,
} from '@/core';
import { MagnificMCOPAdapter } from '@/adapters';

const adapter = new MagnificMCOPAdapter({
  encoder: new NovaNeoEncoder({ dimensions: 64, normalize: true }),
  stigmergy: new StigmergyV5({ resonanceThreshold: 0.4 }),
  etch: new HolographicEtch({ confidenceFloor: 0 }),
  client: magnificClient, // your SDK / MCP wrapper targeting /v1/ai/*
  maxUpscaleOutputArea: 33_177_600, // 8K UHD guardrail
  maxCallCostEur: 5.0,
});

const { result, merkleRoot } = await adapter.generateOptimizedImage(
  'aurora-lit cathedral at dawn, painterly mood',
  { model: 'mystic-2.5-fluid', resolution: '4k' },
);
```

**Post-April 2026 rebrand notes:**
- Routes are now under `/v1/ai/*`
- Image upscaling uses volumetric pixel-area pricing (2×, 4×, 8×, 16×)
- Video upscaling uses the dedicated `POST /v1/ai/video-upscaler/turbo` endpoint
- `turbo` and `premium_quality` booleans are removed
- Raw Base64 or direct HTTPS URLs required — no canvas.toDataURL()
- Model-agnostic orchestration: Mystic 2.5, Google Veo 3.1, ByteDance Seeddance 2.0

## Example: Higgsfield (Python)

```python
from mcop.adapters import HiggsfieldMCOPAdapter

adapter = HiggsfieldMCOPAdapter(client=higgsfield_sdk)
response = adapter.optimize_cinematic_video(
    script_segment="wide aerial of a glacier at sunrise",
    motion_refs=["push-in", "low-angle"],
)
print(response.result.model, response.merkle_root)
```

The default model scorer biases selection on resonance score and the
number of motion references. Pass a custom `model_scorer` callable to
override.

## Generic Adapter Template

Use `GenericProductionAdapter` as a 20-line scaffold for any new
platform — provide a `platform` name and a `dispatch` function and the
adapter handles encoding, resonance, dialectical refinement, and
provenance for you.

## Reference Implementations

| Reference | Location | Notes |
| --- | --- | --- |
| Full film production case study | [`examples/full_film_production_pipeline.ts`](../../examples/full_film_production_pipeline.ts) | Writing → visual development → shot generation → score stems → editorial → delivery, all sharing one triad and Merkle lineage. |
| ONNX embedding backend | [`examples/onnx_embedding_backend.ts`](../../examples/onnx_embedding_backend.ts) | Optional neural embedding path; can be hosted on CPU, CUDA, DirectML, or WebGPU services before returning a projected `ContextTensor`. |
| MCP reference server | [`examples/universal_adapter_mcp_server/`](../../examples/universal_adapter_mcp_server/) | JSON-RPC-over-stdio tools for `capabilities`, `generate`, and `prepare`; swap the fixture adapter for any production `IMCOPAdapter`. |

## Integration Patterns

| Pattern                | Notes                                                                                                                |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------- |
| **NPM / PyPI package** | Publish `@kullailabs/mcop-adapters` and `mcop-adapters`. One-line import drops MCOP into existing pipelines.         |
| **Docker sidecar**     | `docker run -e MCOP_ADAPTERS=magnific,higgsfield …` exposes adapter functionality over REST/gRPC.                     |
| **MCP Server**         | Re-expose adapter methods as MCP tools for LLM orchestration frameworks (Magnific ships an MCP server).                 |
| **Next.js dashboard**  | Surface resonance metrics ("Magnific asset → Higgsfield shot continuity: 94 %") on the existing triad visualizer.        |
| **Generic template**   | Copy `genericProductionAdapter.ts`, override `dispatch`, wire the new platform.                                      |

## Constraints

- **Human primacy** — adapters MUST not bypass the dialectical
  synthesizer when a human override is required. A `HumanFeedback.veto`
  raises `HumanVetoError` and refuses dispatch.
- **Rate limits / latency** — long-running video jobs SHOULD use
  asynchronous polling and resumption inside the adapter; the framework
  itself is request-response.
- **Audit trail** — every adapter call returns a Merkle root; consumers
  SHOULD persist `ProvenanceMetadata` for compliance and reproducibility.
- **Vendor changes** — encapsulate breaking changes inside the adapter
  and surface feature detection through `getCapabilities()`.

## Adding a New Platform

1. Copy `src/adapters/genericProductionAdapter.ts` (or
   `mcop_package/mcop/adapters/base_adapter.py` for Python adapters).
2. Implement `callPlatform` / `call_platform` that dispatches the
   refined prompt to the vendor SDK.
3. Implement `getCapabilities` with the supported models and features.
4. Add unit tests (jest under `src/__tests__/`, pytest under
   `mcop_package/tests/`) — coverage thresholds (75 / 80 / 80 / 80) are
   enforced in CI.
5. Add a usage example under `examples/`.
