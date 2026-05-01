# MCOP Case Studies

These case studies turn the framework claims into runnable, reviewable flows.
They use local fixture clients by default, so they can run in CI or on a
laptop without vendor credentials while preserving the same adapter contracts
used by production integrations.

## Full film production pipeline

**Script:** [`examples/full_film_production_pipeline.ts`](../examples/full_film_production_pipeline.ts)

This example routes a short feature-film brief through writing, visual
development, shot generation, score-stem creation, editorial assembly, and
festival delivery packaging. The same `NovaNeoEncoder`, `StigmergyV5`, and
`HolographicEtch` instances are shared by every department adapter.

| Department | Adapter | Output | Provenance value |
| --- | --- | --- | --- |
| Writing | `UtopaiMCOPAdapter` | scene script + storyboard URL | establishes narrative memory traces |
| Visual development | `MagnificMCOPAdapter` | hero frames | links image prompts to scene-script tensors |
| Shot generation | `MagnificMCOPAdapter` | video shots | carries the same style context into motion |
| Sound | `GenericProductionAdapter` | score stems | records audio cues under the shared triad |
| Editorial | `GenericProductionAdapter` | EDL / rough-cut reel | packages shot and stem URLs into an auditable edit |
| Delivery | `GenericProductionAdapter` | buyer-screening manifest | checks that each stage emitted Merkle roots |

Run it with:

```sh
pnpm dlx tsx --tsconfig tsconfig.json examples/full_film_production_pipeline.ts
```

Expected behavior:

- No external API calls are made.
- Every stage returns an `AdapterResponse` with `ProvenanceMetadata`.
- `festival-delivery` marks the manifest `auditReady` only after the upstream
  writing, visual, sound, and editorial stages have emitted enough Merkle roots.
- The final console output includes the rough-cut URL, delivery manifest ID,
  final etch Merkle root, and Stigmergy root.

To move the case study toward production, replace the fixture clients with real
Magnific, Utopai, audio, editorial, and delivery SDK wrappers while preserving
the adapter request/response surfaces. Persist the `merkleRoot` and
`provenance` fields in the production asset database next to the vendor job IDs.

## ONNX/GPU acceleration demo

**Script:** [`examples/onnx_embedding_backend.ts`](../examples/onnx_embedding_backend.ts)

The ONNX example shows how neural embeddings can replace hash-only prompt
encoding when semantic resonance matters more than byte-identical
cross-machine reproducibility. It remains optional so the core package keeps a
small dependency footprint.

CPU run:

```sh
pnpm add onnxruntime-node
mkdir -p .models
curl -L -o .models/all-MiniLM-L6-v2.onnx \
  https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2/resolve/main/onnx/model.onnx
ONNX_MODEL_PATH=.models/all-MiniLM-L6-v2.onnx \
  pnpm exec tsx examples/onnx_embedding_backend.ts \
  "crystalline entropy targets for cinematic narratives"
```

GPU run patterns:

- **NVIDIA CUDA:** install an ONNX Runtime build with CUDA execution-provider
  support, keep the model path the same, and run on a CUDA-enabled runner.
- **DirectML / Windows GPU:** use a DirectML-capable ONNX Runtime package and
  preserve the same `IEmbeddingBackend` projection seam.
- **Browser/WebGPU:** keep the adapter contract unchanged and move inference
  behind a WebGPU-backed embedding service; return the projected
  `ContextTensor` to MCOP before resonance and etch.

The important integration boundary is stable: external accelerators produce a
fixed-width tensor, then MCOP continues with Stigmergy resonance,
dialectical refinement, and Holographic Etch provenance.
