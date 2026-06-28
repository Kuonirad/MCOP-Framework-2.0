# MCOP-Scaffolded LLM — First Merkle-Rooted Response

The literal starting point for building an LLM application on MCOP's systems
design. [`index.ts`](./index.ts) wraps an existing LLM's inference loop with the
MCOP triad so that **every response carries cryptographic provenance**:

| Kernel | Role |
|---|---|
| **NOVA-NEO Encoder** | Deterministic SHA-256 text→tensor encoding (the anchor) |
| **Stigmergy V5** | Merkle-chained pheromone memory with cosine recall |
| **Holographic Etch** | Adaptive four-factor confidence scoring + audit ledger |

Each call to `reason()` emits a trace hash, a parent hash (linking the previous
step), a confidence breakdown, and the Merkle root of the entire reasoning
chain.

## Run it from this repo

```bash
pnpm install            # from the repo root
npx tsx examples/mcop_scaffolded_llm/index.ts "What is the capital of France?"
npx tsx examples/mcop_scaffolded_llm/index.ts --recall "European geography"
npx tsx examples/mcop_scaffolded_llm/index.ts --demo
```

Point it at any OpenAI-compatible endpoint (Ollama, LM Studio, vLLM, OpenAI):

```bash
LLM_BASE_URL=http://localhost:11434/v1 LLM_MODEL=llama3.2 \
  npx tsx examples/mcop_scaffolded_llm/index.ts "prompt"
```

With no endpoint reachable it falls back to a deterministic offline stub, so it
doubles as executable documentation. Force the stub with `MCOP_LLM_OFFLINE=1`.

> **Runner note:** the in-tree `tsconfig.json` declares `@/*` path aliases that
> some standalone TS runners mishandle when resolving the ESM-only
> `canonicalize` dependency. The framework's own test runner maps `canonicalize`
> through a CJS shim (see `jest.config.js`); if your runner trips on it, run the
> example as part of a copied standalone project (below), which avoids the
> alias entirely.

## Use it in your own project

This file imports the triad from the in-tree source (`../../src/core`) because
it lives inside the framework repo. When you copy it into your own project,
install the published package and swap the import:

```bash
mkdir mcop-llm && cd mcop-llm
pnpm init
pnpm add @kullailabs/mcop-core openai
pnpm add -D tsx typescript
```

```ts
// Swap the repo-internal import …
import { NovaNeoEncoder, StigmergyV5, HolographicEtch } from '../../src/core';
// … for the published package:
import { NovaNeoEncoder, StigmergyV5, HolographicEtch } from '@kullailabs/mcop-core';
```

Both surfaces export the same three classes with identical signatures.

## Configuration

| Env var | Default | Meaning |
|---|---|---|
| `LLM_BASE_URL` | `http://localhost:11434/v1` | OpenAI-compatible base URL |
| `LLM_MODEL` | `llama3.2` | Model name passed to the endpoint |
| `LLM_API_KEY` | `ollama` | API key (Ollama ignores it) |
| `MCOP_LLM_OFFLINE` | _unset_ | `1` forces the deterministic offline stub |

## Output fields

| Field | What it is | Why it matters |
|---|---|---|
| `traceHash` | Canonical (RFC 8785) digest of the trace payload + parent hash | Tamper-evident: changing the prompt, response, or metadata breaks this and every subsequent hash |
| `parentHash` | Hash of the previous trace (`null` for genesis) | Forms the chain — each trace commits all prior traces |
| `etchHash` | Digest of the etch record (empty string if rejected) | Proves the reasoning was committed to (or rejected from) the confidence ledger |
| `etchDelta` | Normalized dot product of context and synthesis tensors | Direct measure of prompt↔response alignment in the encoder's space |
| `confidence.score` | Blend `0.5·alignment + 0.2·magnitude + 0.3·recency`, gated by the static floor | Adaptive structural-soundness assessment |
| `confidence.accepted` | Whether the normalized delta cleared `confidenceFloor` | Determines main-ring vs. audit-ring commitment |
| `merkleRoot` | Hash of the latest trace (commits the whole chain) | Publish it to let anyone verify a reasoning chain occurred without revealing its contents |

## Verified against the source

The triad APIs used here were checked against
[`packages/core/src`](../../packages/core/src) and
[`src/core`](../../src/core):

- `NovaNeoEncoder#encode(text) → number[]`
- `StigmergyV5#recordTrace(context, synthesis, metadata?) → PheromoneTrace`,
  `#getResonance(context) → ResonanceResult`,
  `#getMerkleRoot() → string | undefined`
- `HolographicEtch#scoreConfidence(context, synthesis) → AdaptiveConfidenceBreakdown`,
  `#applyEtch(context, synthesis, note?) → EtchRecord`

Note `getMerkleRoot()` returns `string | undefined` (undefined before the first
trace); the example coalesces it to the genesis trace hash.
