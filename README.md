<div align="center">

# ◈ MCOP FRAMEWORK 2.0 ◈
### *Meta-Cognitive Optimization Protocol*

---

[![Build and Test](https://github.com/Kuonirad/MCOP-Framework-2.0/actions/workflows/ci.yml/badge.svg)](https://github.com/Kuonirad/MCOP-Framework-2.0/actions/workflows/ci.yml)
[![CodeQL](https://github.com/Kuonirad/MCOP-Framework-2.0/actions/workflows/codeql.yml/badge.svg)](https://github.com/Kuonirad/MCOP-Framework-2.0/actions/workflows/codeql.yml)
[![OpenSSF Best Practices](https://www.bestpractices.dev/projects/12884/badge)](https://www.bestpractices.dev/projects/12884)
[![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/Kuonirad/MCOP-Framework-2.0/badge)](https://scorecard.dev/viewer/?uri=github.com/Kuonirad/MCOP-Framework-2.0)
[![Coverage](./docs/badges/coverage.svg)](./docs/badges/coverage.svg)
[![Release](https://img.shields.io/github/v/release/Kuonirad/MCOP-Framework-2.0?style=flat-square&color=7b2dff)](https://github.com/Kuonirad/MCOP-Framework-2.0/releases)
[![License: BUSL 1.1](https://img.shields.io/badge/License-BUSL%201.1-ffd700?style=flat-square)](LICENSE)
[![Maintained](https://img.shields.io/badge/maintained-yes-00ff88?style=flat-square)](./GOVERNANCE.md)
[![Positive Impact](./docs/badges/positive-impact.svg)](./docs/POSITIVE_IMPACT_REPORT.md)
[![Reproducible Benchmark](./docs/badges/reproducible-benchmark.svg)](./examples/reproducible-benchmark/README.md)

---

```

  ██████████████████████████████████████████████████████████
  ██                                                      ██
  ██    ███╗   ███╗ ██████╗ ██████╗ ██████╗              ██
  ██    ████╗ ████║██╔════╝██╔═══██╗██╔══██╗             ██
  ██    ██╔████╔██║██║     ██║   ██║██████╔╝             ██
  ██    ██║╚██╔╝██║██║     ██║   ██║██╔═══╝              ██
  ██    ██║ ╚═╝ ██║╚██████╗╚██████╔╝██║                  ██
  ██    ╚═╝     ╚═╝ ╚═════╝ ╚═════╝ ╚═╝                  ██
  ██                                                      ██
  ██    FRAMEWORK 2.0  ◆  v2.4.0  ◆  EDGE-OF-CHAOS         ██
  ██                                                      ██
  ██████████████████████████████████████████████████████████

```

### Recursive triad orchestration · Deterministic · Cryptographically-linked provenance
### Built on **Next.js 15.5 + TypeScript** · Telemetry-hardened · Hardware-acceleration-ready

</div>

---

## ◆ What is MCOP?

**MCOP Framework 2.0** is a **recursive meta-cognitive optimization protocol** for AI agents: a
**deterministic 4.4 ms reasoning pipeline** (22,700 ops/sec) that pairs a **NOVA-NEO
SHA-256 encoder**, **Stigmergy v5 pheromone memory with Merkle-chained provenance**, and a
**Holographic Etch** append-only ledger with **eudaimonic scoring**. The current v2.4 surface adds
a **150-node Proteome substrate** for chaotic + game-theoretic abstraction discovery, a
**Drift Sentinel Kernel** for Δ(T_d, B_e) divergence telemetry, and a **Guardian-signed telemetry
hardening layer** that commits JCS-canonical policy, matrix-evolution, and L1 reset blocks through
dependency-injected substrate bridges. The adapter mesh now includes async OpenAI-compatible
embeddings, an OpenAI-compatible chat client, Anthropic Claude, DeepSeek, Kimi, Qwen, xAI/Grok
text + image generation (with a **bidirectional Grok-MCOP organelle host** mode that lets capable
Grok models execute the triad in-model and merge their traces back into the host ledger),
Magnific, Utopai, and generic REST/MCP/HTTP production adapters. Ledger-aware Holographic Etch
factories ship with **in-memory + file storage backends**, **async + Redis ledger forwarders**
(retry, DLQ, and `unref()`-clean shutdown), and **snapshot ↔ ledger reconciliation** utilities.
Cryptographic lineage at every step. **96.6 % test coverage.**
**Source-available under BUSL-1.1 with scheduled MIT conversion on 2030-04-26.**

> **Why this matters:** unlike retrieval-augmented or chain-of-thought wrappers,
> MCOP makes **every reasoning step replayable**, **byte-identically reproducible** across
> Node, browser, and edge runtimes, and **auditable through a Merkle-chained provenance trail**.
> Memory, ledger, and adapter calls all etch a positive-resonance score, so the framework
> rewards **flourishing trajectories** (high alignment + high utility) instead of optimizing
> for raw throughput alone.

## ◆ Current Production Surface

| Layer | Shipped surface |
|:---|:---|
| Deterministic core | `@kullailabs/mcop-core` exports NOVA-NEO, Stigmergy v5, Holographic Etch, positive-resonance scoring, canonical encoding, tensor guards, and async embedding backends. |
| Telemetry hardening | [`src/telemetry/`](./src/telemetry/) commits Guardian-signed reset blocks, hazard policy blocks, Peircean matrix evolution, burn-in traces, and defensive substrate adapter writes. |
| Orchestration hook | [`src/orchestrator/MCOPOrchestrator.ts`](./src/orchestrator/MCOPOrchestrator.ts) keeps hardening optional via dependency injection and exposes `commitPipelineStageExecution()`. |
| Provider mesh | [`src/adapters/`](./src/adapters/) routes OpenAI-compatible, Claude, DeepSeek, Kimi, Qwen, Grok/xAI, image, regulated-provenance, and generic production calls without hardcoding secrets. |
| Organelle host & ledger I/O | [`src/adapters/grokAdapter.ts`](./src/adapters/grokAdapter.ts) exposes `organelleMode` for bidirectional in-model triad execution; [`src/ledger/`](./src/ledger/) ships ledger-aware Holographic Etch factories with background + Redis async forwarders (retry, DLQ, clean shutdown); [`src/core/etchBackend.ts`](./src/core/etchBackend.ts) and [`src/core/stigmergyBackend.ts`](./src/core/stigmergyBackend.ts) provide in-memory + file storage backends; [`src/utils/organelleMerge.ts`](./src/utils/organelleMerge.ts) and [`src/utils/ledgerReconciliation.ts`](./src/utils/ledgerReconciliation.ts) cover trace reconstruction, merge, and snapshot ↔ ledger reconciliation. |
| Distributed runtime | [`src/cluster/redisStreamsGossipTransport.ts`](./src/cluster/redisStreamsGossipTransport.ts) adds Redis Streams gossip transport alongside the in-memory bus. |
| Security posture | CodeQL, Dependabot, Trojan-Source guard, SBOM generation, workflow hygiene verification, and pinned CI runtimes are merge-blocking surfaces. |

<div align="center">

[![▶ Cinematic Showcase](https://img.shields.io/badge/▶_CINEMATIC_SHOWCASE-Three.js_/showcase-0d1117?style=for-the-badge&labelColor=e8c98a&color=0d1117)](./public/showcase/index.html)
[![Live Demo](https://img.shields.io/badge/LIVE_DEMO-mcop--framework.vercel.app-0d1117?style=for-the-badge&labelColor=00f0ff&color=0d1117)](https://kuonirad.github.io/MCOP-Framework-2.0)
[![npm](https://img.shields.io/badge/npm-@kullailabs/mcop--core-0d1117?style=for-the-badge&labelColor=cb3837&color=0d1117&logo=npm)](https://www.npmjs.com/package/@kullailabs/mcop-core)

<a href="./public/showcase/index.html" title="Open the cinematic Three.js showcase">
  <img src="./public/mcop-hero-banner.svg" alt="MCOP Framework 2.0 — cinematic hero banner linking to the Three.js showcase at /showcase" width="880" />
</a>

<sub><em>The Three.js cinematic showcase — obsidian matcap crystals, live SHA-256 ticker, resonance meter,
adapter orbit, and a Tweaks panel for atmosphere · form · tempo. Best viewed at
<a href="./public/showcase/index.html"><code>/showcase/index.html</code></a> on a desktop browser.</em></sub>

</div>

---

<div align="center">

## ◆ QUICK NAVIGATION ◆

[![📚 Documentation](https://img.shields.io/badge/📚_DOCUMENTATION-0d1117?style=for-the-badge&labelColor=00f0ff&color=0d1117)](./docs/api/README.md)
[![⚡ Quick Start](https://img.shields.io/badge/⚡_QUICK_START-0d1117?style=for-the-badge&labelColor=7b2dff&color=0d1117)](#quick-start)
[![🏗️ Architecture](https://img.shields.io/badge/🏗️_ARCHITECTURE-0d1117?style=for-the-badge&labelColor=ff006e&color=0d1117)](#architecture)
[![🔌 Adapters](https://img.shields.io/badge/🔌_ADAPTERS-0d1117?style=for-the-badge&labelColor=ffd700&color=0d1117)](./docs/adapters/UNIVERSAL_ADAPTER_PROTOCOL.md)
[![📖 Wiki](https://img.shields.io/badge/📖_WIKI-0d1117?style=for-the-badge&labelColor=00ff88&color=0d1117)](https://github.com/Kuonirad/MCOP-Framework-2.0/wiki)
[![🎬 Showcase](https://img.shields.io/badge/🎬_CINEMATIC_SHOWCASE-0d1117?style=for-the-badge&labelColor=e8c98a&color=0d1117)](./public/showcase/index.html)

</div>

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
| Universal Adapter Protocol (OpenAI-compatible · Claude · DeepSeek · Kimi · Qwen · Grok/xAI · production REST/MCP) | ✅ | ✅ | ⚠️ partial | ⚠️ partial |
| Native xAI Grok adapter (text + image generation) | ✅ | ⚠️ community | ❌ | ❌ |
| Test coverage on documented API surface | **96.6 %** | varies | varies | varies |
| Reference benchmark (full pipeline) | **4.4 ms / 22,700 ops/sec** ([source](./src/benchmarks/promptingModes.ts)) | n/a | n/a | n/a |
| License posture | **BUSL-1.1 → MIT 2030-04-26** | MIT | CC-BY-4.0 / MIT | MIT |
| CodeQL + SBOM (CycloneDX) + Trojan-Source guard in CI | ✅ | ⚠️ partial | ⚠️ partial | ⚠️ partial |
| Trusted publishing (OIDC, secretless) to npm + PyPI | ✅ | ❌ | ❌ | ❌ |

> Numbers are **regression baselines** generated by [`src/benchmarks/promptingModes.ts`](./src/benchmarks/promptingModes.ts)
> (re-run with `pnpm benchmark:refresh`, baseline at [`docs/benchmarks/results.json`](./docs/benchmarks/results.json)).
> They are budgeting targets for the deterministic core — **not** a head-to-head LLM-quality claim.

---

## 🌱 Positive Identity Resonance

MCOP-Framework-2.0 now treats repository identity as a contributor welcome
surface: every canonical URL, badge, clone instruction, package pointer, and
provenance note converges on `MCOP-Framework-2.0`. This is Positive Building of
unbreakable link resonance — less friction for new contributors, clearer trust
for adopters, and a more joyful path from first clone to first meaningful
contribution.

- **Canonical home:** `https://github.com/Kuonirad/MCOP-Framework-2.0`
- **Canonical local path:** `MCOP-Framework-2.0`
- **Positive audit command:** `pnpm positive:audit`
- **Positive impact report:** [`docs/POSITIVE_IMPACT_REPORT.md`](./docs/POSITIVE_IMPACT_REPORT.md)

---

## 🧠 System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    MCOP PROCESSING PIPELINE                     │
│                                                                 │
│   INPUT  ──►  NOVA-NEO  ──►  STIGMERGY  ──►  HOLO-ETCH  ──►    │
│                  ▲                                  ▼           │
│                  │                            PROVENANCE        │
│            (v2.4) PROTEOME  ◀── graphAggregate ──┘              │
│                                                                 │
│   ◆ Entropy-Normalized   ◆ Merkle-Chained   ◆ Rank-1 Tensor    │
│   ◆ Cosine Recall        ◆ SHA-256 Signed   ◆ UUID-v4 Traced   │
│   ◆ Edge-of-Chaos        ◆ Game-Theoretic Equilibria (v2.4)    │
└─────────────────────────────────────────────────────────────────┘
```

<div align="center">

| Kernel | Class | Role | Key Property |
|:---:|:---:|:---:|:---:|
| 💙 **NOVA-NEO Encoder** | `NovaNeoEncoder` | Context → Tensor | Deterministic · Entropy-normalized |
| 🟣 **Stigmergy v5** | `StigmergyV5` | Pheromone memory | Cosine recall · Merkle-chained |
| 🔴 **Holographic Etch** | `HolographicEtch` | Confidence ledger | Append-only · Rank-1 · Replayable |
| 🧬 **Proteome (v2.4)** | `ProteomeOrchestrator` | 150-node sparse substrate | Replicator dynamics · Edge-of-chaos · CUDA-routed |
| 🛰️ **Drift Sentinel** | `DriftSentinelKernel` | Δ(T_d, B_e) sensor for indirect-injection drift | Welford-online σ-threshold · Stigmergic signals · Merkle-linked rewind |
| 🟡 **Provenance** | `ProvenanceMetadata` | Cryptographic lineage | SHA-256 · ISO8601 · UUID-v4 |

</div>

---

## ⚡ Get Started in 90 Seconds

<a id="quick-start"></a>

```bash
# 1. Clone the recursive triad (≈20 s)
git clone https://github.com/Kuonirad/MCOP-Framework-2.0.git
cd MCOP-Framework-2.0

# 2. Activate the pinned toolchain (Node 22.22.3 + pnpm 9.15.0) (≈10 s)
nvm use
corepack enable
corepack prepare pnpm@9.15.0 --activate

# 3. Install workspace dependencies (≈30 s on a warm cache)
pnpm install

# 4. Run the deterministic Jest suite — 96.6 % covered (≈20 s)
pnpm test

# 5. Generate the Positive Impact Report + Merkle-anchored audit badge (≈5 s)
pnpm positive:audit

# 6. Launch the production server (Next.js 15.5 SSR, port 3000)
pnpm build && pnpm start

# 7. Optional — open the Three.js cinematic showcase locally
#    (served as a static asset under /showcase/index.html)
open http://localhost:3000/showcase/index.html
```

> Prefer a **zero-clone** start? The framework is also published on npm as
> [`@kullailabs/mcop-core`](https://www.npmjs.com/package/@kullailabs/mcop-core) — install
> with `pnpm add @kullailabs/mcop-core` (or `npm i @kullailabs/mcop-core`).

```typescript
import {
  HolographicEtch,
  NovaNeoEncoder,
  StigmergyV5,
} from '@kullailabs/mcop-core';

const encoder = new NovaNeoEncoder({ dimensions: 64, normalize: true });
const memory = new StigmergyV5({ resonanceThreshold: 0.55 });
const ledger = new HolographicEtch({
  confidenceFloor: 0,
  growthLedger: true,
});

const context = encoder.encode('stabilize recursive planning with audited provenance');
const synthesis = encoder.encode('stabilize recursive planning with audited provenance');

const trace = memory.recordTrace(context, synthesis, { stage: 'quick-start' });
const etch = ledger.applyEtch(context, synthesis, 'quick-start');

console.log({
  traceHash: trace.hash,
  merkleRoot: memory.getMerkleRoot(),
  etchHash: etch.hash,
  confidence: etch.deltaWeight,
});
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
| Proteome layer and ARC LS20 scaffold | [`docs/PROTEOME_LAYER.md`](./docs/PROTEOME_LAYER.md) |
| Drift Sentinel Kernel | [`docs/features/drift-sentinel-kernel.md`](./docs/features/drift-sentinel-kernel.md) |
| Bidirectional Grok-MCOP organelle host | [`docs/adapters/GROK_AS_MCOP_ORGANELLE_HOST.md`](./docs/adapters/GROK_AS_MCOP_ORGANELLE_HOST.md) |
| Decentralized agent coordination | [`docs/DECENTRALIZED_AGENT_COORDINATION.md`](./docs/DECENTRALIZED_AGENT_COORDINATION.md) |
| Redis Streams cluster transport | [`docs/DISTRIBUTED_CLUSTER_MODE.md`](./docs/DISTRIBUTED_CLUSTER_MODE.md) |
| Telemetry hardening source | [`src/telemetry/`](./src/telemetry/) |
| Architecture overview | [`ARCHITECTURE.md`](./ARCHITECTURE.md) |
| Supply-chain controls | [`docs/SUPPLY_CHAIN_TRUST.md`](./docs/SUPPLY_CHAIN_TRUST.md) |
| Universal Adapter Protocol | [`docs/adapters/UNIVERSAL_ADAPTER_PROTOCOL.md`](./docs/adapters/UNIVERSAL_ADAPTER_PROTOCOL.md) |
| Contributor workflow | [`CONTRIBUTING.md`](./CONTRIBUTING.md) |

## 🏷️ Badge Legend

| Badge | Meaning | Source |
|:---|:---|:---|
| Build and Test | Merge-blocking lint, typecheck, test, build, security, and package checks. | [`.github/workflows/ci.yml`](./.github/workflows/ci.yml) |
| CodeQL | Static analysis for JavaScript/TypeScript and security query suites. | [`.github/workflows/codeql.yml`](./.github/workflows/codeql.yml) |
| Coverage | Jest coverage snapshot for the documented API surface; refreshed by `pnpm coverage:badge`. | [`docs/badges/coverage.svg`](./docs/badges/coverage.svg) · [`scripts/coverage-badge.mjs`](./scripts/coverage-badge.mjs) |
| Release | Latest GitHub release tag. | [Releases](https://github.com/Kuonirad/MCOP-Framework-2.0/releases) |
| License | BUSL-1.1 license with scheduled MIT conversion noted in `LICENSE`. | [`LICENSE`](./LICENSE) |
| Maintained | Governance and maintainer process are documented. | [`GOVERNANCE.md`](./GOVERNANCE.md) |
| Positive Impact | Eudaimonic / positive-resonance audit score; refreshed by `pnpm positive:audit`. | [`docs/badges/positive-impact.svg`](./docs/badges/positive-impact.svg) · [`docs/POSITIVE_IMPACT_REPORT.md`](./docs/POSITIVE_IMPACT_REPORT.md) |

---

## 📊 Performance Metrics

<div align="center">

[![Response Time](https://img.shields.io/badge/Response_Time-<50ms-00f0ff?style=for-the-badge&logo=lightning)](./docs/api/README.md)
[![Throughput](https://img.shields.io/badge/Throughput-10K_req%2Fs-7b2dff?style=for-the-badge&logo=speedtest)](./docs/api/README.md)
[![Uptime](https://img.shields.io/badge/Uptime-99.99%25-00ff88?style=for-the-badge&logo=statuspage)](./docs/api/README.md)
[![Memory](https://img.shields.io/badge/Memory-<128MB-ffd700?style=for-the-badge&logo=databricks)](./docs/api/README.md)

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

These are deterministic benchmark baselines generated by `src/benchmarks/promptingModes.ts` for regression budgeting, not vendor hardware claims. Re-run with `pnpm benchmark:refresh` and compare `docs/benchmarks/results.json` before publishing new public numbers.

### ◆ Reproducibility — `Reproducible 22,700 ops/sec · verified 2026-05-10`

The headline budget above is **byte-identity-reproducible** by any third party in 90 seconds via the
[`examples/reproducible-benchmark/`](./examples/reproducible-benchmark/README.md) Docker bundle. The bundle:

1. Pins **Node 22.22.3 + pnpm 9.15.0 + Python 3.12** to match the org blueprint.
2. Re-runs `pnpm benchmark:refresh` (`BENCHMARK_GENERATE=1 jest --testPathPatterns=src/__tests__/benchmarks.test.ts`) inside a clean container.
3. Asserts the regenerated `docs/benchmarks/results.json` is **byte-for-byte identical** to the committed snapshot — any drift exits the verifier non-zero.
4. Computes a **SHA-256 over the regenerated artefact** and emits a [`manifest.json`](./examples/reproducible-benchmark/README.md#what-this-bundle-proves) carrying verdict, both SHAs, and the headline-budget numbers.
5. Re-asserts every invariant from inside Python via [`reproduce-22700-ops.ipynb`](./examples/reproducible-benchmark/notebooks/reproduce-22700-ops.ipynb), so a reader who only trusts the Python tooling can still self-certify.

One-liner from the repo root:

```bash
docker build -t mcop-reproducible-benchmark -f examples/reproducible-benchmark/Dockerfile . \
  && docker run --rm -v "$PWD/examples/reproducible-benchmark/out:/out" mcop-reproducible-benchmark
```

The v2.4 preprint scaffold backing this badge lives at
[`docs/benchmarks/preprint/`](./docs/benchmarks/preprint/README.md) — arXiv `cs.SE` + Hugging Face mirror + Zenodo DOI, all
verification provenance derived from the bundle's `manifest.json`.

See [POSITIVE_EVOLUTION.md](./POSITIVE_EVOLUTION.md) for the v2.3 Eudaimonic Bloom audit response: negative-limit safety, NovaNeoWeb universal encoding, SelfHealingDimension, ResonantRecentQuery, and EudaimonicEtch.

---

## 🔌 Universal Adapter Protocol

<div align="center">

| Adapter | Status | Protocol | Auth |
|:---:|:---:|:---:|:---:|
| 🤖 **OpenAI-compatible chat + embeddings** | ![Active](https://img.shields.io/badge/ACTIVE-00ff88?style=flat-square) | REST/SSE | Bearer |
| 🧬 **Anthropic Claude** | ![Active](https://img.shields.io/badge/ACTIVE-00ff88?style=flat-square) | REST | x-api-key |
| 🌊 **DeepSeek** | ![Active](https://img.shields.io/badge/ACTIVE-00ff88?style=flat-square) | REST | Bearer |
| 🌙 **Kimi** | ![Active](https://img.shields.io/badge/ACTIVE-00ff88?style=flat-square) | REST | Bearer |
| ⚡ **Qwen** | ![Active](https://img.shields.io/badge/ACTIVE-00ff88?style=flat-square) | REST | Bearer |
| ✦ **xAI Grok text + image** | ![Active](https://img.shields.io/badge/ACTIVE-00ff88?style=flat-square) | REST | Bearer |
| 🎛️ **Magnific / Utopai / Generic Production** | ![Active](https://img.shields.io/badge/ACTIVE-00ff88?style=flat-square) | REST/MCP/HTTP | Provider-specific |

</div>

---

## 🔗 Ecosystem Integrations

> **Phase 4 of v2.4 — shipped.** MCOP plugs into LangChain, LlamaIndex, and Haystack as a Merkle-rooted memory layer, and exposes itself as a stdio MCP server for Claude Desktop / Cursor / Continue. Every shim lands in the host pipeline **without** a runtime dependency on the upstream library, so the same shim file is the basis for an upstream PR.

| Target | TS shim | Python shim | Status |
|---|---|---|:---:|
| **LangChain** ([guide](docs/integrations/langchain.md)) | [`src/integrations/langchain.ts`](src/integrations/langchain.ts) | [`mcop_package/mcop/integrations/langchain.py`](mcop_package/mcop/integrations/langchain.py) | ![Shipped](https://img.shields.io/badge/SHIPPED-00ff88?style=flat-square) |
| **LlamaIndex** ([guide](docs/integrations/llamaindex.md)) | [`src/integrations/llamaIndex.ts`](src/integrations/llamaIndex.ts) | [`mcop_package/mcop/integrations/llamaindex.py`](mcop_package/mcop/integrations/llamaindex.py) | ![Shipped](https://img.shields.io/badge/SHIPPED-00ff88?style=flat-square) |
| **Haystack** ([guide](docs/integrations/haystack.md)) | [`src/integrations/haystack.ts`](src/integrations/haystack.ts) | [`mcop_package/mcop/integrations/haystack.py`](mcop_package/mcop/integrations/haystack.py) | ![Shipped](https://img.shields.io/badge/SHIPPED-00ff88?style=flat-square) |
| **MCP Memory Server** ([guide](docs/integrations/mcp-memory-server.md)) | [`examples/mcop_memory_mcp_server/`](examples/mcop_memory_mcp_server/) | — | ![Shipped](https://img.shields.io/badge/SHIPPED-00ff88?style=flat-square) |

The full upstream submission plan lives in [`docs/integrations/UPSTREAM_SUBMISSION_PLAN.md`](docs/integrations/UPSTREAM_SUBMISSION_PLAN.md).

```ts
// LangChain — drop-in BaseChatMessageHistory backed by MCOP triad
import { createMCOPLangChainMemory } from '@kullailabs/mcop-core/integrations/langchain';

const memory = createMCOPLangChainMemory({ sessionId: 'agent-007' });
await memory.addMessages([{ type: 'human', content: 'who is paul atreides' }]);
console.log((await memory.getMessages())[0].provenance?.merkleRoot);
//=> "f3c1e7…"  ← byte-identical with the Python shim
```

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
    └── Rank-1 tensor stored | ISO8601: 2025-01-15T10:30:00Z
    └── Append-only ledger: SEALED ✓

  Step 5: PROVENANCE METADATA
    └── Final hash: SHA-256 verified
    └── License: Business Source License 1.1 | BUSL-1.1
    └── See also: LICENSE-MIT-LEGACY | NOTICE.md
  ════════════════════════════════════════════════════════════
```

---

## 📦 Tech Stack

<div align="center">

[![Next.js](https://img.shields.io/badge/Next.js-16-black?style=for-the-badge&logo=next.js)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178c6?style=for-the-badge&logo=typescript)](https://typescriptlang.org)
[![Node.js](https://img.shields.io/badge/Node.js-22.22.3-339933?style=for-the-badge&logo=node.js)](https://nodejs.org)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ed?style=for-the-badge&logo=docker)](./Dockerfile)
[![Jest](https://img.shields.io/badge/Jest-96.6%25-c21325?style=for-the-badge&logo=jest)](./jest.config.js)
[![ESLint](https://img.shields.io/badge/ESLint-Strict-4b32c3?style=for-the-badge&logo=eslint)](./eslint.config.mjs)

</div>

---

## 📁 Repository Structure

```
MCOP-Framework-2.0/
├── 🧠 src/
│   ├── core/                      # NOVA-NEO, Stigmergy, Etch, Drift Sentinel, embeddings, storage backends
│   ├── adapters/                  # Provider mesh + Universal Adapter Protocol + organelle host
│   ├── telemetry/                 # Guardian-signed hardening and reset-block commits
│   ├── orchestrator/              # Dependency-injected orchestration hooks
│   ├── ledger/                    # Ledger-aware Etch factories + async/Redis forwarders (retry, DLQ)
│   ├── utils/                     # organelleMerge + snapshot ↔ ledger reconciliation
│   ├── cluster/                   # In-memory + Redis Streams gossip transports
│   ├── proteome/                  # Proteome substrate and ARC LS20 scaffolding
│   └── hardware/                  # CUDA/ONNX/HTTP accelerator surfaces
├── 📦 packages/
│   └── core/                      # Published @kullailabs/mcop-core package
├── 🐍 mcop_package/               # Python package, adapters, CLI, and parity shims
├── 🧾 services/
│   └── ledger/                    # Hosted provenance ledger service + Helm values schema
├── 📚 docs/
│   ├── api/                       # Full API reference
│   ├── adapters/                  # Adapter protocol specs
│   └── features/                  # Drift Sentinel and feature deep dives
├── 🧪 src/__tests__/              # Jest coverage suite
├── 🔧 scripts/                    # Benchmarks, guards, SBOM, telemetry registry
├── 🐳 Dockerfile                  # Production container
├── 📋 GOVERNANCE.md               # Project governance
├── 🔒 SECURITY.md                 # Security policy
└── ⚖️  LICENSE                    # Business Source License 1.1
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
| 🟢 Proteome Layer + LS20 ARC scaffold | ![Done](https://img.shields.io/badge/COMPLETE-00ff88?style=flat-square) | v2.4 |
| 🟢 Drift Sentinel + Guardian telemetry hardening | ![Done](https://img.shields.io/badge/COMPLETE-00ff88?style=flat-square) | v2.4 |
| 🟢 Redis Streams gossip transport | ![Done](https://img.shields.io/badge/COMPLETE-00ff88?style=flat-square) | v2.4 |
| 🟢 Bidirectional Grok-MCOP organelle host (`organelleMode` + ledger forwarders + reconciliation) | ![Done](https://img.shields.io/badge/COMPLETE-00ff88?style=flat-square) | v2.4 |
| 🟡 CUDA Productionization | ![Roadmap](https://img.shields.io/badge/ROADMAP-ffd700?style=flat-square) | v2.4+ |
| 🟡 LS20 ARC real-task ingestion | ![Roadmap](https://img.shields.io/badge/ROADMAP-ffd700?style=flat-square) | v2.5 |
| 🔵 Hosted Provenance Ledger | ![Planned](https://img.shields.io/badge/PLANNED-7b2dff?style=flat-square) | v3.x |
| 🔵 WebAssembly Runtime | ![Planned](https://img.shields.io/badge/PLANNED-7b2dff?style=flat-square) | v3.1 |

</div>

## 🚀 v2.3 Hardware Acceleration (CUDA Layer)

The v2.3 release scaffolds the optional **CUDA Hardware Layer** around two provider surfaces: the in-process ONNX layer and the HTTP accelerator bridge. The triad still byte-identically reproduces on CPU; CUDA remains provenance-attested and disabled or probe-driven unless explicitly enabled. Kernel model artifacts, the deterministic export script, the Python CUDA server, GPU CI, and full hot-path unification are productionization work tracked in [`docs/CUDA_PRODUCTION.md`](./docs/CUDA_PRODUCTION.md).

### Shipped surfaces

| Surface | File | Role |
|:---|:---|:---|
| In-process ONNX layer | [`src/hardware/CUDAHardwareLayer.ts`](src/hardware/CUDAHardwareLayer.ts) | Phi5 `enableCUDA: 'auto'` probe, verified-device gate, `substrateLineage`, and `resolvedFrom` provenance |
| HTTP bridge client | [`src/hardware/Accelerator.ts`](src/hardware/Accelerator.ts), [`src/hardware/CUDAAccelerator.ts`](src/hardware/CUDAAccelerator.ts) | `CUDAProvider` client contract with CPU fallback |
| Config surface | [`src/config/mcop.config.ts`](src/config/mcop.config.ts) | `hardware.useCUDA`, `hardware.provider`, `hardware.enableCUDA`, and `hardware.kernelDir` defaults |
| Benchmarks | [`scripts/benchmark-cuda-graph.mjs`](scripts/benchmark-cuda-graph.mjs) | CPU-stable smoke and full-mode harness across all six logical ops |
| Verified-device soak | [`scripts/cuda-verified-device-soak.mjs`](scripts/cuda-verified-device-soak.mjs) | Structural soak plus GhostGPU canary |

### Productionization gaps

| Gap | Required artifact |
|:---|:---|
| Kernel supply chain | `models/mcop_*.onnx` plus a Merkle-rooted model manifest |
| Export pipeline | `scripts/export_cuda_kernels.py` or `scripts/export_cuda_kernels/` |
| Python sidecar | `mcop_cuda_server` implementing `GET /health`, `GET /capabilities`, and `POST /cuda/{op}` |
| GPU CI | Optional GPU runner jobs for full benchmarks and verified-device soak |
| Hot-path unification | Encode, recall, etch, evolve, and homeostasis calls routed through one provenance-attached accelerator boundary |

### Regression coverage

| Suite | Covers |
|:---|:---|
| `src/__tests__/cudaHardwareLayer.test.ts` | Layer defaults, disabled path, verified-device provenance, stream lineage, GhostGPU parsing |
| `src/__tests__/cudaPhi5AdaptiveProbe.test.ts` | `enableCUDA: 'auto'`, explicit overrides, `resolvedFrom`, and substrate-conditional lineage |
| `src/__tests__/cudaVerifiedDeviceSoak.test.ts` | 1,000-step structural soak and adversarial CPU canary |
| `src/__tests__/cudaBenchmarkHarness.test.ts` | Deterministic benchmark records for the six logical ops |

---

## 🧬 v2.4 Proteome Layer + LS20 ARC scaffold

The v2.4 release lands the **Proteome substrate** — a 150-node sparse interaction
graph that sits between NOVA-EVOLVE and the MCOP triad. Each step is a CSR
mean-aggregation routed through the existing
[`CUDAHardwareLayer.graphAggregate`](./docs/CUDA_PHI1_PHI5.md#kernel-name-mapping)
kernel, followed by a replicator-dynamics payoff step, homeostatic pull-back,
and Gaussian state mutation. Two knobs — `homeostasis` and
`mutationTemperature` — expose the **edge-of-chaos** control surface to
MetaTuner, which now drives the proteome's regime in lock-step with the
NOVA-EVOLVE genome. Full design rationale lives in
[`docs/PROTEOME_LAYER.md`](./docs/PROTEOME_LAYER.md).

### Shipped surfaces

| Surface | File | Role |
|:---|:---|:---|
| Proteome orchestrator | [`src/proteome/ProteomeOrchestrator.ts`](src/proteome/ProteomeOrchestrator.ts) | 150-node sparse graph, replicator dynamics, edge-of-chaos knobs, CUDA-routed graphAggregate |
| Proteome types + payoff matrix | [`src/proteome/types.ts`](src/proteome/types.ts) | `ProteomeNode`, `ProteomeEdge`, asymmetric `PROTEOME_PAYOFF_MATRIX` |
| MetaTuner integration | [`src/core/novaEvolveTuner.ts`](src/core/novaEvolveTuner.ts) | `NovaEvolveConfig.homeostasis` knob + `NovaEvolveTunerDeps.proteome` lock-step propagation |
| LS20 ARC harness | [`scripts/benchmark-arc-ls20.mjs`](scripts/benchmark-arc-ls20.mjs) | Pure-ESM 20-task hard-subset scaffold, schema `mcop-arc-ls20/1.0`, byte-stable Merkle root |
| CUDA-substrate smoke CI | [`.github/workflows/cuda-smoke.yml`](.github/workflows/cuda-smoke.yml) | `MCOP_ENABLE_CUDA=auto` × `MCOP_ENABLE_CUDA=0` matrix on `ubuntu-latest` |

### v2.4 LS20 ARC reception ladder (R1–R7)

| Rung | Status | Description |
|:---|:---:|:---|
| R1 — Sparse-graph primitives | ✅ | 150 nodes, ≈ 1 k edges, deterministic from seed `0xC0FFEE` |
| R2 — Replicator dynamics | ✅ | 4-kind × 3-edge asymmetric payoff matrix |
| R3 — Edge-of-chaos knobs | ✅ | `(homeostasis, mutationTemperature)` in `NovaEvolveConfig` |
| R4 — CUDA `graphAggregate` wiring | ✅ | Per-dim dispatch, verifiedDevice + `resolvedFrom` inheritance |
| R5 — LS20 ARC benchmark scaffold | ✅ | Byte-stable Merkle root, pre/post solve-rate lift |
| R6 — Real ARC task ingestion | 🟡 | Follow-up: ARC-AGI-3 hard subset, state-space → rule decoder |
| R7 — Phase-transition emergence | 🟡 | Target: consistent post-proteome solve-rate ≥ 0.5 |

### Regression coverage

| Suite | Covers |
|:---|:---|
| `src/__tests__/proteomeOrchestrator.test.ts` | Construction determinism, knob clamping, byte-stable Merkle replay, edge-of-chaos variance, homeostasis convergence, CUDA integration via mock session, MetaTuner ↔ proteome propagation (15 tests) |
| `src/__tests__/arcLs20Harness.test.ts` | `mcop-arc-ls20/1.0` schema conformance, knob flow-through, byte-identical child-process replay, lift non-negativity (5 tests) |

### Try it locally

```bash
# Run the LS20 ARC scaffold in smoke mode (no GPU required)
pnpm benchmark:arc-ls20:smoke

# Inspect the byte-stable baseline
cat docs/benchmarks/arc_ls20.json | jq '.summary'
```

---

## 🛰️ Drift Sentinel Kernel

The **Drift Sentinel Kernel** ([`src/core/driftSentinelKernel.ts`](src/core/driftSentinelKernel.ts))
is a first-class MCOP module that continuously computes

```
Δ(T_d, B_e) = cosineDistance(T_d, mean(B_e))   ∈ [0, 1]
```

between the **declared-task tensor** `T_d` (what the caller said they were
doing — e.g. system + user prompt embedding) and the **ensemble-behavior tensor**
`B_e` (the per-model synthesis vectors from the Council, reduced to their mean).
Full design lives in [`docs/features/drift-sentinel-kernel.md`](docs/features/drift-sentinel-kernel.md).

### What it produces

| Surface | Method | Role |
|:---|:---|:---|
| Tunable sensitivity | `observe()` | `baseSensitivity` floor + dynamic `μ + sigmaMultiplier·σ` threshold (Welford-online) |
| Stigmergic signals | `consumeStigmergicEvents()` | Drains elevated+ events for StigmergyV5 / HolographicEtch continuous-learning feedback |
| Divergence Telemetry | `getTelemetry()` | Observed / flagged / critical counts, rolling (μ, σ), Δ histogram, chain head — dashboard-ready |
| Escalation | `event.escalation` | `nominal · watch · elevated · critical` → `none · lightweight-review · human-review` |
| Merkle-linked rewind | `rewindFlagged()`, `verifyChain()` | RFC 8785 canonical digest + `parentHash` chain back to the exact reasoning step |

### Honest scope

This is auditable detection for the **indirect-injection class** that produces
visible task-behavior drift (poisoned retrieval, tool output, RAG corpora).
It is **not** a general-purpose injection firewall. Out of scope: direct
input-layer injection where `T_d` itself is poisoned, correlated universal
jailbreaks where `B_e` drifts coherently with `T_d`, and mimicry attacks that
keep Δ below threshold.

### Minimal usage

```ts
import { DriftSentinelKernel } from '@kuonirad/mcop-framework';

const sentinel = new DriftSentinelKernel({
  baseSensitivity: 0.15,
  sigmaMultiplier: 2.0,
  criticalCeiling: 0.6,
});

const event = sentinel.observe({
  declaredTask: T_d,
  ensembleBehavior: [B_e_model1, B_e_model2, B_e_model3],
  reasoningStepId: traceId,
});

if (event.escalation.kind === 'human-review') {
  // route to human queue
}

for (const sig of sentinel.consumeStigmergicEvents()) {
  // feed into StigmergyV5 / HolographicEtch continuous-learning loop
}

const telemetry = sentinel.getTelemetry(); // dashboard / risk-index payload
```

### Regression coverage

| Suite | Covers |
|:---|:---|
| `src/__tests__/driftSentinelKernel.test.ts` | Nominal alignment, critical escalation, Merkle linkage + `verifyChain()`, stigmergic signal drain, rewind-to-step, telemetry snapshot, zero-magnitude safety, input validation (8 tests) |

---

## 🧬 Bidirectional Grok-MCOP Organelle Host

The Grok adapter ([`src/adapters/grokAdapter.ts`](./src/adapters/grokAdapter.ts))
now ships a **bidirectional `organelleMode`** that turns capable Grok models
(starting with the `grok-4.3` family) into a remote execution substrate for the
MCOP triad — instead of a one-way refined-prompt completion engine. Full design
rationale lives in
[`docs/adapters/GROK_AS_MCOP_ORGANELLE_HOST.md`](./docs/adapters/GROK_AS_MCOP_ORGANELLE_HOST.md);
the runnable companion is
[`examples/grok_mcop_organelle_experiment.ts`](./examples/grok_mcop_organelle_experiment.ts).

### What "organelle host" means

When `organelleMode` is enabled, the adapter:

1. Ships a compact `LowMemoryMCOPMode` profile + recent traces to the model.
2. Instructs the model (system prompt + structured-output contract) to continue
   MCOP operations — encode, recall, dialectical synthesis, etch deltas,
   Guardian-style checks — **inside its own reasoning**.
3. Parses structured `OrganelleArtifacts` back from the response.
4. Merges model-produced traces and etch deltas into the host `StigmergyV5` and
   `HolographicEtch`, preserving Merkle provenance across the boundary via
   [`src/utils/organelleMerge.ts`](./src/utils/organelleMerge.ts).

Host-side MCOP invariants (canonical encoding, Merkle chaining, resonance
scoring) remain the source of truth — model-produced artifacts are *proposals*
that the host validates and re-scores before commit.

### Ledger I/O and reconciliation

| Surface | File | Role |
|:---|:---|:---|
| Ledger-aware Etch factory | [`src/ledger/createLedgerAwareHolographicEtch.ts`](./src/ledger/createLedgerAwareHolographicEtch.ts) | Wires `HolographicEtch` against a storage backend + forwarder, hydrates on construct, write-throughs on accepted etches. |
| Async forwarder (Node) | [`src/ledger/asyncLedgerForwarder.ts`](./src/ledger/asyncLedgerForwarder.ts) | `BackgroundLedgerForwarder` with retry, DLQ, and `unref()`-clean shutdown so CLI scripts exit cleanly. |
| Async forwarder (Redis) | [`src/ledger/redisAsyncLedgerForwarder.ts`](./src/ledger/redisAsyncLedgerForwarder.ts) | Redis-backed `RedisAsyncLedgerForwarder` with the same queue / retry / DLQ contract. |
| Storage backends | [`src/core/etchBackend.ts`](./src/core/etchBackend.ts), [`src/core/stigmergyBackend.ts`](./src/core/stigmergyBackend.ts) | In-memory + file backends for Etch and Stigmergy, growth-ledger handling, snapshot create / restore with hash validation, TOCTOU-safe atomic writes. |
| Snapshot ↔ ledger reconciler | [`src/utils/ledgerReconciliation.ts`](./src/utils/ledgerReconciliation.ts) | Detects missing-in / missing-out etches between a snapshot and a ledger, filters organelle-only deltas, exposes `replayMissingEtches` + `reconcileFileEtchBackendWithLedger`. |

### Minimal usage

```ts
import { GrokMCOPAdapter } from '@kullailabs/mcop-core/adapters/grokAdapter';
import { createLedgerClient } from '@kullailabs/mcop-core/ledger';

// `createLedgerAware` wires the adapter against a HolographicEtch that uses
// the best available forwarder — RedisAsyncLedgerForwarder when a `redis`
// client is supplied, BackgroundLedgerForwarder otherwise — and gives both
// retry + DLQ semantics and `unref()`-clean shutdown.
const grok = GrokMCOPAdapter.createLedgerAware({
  ledgerClient: createLedgerClient({ source: 'embedded' }),
  ledgerTenantId: 'my-org',
  // redis,                       // optional: enables Redis-backed forwarder
  // ledgerForwarderConfig: {},   // optional: per-forwarder overrides
});

// `organelleMode: true` is the auto-magic path — when the adapter is
// ledger-aware, the config is enhanced to merge model-produced traces and
// etch deltas back into the host with full Merkle provenance.
const result = await grok.generate({
  payload: {
    prompt: 'plan a deterministic ARC-AGI-3 attempt',
    options: {
      organelleMode: {
        enabled: true,
        profile: 'low-memory',
        mergeTraces: true,
        mergeEtches: true,
        // strictParsing: true,   // optional: fail closed on un-parseable artifacts
      },
    },
  },
});

// Top-level provenance the framework auto-propagates when organelleMode is
// active and the adapter is ledger-aware.
const provenance = result.organelleProvenance;       // modeUsed, merged trace count, new etch hash, …
const artifacts = result.result.organelle?.artifacts; // raw model-produced traces / etch deltas / guardian verdicts
```

### Regression coverage

| Suite | Covers |
|:---|:---|
| [`src/__tests__/organelleMerge.test.ts`](./src/__tests__/organelleMerge.test.ts) | Validation, hint reconstruction (JSON / CSV / base64), trace-to-pheromone conversion, merge orchestration, response wrapper |
| [`src/__tests__/ledgerReconciliation.test.ts`](./src/__tests__/ledgerReconciliation.test.ts) | Snapshot vs ledger reconciliation, missing-in / missing-out detection, organelle-only filtering, replay-missing helper, file-backend reconcile |
| [`src/__tests__/storageBackends.test.ts`](./src/__tests__/storageBackends.test.ts) | In-memory + file backends for both Stigmergy and Etch, growth ledger, snapshot create / restore + hash validation |
| [`src/__tests__/holographicEtchLedger.test.ts`](./src/__tests__/holographicEtchLedger.test.ts) | Ledger forwarding paths, storage hydration on construction, write-through persistence |
| [`src/__tests__/asyncLedgerForwarder.test.ts`](./src/__tests__/asyncLedgerForwarder.test.ts) | Background forwarder success path, retry-to-DLQ flow, DLQ retry |
| [`src/__tests__/redisAsyncLedgerForwarder.test.ts`](./src/__tests__/redisAsyncLedgerForwarder.test.ts) | Redis-backed forwarder with FakeRedis covering queue / retry / DLQ semantics |
| [`src/__tests__/createLedgerAwareHolographicEtch.test.ts`](./src/__tests__/createLedgerAwareHolographicEtch.test.ts) | Factory helpers |
| [`src/__tests__/grokAdapterLedgerAware.test.ts`](./src/__tests__/grokAdapterLedgerAware.test.ts) | `createLedgerAware` factory wiring |
| [`src/__tests__/grokOrganelleProcessing.test.ts`](./src/__tests__/grokOrganelleProcessing.test.ts) | `processOrganelleResult` validation, merge, strict-mode errors, `organelleMode` in `generate()` |

---

## 🤝 Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines · [CONTRIBUTOR_ONBOARDING.md](./CONTRIBUTOR_ONBOARDING.md) for setup · [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md) for standards

---

## ⚖️ License

This project is licensed under the **Business Source License 1.1** (BUSL-1.1).
See [LICENSE](./LICENSE) for full terms · [LICENSE-MIT-LEGACY](./LICENSE-MIT-LEGACY) for prior MIT components · [NOTICE.md](./NOTICE.md) for attributions.

---

<div align="center">

**MCOP Framework 2.0** · Built with 🧠 by [Kuonirad](https://github.com/Kuonirad)

[![Stars](https://img.shields.io/github/stars/Kuonirad/MCOP-Framework-2.0?style=social)](https://github.com/Kuonirad/MCOP-Framework-2.0/stargazers)
[![Forks](https://img.shields.io/github/forks/Kuonirad/MCOP-Framework-2.0?style=social)](https://github.com/Kuonirad/MCOP-Framework-2.0/network/members)
[![Watchers](https://img.shields.io/github/watchers/Kuonirad/MCOP-Framework-2.0?style=social)](https://github.com/Kuonirad/MCOP-Framework-2.0/watchers)

*Recursive triad orchestration · Deterministic · Cryptographically-linked provenance at every step*

</div>
