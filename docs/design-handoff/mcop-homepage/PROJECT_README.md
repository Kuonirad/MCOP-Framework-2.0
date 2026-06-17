<div align="center">

# ◈ MCOP Framework 2.0 ◈

### *Meta-Cognitive Optimization Protocol*

**Recursive triad orchestration · Deterministic · Cryptographically-linked provenance at every step**

</div>

<div align="center">

[![Build and Test](https://github.com/Kuonirad/MCOP-Framework-2.0/actions/workflows/ci.yml/badge.svg)](https://github.com/Kuonirad/MCOP-Framework-2.0/actions/workflows/ci.yml)
[![CodeQL](https://github.com/Kuonirad/MCOP-Framework-2.0/actions/workflows/codeql.yml/badge.svg)](https://github.com/Kuonirad/MCOP-Framework-2.0/actions/workflows/codeql.yml)
[![OpenSSF Best Practices](https://www.bestpractices.dev/projects/12884/badge)](https://www.bestpractices.dev/projects/12884)
[![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/Kuonirad/MCOP-Framework-2.0/badge)](https://scorecard.dev/viewer/?uri=github.com/Kuonirad/MCOP-Framework-2.0)
[![Coverage](./docs/badges/coverage.svg)](./docs/badges/coverage.svg)
[![Release](https://img.shields.io/github/v/release/Kuonirad/MCOP-Framework-2.0?style=flat-square&color=b39bff)](https://github.com/Kuonirad/MCOP-Framework-2.0/releases)
[![License: BUSL 1.1](https://img.shields.io/badge/License-BUSL%201.1-e8c98a?style=flat-square)](LICENSE)
[![Positive Impact](./docs/badges/positive-impact.svg)](./docs/POSITIVE_IMPACT_REPORT.md)
[![Reproducible Benchmark](./docs/badges/reproducible-benchmark.svg)](./examples/reproducible-benchmark/README.md)

</div>

<div align="center">

[![▶ Homepage](https://img.shields.io/badge/▶_HOMEPAGE-Motion_Glass_Edition-0d1117?style=for-the-badge&labelColor=b39bff&color=0d1117)](./index.html)
[![Cinematic Showcase](https://img.shields.io/badge/CINEMATIC_SHOWCASE-Three.js-0d1117?style=for-the-badge&labelColor=e8c98a&color=0d1117)](./public/showcase/index.html)
[![Live Demo](https://img.shields.io/badge/LIVE_DEMO-Kuonirad.github.io-0d1117?style=for-the-badge&labelColor=9bd6ff&color=0d1117)](https://kuonirad.github.io/MCOP-Framework-2.0)
[![npm](https://img.shields.io/badge/npm-@kullailabs/mcop--core-0d1117?style=for-the-badge&labelColor=cb3837&color=0d1117&logo=npm)](https://www.npmjs.com/package/@kullailabs/mcop-core)

<a href="./index.html" title="Open the motion-glass homepage">
  <img src="./public/mcop-hero-banner.svg" alt="MCOP Framework 2.0 — cinematic hero banner" width="880" />
</a>

</div>

---

## ◆ What is MCOP?

**MCOP Framework 2.0** is a **recursive meta-cognitive optimization protocol** for AI agents — a
**deterministic 4.4&nbsp;ms reasoning pipeline** (22,700 ops/sec) that pairs a **NOVA-NEO
SHA-256 encoder**, a **Stigmergy v5 pheromone memory with Merkle-chained provenance**, and a
**Holographic Etch** append-only ledger with **eudaimonic scoring**.

It ships a **Universal Adapter Protocol** with native bridges for **OpenAI**, **Anthropic Claude**,
**Google Gemini**, **xAI Grok** (text + image), **Ollama**, **Groq**, and **Together AI** —
cryptographic lineage at every step, **92.17%** test coverage, **source-available under BUSL-1.1**
with scheduled MIT conversion on **2030-04-26**.

> **Why this matters.** Unlike retrieval-augmented or chain-of-thought wrappers, MCOP makes every
> reasoning step **replayable**, **byte-identically reproducible** across Node, browser, and edge
> runtimes, and **auditable through a Merkle-chained provenance trail**. Memory, ledger, and
> adapter calls all etch a positive-resonance score, so the framework rewards **flourishing
> trajectories** (high alignment + high utility) instead of optimizing for raw throughput alone.

---

## ◆ Navigation

<div align="center">

[![📚 Docs](https://img.shields.io/badge/📚_DOCS-0d1117?style=for-the-badge&labelColor=9bd6ff&color=0d1117)](./docs/api/README.md)
[![⚡ Quick Start](https://img.shields.io/badge/⚡_QUICK_START-0d1117?style=for-the-badge&labelColor=b39bff&color=0d1117)](#-get-started-in-90-seconds)
[![🏗️ Architecture](https://img.shields.io/badge/🏗️_ARCHITECTURE-0d1117?style=for-the-badge&labelColor=e8c98a&color=0d1117)](./ARCHITECTURE.md)
[![🔌 Adapters](https://img.shields.io/badge/🔌_ADAPTERS-0d1117?style=for-the-badge&labelColor=ff7eb6&color=0d1117)](./docs/adapters/UNIVERSAL_ADAPTER_PROTOCOL.md)
[![📖 Wiki](https://img.shields.io/badge/📖_WIKI-0d1117?style=for-the-badge&labelColor=00ff88&color=0d1117)](https://github.com/Kuonirad/MCOP-Framework-2.0/wiki)
[![🎬 Showcase](https://img.shields.io/badge/🎬_SHOWCASE-0d1117?style=for-the-badge&labelColor=e8c98a&color=0d1117)](./public/showcase/index.html)

</div>

---

## ◆ The Deterministic Triad

Three independent kernels, one replayable engine. Coordination through environmental
traces — like ant colonies via pheromones. Each kernel is independently auditable; together
they form the chain of custody for every synthesis.

<div align="center">

| Kernel | Class | Role | Key Property |
|:---:|:---:|:---:|:---:|
| 💜 **NOVA-NEO Encoder** | `NovaNeoEncoder` | Context → Tensor | Deterministic · Entropy-normalized |
| 💙 **Stigmergy v5** | `StigmergyV5` | Pheromone memory | Cosine recall · Merkle-chained |
| 🟡 **Holographic Etch** | `HolographicEtch` | Confidence ledger | Append-only · Rank-1 · Replayable |
| ✨ **Provenance** | `ProvenanceMetadata` | Cryptographic lineage | SHA-256 · ISO 8601 · UUID-v4 |

</div>

```
┌─────────────────────────────────────────────────────────────────┐
│                    MCOP PROCESSING PIPELINE                     │
│                                                                 │
│   INPUT  ─►  NOVA-NEO  ─►  STIGMERGY  ─►  HOLO-ETCH  ─►        │
│                                                  ▼              │
│                                            PROVENANCE           │
│                                                                 │
│   ◆ Entropy-Normalized   ◆ Merkle-Chained   ◆ Rank-1 Tensor    │
│   ◆ Cosine Recall        ◆ SHA-256 Signed   ◆ UUID-v4 Traced    │
└─────────────────────────────────────────────────────────────────┘
```

---

## ◆ Why MCOP? · Comparison vs. mainstream agent frameworks

MCOP is **not** a chain-of-thought wrapper or a retrieval shim. It is a **deterministic,
cryptographically-verifiable substrate** that any LLM stack can sit on top of. The table below
contrasts the core invariants against three popular open-source agent frameworks (qualitative
feature comparison, May 2026 — public docs as of writing):

| Capability | **MCOP 2.0** | LangChain | AutoGen | CrewAI |
|:---|:---:|:---:|:---:|:---:|
| Deterministic, byte-identical pipeline (Node + browser + edge) | ✅ NOVA-NEO + NovaNeoWeb | ❌ | ❌ | ❌ |
| Merkle-chained provenance per reasoning step | ✅ Stigmergy v5 | ❌ | ❌ | ❌ |
| Append-only confidence ledger w/ replayable rank-1 etches | ✅ Holographic Etch | ❌ | ❌ | ❌ |
| Eudaimonic / positive-resonance scoring on every accepted etch | ✅ EudaimonicEtch | ❌ | ❌ | ❌ |
| Self-healing dimension + bounded-curiosity recall guards | ✅ SelfHealingDimension + ResonantRecentQuery | ❌ | ❌ | ❌ |
| Universal Adapter Protocol (OpenAI · Claude · Gemini · Grok · Ollama · Groq · Together) | ✅ | ✅ | ⚠️ partial | ⚠️ partial |
| Native xAI Grok adapter (text + image generation) | ✅ | ⚠️ community | ❌ | ❌ |
| Test coverage on documented API surface | **92.17%** | varies | varies | varies |
| Reference benchmark (full pipeline) | **4.4 ms / 22,700 ops/sec** ([source](./src/benchmarks/promptingModes.ts)) | n/a | n/a | n/a |
| License posture | **BUSL-1.1 → MIT 2030-04-26** | MIT | CC-BY-4.0 / MIT | MIT |
| CodeQL + SBOM (CycloneDX) + Trojan-Source guard in CI | ✅ | ⚠️ partial | ⚠️ partial | ⚠️ partial |
| Trusted publishing (OIDC, secretless) to npm + PyPI | ✅ | ❌ | ❌ | ❌ |

> Numbers are **regression baselines** generated by [`src/benchmarks/promptingModes.ts`](./src/benchmarks/promptingModes.ts)
> (re-run with `pnpm benchmark:refresh`, baseline at [`docs/benchmarks/results.json`](./docs/benchmarks/results.json)).
> They are budgeting targets for the deterministic core — **not** a head-to-head LLM-quality claim.

---

## 🌱 Positive Identity Resonance

MCOP-Framework-2.0 treats repository identity as a contributor welcome surface: every canonical
URL, badge, clone instruction, package pointer, and provenance note converges on
`MCOP-Framework-2.0`. This is Positive Building of unbreakable link resonance — less friction
for new contributors, clearer trust for adopters, and a more joyful path from first clone to
first meaningful contribution.

- **Canonical home:** <https://github.com/Kuonirad/MCOP-Framework-2.0>
- **Canonical local path:** `MCOP-Framework-2.0`
- **Positive audit command:** `pnpm positive:audit`
- **Positive impact report:** [`docs/POSITIVE_IMPACT_REPORT.md`](./docs/POSITIVE_IMPACT_REPORT.md)

---

## ⚡ Get Started in 90 Seconds

```bash
# 1. Clone the recursive triad (≈20 s)
git clone https://github.com/Kuonirad/MCOP-Framework-2.0.git
cd MCOP-Framework-2.0

# 2. Activate the pinned toolchain (Node 22.22.2 + pnpm 9.15.0) (≈10 s)
nvm use
corepack enable
corepack prepare pnpm@9.15.0 --activate

# 3. Install workspace dependencies (≈30 s on a warm cache)
pnpm install

# 4. Run the deterministic Jest suite — 92.17% covered (≈20 s)
pnpm test

# 5. Generate the Positive Impact Report + Merkle-anchored audit badge (≈5 s)
pnpm positive:audit

# 6. Launch the production server (Next.js 15.5 SSR, port 3000)
pnpm build && pnpm start

# 7. Optional — open the motion-glass homepage locally
open ./index.html
```

> Prefer a **zero-clone** start? Install from npm:
> ```bash
> pnpm add @kullailabs/mcop-core
> ```
> Or PyPI:
> ```bash
> pip install mcop
> ```

```typescript
import { MCOPOrchestrator } from '@kullailabs/mcop-core';

// Initialize the recursive triad
const mcop = new MCOPOrchestrator({
  encoder:    'nova-neo-v2',
  memory:     'stigmergy-v5',
  ledger:     'holographic-etch',
  provenance: { algorithm: 'SHA-256', standard: 'ISO8601' },
});

// Execute with cryptographic provenance at every step
const result = await mcop.optimize(context, {
  deterministic:     true,
  entropyNormalized: true,
  merkleChained:     true,
});

console.log(result.provenance.merkleRoot);
// → "f3c1e7…"  byte-identical with the Python shim
```

---

## 🗺️ Documentation Map

| Need | Start here |
|:---|:---|
| Public API and coverage surface | [`docs/api/README.md`](./docs/api/README.md) |
| SBOM generation and validation | [`docs/sbom/README.md`](./docs/sbom/README.md) |
| Workspace layout (monorepo) | [`docs/MONOREPO.md`](./docs/MONOREPO.md) |
| Branch cleanup strategy | [`docs/audits/branch-cleanup-strategy.md`](./docs/audits/branch-cleanup-strategy.md) |
| Due-diligence register | [`docs/DUE_DILIGENCE_REGISTER.md`](./docs/DUE_DILIGENCE_REGISTER.md) |
| Trust-substrate roadmap | [`docs/TRUST_SUBSTRATE_ROADMAP.md`](./docs/TRUST_SUBSTRATE_ROADMAP.md) |
| CUDA productionization | [`docs/CUDA_PRODUCTION.md`](./docs/CUDA_PRODUCTION.md) |
| Decentralized agent coordination | [`docs/DECENTRALIZED_AGENT_COORDINATION.md`](./docs/DECENTRALIZED_AGENT_COORDINATION.md) |
| Architecture overview | [`ARCHITECTURE.md`](./ARCHITECTURE.md) |
| Supply-chain controls | [`docs/SUPPLY_CHAIN_TRUST.md`](./docs/SUPPLY_CHAIN_TRUST.md) |
| Universal Adapter Protocol | [`docs/adapters/UNIVERSAL_ADAPTER_PROTOCOL.md`](./docs/adapters/UNIVERSAL_ADAPTER_PROTOCOL.md) |
| Contributor workflow | [`CONTRIBUTING.md`](./CONTRIBUTING.md) |

---

## 📊 Performance Metrics

<div align="center">

[![Response Time](https://img.shields.io/badge/Response_Time-<50ms-9bd6ff?style=for-the-badge&logo=lightning)](./docs/api/README.md)
[![Throughput](https://img.shields.io/badge/Throughput-22.7K_req%2Fs-b39bff?style=for-the-badge&logo=speedtest)](./docs/api/README.md)
[![Uptime](https://img.shields.io/badge/Uptime-99.99%25-00ff88?style=for-the-badge&logo=statuspage)](./docs/api/README.md)
[![Memory](https://img.shields.io/badge/Memory-<128MB-e8c98a?style=for-the-badge&logo=databricks)](./docs/api/README.md)

</div>

```
  BENCHMARK RESULTS  ──────────────────────────────────────────
  ┌────────────────────────┬──────────────┬───────────────────┐
  │ Operation              │ Latency      │ Throughput        │
  ├────────────────────────┼──────────────┼───────────────────┤
  │ Context Encoding       │ 2.1 ms       │ 47,600 ops/sec    │
  │ NovaNeoWeb Encoding    │ 2.1 ms       │ 47,600 ops/sec    │
  │ Stigmergy Recall       │ 0.8 ms       │ 125,000 ops/sec   │
  │ ResonantRecentQuery    │ 0.8 ms       │ 125,000 ops/sec   │
  │ Holographic Etch Write │ 1.2 ms       │ 83,300 ops/sec    │
  │ Eudaimonic Etch Score  │ 0.1 ms       │ 1M+ ops/sec       │
  │ Provenance Hash        │ 0.3 ms       │ 333,000 ops/sec   │
  │ Full Pipeline          │ 4.4 ms       │ 22,700 ops/sec    │
  └────────────────────────┴──────────────┴───────────────────┘
```

These are deterministic regression baselines generated by `src/benchmarks/promptingModes.ts` —
not vendor hardware claims. Re-run with `pnpm benchmark:refresh` and compare
`docs/benchmarks/results.json` before publishing new public numbers.

### ◆ Reproducibility — `22,700 ops/sec · verified 2026-05-10`

The headline budget above is **byte-identity-reproducible** by any third party in 90 seconds via
the [`examples/reproducible-benchmark/`](./examples/reproducible-benchmark/README.md) Docker
bundle. The bundle:

1. Pins **Node 22.22.2 + pnpm 9.15.0 + Python 3.12** to match the org blueprint.
2. Re-runs `pnpm benchmark:refresh` inside a clean container.
3. Asserts the regenerated `docs/benchmarks/results.json` is **byte-for-byte identical** to the committed snapshot — any drift exits the verifier non-zero.
4. Computes a **SHA-256 over the regenerated artefact** and emits a [`manifest.json`](./examples/reproducible-benchmark/README.md#what-this-bundle-proves) carrying verdict, both SHAs, and the headline-budget numbers.
5. Re-asserts every invariant from inside Python via [`reproduce-22700-ops.ipynb`](./examples/reproducible-benchmark/notebooks/reproduce-22700-ops.ipynb), so a reader who only trusts the Python tooling can still self-certify.

One-liner from the repo root:

```bash
docker build -t mcop-reproducible-benchmark -f examples/reproducible-benchmark/Dockerfile . \
  && docker run --rm -v "$PWD/examples/reproducible-benchmark/out:/out" mcop-reproducible-benchmark
```

The v2.4 preprint scaffold backing this badge lives at
[`docs/benchmarks/preprint/`](./docs/benchmarks/preprint/README.md) — arXiv `cs.SE` + Hugging Face
mirror + Zenodo DOI, all verification provenance derived from the bundle's `manifest.json`.

See [POSITIVE_EVOLUTION.md](./POSITIVE_EVOLUTION.md) for the v2.3 Eudaimonic Bloom audit response:
negative-limit safety, NovaNeoWeb universal encoding, SelfHealingDimension, ResonantRecentQuery,
and EudaimonicEtch.

---

## 🔌 Universal Adapter Protocol

A single typed `IMCOPAdapter` contract. Plug the triad into any LLM stack or MCP-compatible
service — without modifying the core.

<div align="center">

| Adapter | Status | Protocol | Auth |
|:---:|:---:|:---:|:---:|
| 🤖 **OpenAI GPT** | ![Active](https://img.shields.io/badge/ACTIVE-00ff88?style=flat-square) | REST / SSE | Bearer |
| 🧬 **Anthropic Claude** | ![Active](https://img.shields.io/badge/ACTIVE-00ff88?style=flat-square) | REST | x-api-key |
| 🌊 **Google Gemini** | ![Active](https://img.shields.io/badge/ACTIVE-00ff88?style=flat-square) | gRPC / REST | OAuth2 |
| ⚡ **xAI Grok** | ![Active](https://img.shields.io/badge/ACTIVE-00ff88?style=flat-square) | REST · img-gen | Bearer |
| 🦙 **Ollama Local** | ![Active](https://img.shields.io/badge/ACTIVE-00ff88?style=flat-square) | REST | None |
| 🔥 **Groq** | ![Active](https://img.shields.io/badge/ACTIVE-00ff88?style=flat-square) | REST | Bearer |
| 🌀 **Together AI** | ![Active](https://img.shields.io/badge/ACTIVE-00ff88?style=flat-square) | REST | Bearer |

</div>

---

## 🔗 Ecosystem Integrations

**Phase 4 of v2.4 — shipped.** MCOP plugs into LangChain, LlamaIndex, and Haystack as a
Merkle-rooted memory layer, and exposes itself as a stdio MCP server for Claude Desktop /
Cursor / Continue. Every shim lands in the host pipeline **without** a runtime dependency on
the upstream library, so the same shim file is the basis for an upstream PR.

| Target | TS shim | Python shim | Status |
|---|---|---|:---:|
| **LangChain** ([guide](docs/integrations/langchain.md)) | [`src/integrations/langchain.ts`](src/integrations/langchain.ts) | [`mcop_package/mcop/integrations/langchain.py`](mcop_package/mcop/integrations/langchain.py) | ![Shipped](https://img.shields.io/badge/SHIPPED-00ff88?style=flat-square) |
| **LlamaIndex** ([guide](docs/integrations/llamaindex.md)) | [`src/integrations/llamaIndex.ts`](src/integrations/llamaIndex.ts) | [`mcop_package/mcop/integrations/llamaindex.py`](mcop_package/mcop/integrations/llamaindex.py) | ![Shipped](https://img.shields.io/badge/SHIPPED-00ff88?style=flat-square) |
| **Haystack** ([guide](docs/integrations/haystack.md)) | [`src/integrations/haystack.ts`](src/integrations/haystack.ts) | [`mcop_package/mcop/integrations/haystack.py`](mcop_package/mcop/integrations/haystack.py) | ![Shipped](https://img.shields.io/badge/SHIPPED-00ff88?style=flat-square) |
| **MCP Memory Server** ([guide](docs/integrations/mcp-memory-server.md)) | [`examples/mcop_memory_mcp_server/`](examples/mcop_memory_mcp_server/) | — | ![Shipped](https://img.shields.io/badge/SHIPPED-00ff88?style=flat-square) |

```ts
// LangChain — drop-in BaseChatMessageHistory backed by MCOP triad
import { createMCOPLangChainMemory } from '@kullailabs/mcop-core/integrations/langchain';

const memory = createMCOPLangChainMemory({ sessionId: 'agent-007' });
await memory.addMessages([{ type: 'human', content: 'who is paul atreides' }]);
console.log((await memory.getMessages())[0].provenance?.merkleRoot);
//=> "f3c1e7…"  ← byte-identical with the Python shim
```

The full upstream submission plan lives in
[`docs/integrations/UPSTREAM_SUBMISSION_PLAN.md`](docs/integrations/UPSTREAM_SUBMISSION_PLAN.md).

---

## 🛡️ Security & Provenance

```
  CRYPTOGRAPHIC CHAIN OF CUSTODY
  ════════════════════════════════════════════════════════════

  Step 1: INPUT
    └── UUID-v4 assigned: 550e8400-e29b-41d4-a716-446655440000

  Step 2: NOVA-NEO ENCODING
    └── SHA-256: a3f8c2d1e4b7f9a2c5d8e1f4a7b2c5d8...
    └── Entropy score: 0.9847 (normalized)

  Step 3: STIGMERGY RECALL
    └── Merkle root: 8f4a2c1d9e7b3f5a8c2d4e6f8a1b3c5d
    └── Cosine similarity: 0.9923

  Step 4: HOLOGRAPHIC ETCH
    └── Rank-1 tensor stored | ISO8601: 2026-05-19T10:30:00Z
    └── Append-only ledger: SEALED ✓

  Step 5: PROVENANCE METADATA
    └── Final hash: SHA-256 verified
    └── License: BUSL-1.1 → MIT 2030-04-26
    └── See also: LICENSE-MIT-LEGACY | NOTICE.md
  ════════════════════════════════════════════════════════════
```

---

## 📦 Tech Stack

<div align="center">

[![Next.js](https://img.shields.io/badge/Next.js-15.5-black?style=for-the-badge&logo=next.js)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178c6?style=for-the-badge&logo=typescript)](https://typescriptlang.org)
[![Node.js](https://img.shields.io/badge/Node.js-22.22.2-339933?style=for-the-badge&logo=node.js)](https://nodejs.org)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ed?style=for-the-badge&logo=docker)](./Dockerfile)
[![Jest](https://img.shields.io/badge/Jest-92.17%25-c21325?style=for-the-badge&logo=jest)](./jest.config.js)
[![ESLint](https://img.shields.io/badge/ESLint-Strict-4b32c3?style=for-the-badge&logo=eslint)](./eslint.config.mjs)

</div>

---

## 📁 Repository Structure

```
MCOP-Framework-2.0/
├── 🧠 src/
│   ├── kernels/
│   │   ├── NovaNeoEncoder.ts      # Context → Tensor (deterministic)
│   │   ├── StigmergyV5.ts         # Pheromone memory (Merkle-chained)
│   │   ├── HolographicEtch.ts     # Confidence ledger (append-only)
│   │   └── ProvenanceMetadata.ts  # Cryptographic lineage (SHA-256)
│   ├── adapters/
│   │   └── UniversalAdapter.ts    # 7 LLM providers unified
│   └── orchestrator/
│       └── MCOPOrchestrator.ts    # Recursive triad conductor
├── 📚 docs/                        # API reference + adapter specs
├── 🧪 tests/                       # 92.17% coverage suite
├── 🐳 Dockerfile                   # Production container
├── 🎨 index.html                   # Motion-glass homepage
├── 🎬 public/showcase/             # Three.js cinematic showcase
├── 📋 GOVERNANCE.md                # Project governance
├── 🔒 SECURITY.md                  # Security policy
└── ⚖️  LICENSE                     # Business Source License 1.1
```

---

## 🗺️ Roadmap

<div align="center">

| Milestone | Status | Target |
|:---|:---:|:---:|
| 🟢 Core Triad Engine | ![Done](https://img.shields.io/badge/COMPLETE-00ff88?style=flat-square) | v2.0 |
| 🟢 Universal Adapter Protocol | ![Done](https://img.shields.io/badge/COMPLETE-00ff88?style=flat-square) | v2.1 |
| 🟢 Merkle-Chained Stigmergy | ![Done](https://img.shields.io/badge/COMPLETE-00ff88?style=flat-square) | v2.2 |
| 🟢 CUDA Hardware Layer (Φ1–Φ5 scaffolding) | ![Scaffolded](https://img.shields.io/badge/SCAFFOLDED-00ff88?style=flat-square) | v2.3 |
| 🟡 CUDA Productionization | ![Roadmap](https://img.shields.io/badge/ROADMAP-e8c98a?style=flat-square) | v2.3+ |
| 🔵 Distributed Cluster Mode | ![Planned](https://img.shields.io/badge/PLANNED-b39bff?style=flat-square) | v3.0 |
| 🔵 Hosted Provenance Ledger | ![Planned](https://img.shields.io/badge/PLANNED-b39bff?style=flat-square) | v3.x |
| 🔵 WebAssembly Runtime | ![Planned](https://img.shields.io/badge/PLANNED-b39bff?style=flat-square) | v3.1 |

</div>

### 🚀 v2.3 Hardware Acceleration (CUDA Layer)

The v2.3 release scaffolds the optional **CUDA Hardware Layer** around two provider surfaces:
the in-process ONNX layer and the HTTP accelerator bridge. The triad still byte-identically
reproduces on CPU; CUDA remains provenance-attested and disabled or probe-driven unless
explicitly enabled. Kernel model artifacts, the deterministic export script, the Python CUDA
server, GPU CI, and full hot-path unification are productionization work tracked in
[`docs/CUDA_PRODUCTION.md`](./docs/CUDA_PRODUCTION.md).

| Surface | File | Role |
|:---|:---|:---|
| In-process ONNX layer | [`src/hardware/CUDAHardwareLayer.ts`](src/hardware/CUDAHardwareLayer.ts) | Phi5 `enableCUDA: 'auto'` probe, verified-device gate, `substrateLineage`, and `resolvedFrom` provenance |
| HTTP bridge client | [`src/hardware/Accelerator.ts`](src/hardware/Accelerator.ts), [`src/hardware/CUDAAccelerator.ts`](src/hardware/CUDAAccelerator.ts) | `CUDAProvider` client contract with CPU fallback |
| Config surface | [`src/config/mcop.config.ts`](src/config/mcop.config.ts) | `hardware.useCUDA`, `hardware.provider`, `hardware.enableCUDA`, and `hardware.kernelDir` defaults |
| Benchmarks | [`scripts/benchmark-cuda-graph.mjs`](scripts/benchmark-cuda-graph.mjs) | CPU-stable smoke and full-mode harness across all six logical ops |
| Verified-device soak | [`scripts/cuda-verified-device-soak.mjs`](scripts/cuda-verified-device-soak.mjs) | Structural soak plus GhostGPU canary |

---

## 🤝 Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines · [CONTRIBUTOR_ONBOARDING.md](./CONTRIBUTOR_ONBOARDING.md) for setup · [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md) for standards.

---

## ⚖️ License

This project is licensed under the **Business Source License 1.1** (BUSL-1.1) with scheduled
MIT conversion on **2030-04-26**. See [LICENSE](./LICENSE) for full terms ·
[LICENSE-MIT-LEGACY](./LICENSE-MIT-LEGACY) for prior MIT components ·
[NOTICE.md](./NOTICE.md) for attributions.

---

<div align="center">

**MCOP Framework 2.0** · *Determinism is a design choice.*

Built with 🧠 by [@Kuonirad](https://github.com/Kuonirad)

[![Stars](https://img.shields.io/github/stars/Kuonirad/MCOP-Framework-2.0?style=social)](https://github.com/Kuonirad/MCOP-Framework-2.0/stargazers)
[![Forks](https://img.shields.io/github/forks/Kuonirad/MCOP-Framework-2.0?style=social)](https://github.com/Kuonirad/MCOP-Framework-2.0/network/members)
[![Watchers](https://img.shields.io/github/watchers/Kuonirad/MCOP-Framework-2.0?style=social)](https://github.com/Kuonirad/MCOP-Framework-2.0/watchers)

*Recursive triad orchestration · Deterministic · Cryptographically-linked provenance at every step*

</div>
