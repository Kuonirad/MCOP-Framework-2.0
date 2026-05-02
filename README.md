<div align="center">

<img src="https://raw.githubusercontent.com/Kuonirad/MCOP-Framework-2.0/cinematic-homepage-upgrade/public/mcop-hero-banner.svg" width="100%" alt="MCOP Framework 2.0 — Cinematic Hero Banner" />

<br />

[![CI](https://github.com/Kuonirad/MCOP-Framework-2.0/actions/workflows/ci.yml/badge.svg)](https://github.com/Kuonirad/MCOP-Framework-2.0/actions/workflows/ci.yml)
[![CodeQL](https://github.com/Kuonirad/MCOP-Framework-2.0/actions/workflows/codeql.yml/badge.svg)](https://github.com/Kuonirad/MCOP-Framework-2.0/actions/workflows/codeql.yml)
[![Coverage](./docs/badges/coverage.svg)](./docs/api/README.md)
[![API TypeDoc](https://img.shields.io/badge/API-TypeDoc-3178C6?style=flat-square)](./docs/api/README.md)
[![Benchmarks](https://img.shields.io/badge/benchmarks-public-emerald?style=flat-square)](./docs/benchmarks/methodology.md)
[![Release](https://img.shields.io/github/v/release/Kuonirad/MCOP-Framework-2.0?style=flat-square)](https://github.com/Kuonirad/MCOP-Framework-2.0/releases)
[![License: BUSL 1.1](https://img.shields.io/badge/License-BUSL%201.1-amber?style=flat-square)](LICENSE)
[![Maintained](https://img.shields.io/badge/maintained-yes-brightgreen?style=flat-square)](./GOVERNANCE.md)

</div>

---

<div align="center">

## `encode` &rarr; `resonate` &rarr; `etch` &rarr; `provenance`

**Meta-Cognitive Optimization Protocol** &mdash; recursive triad orchestration with deterministic, cryptographically-linked provenance at every step.<br/>
Built on **Next.js 16 + TypeScript**. Production-hardened. Hardware-acceleration-ready. Universal Adapter Protocol v2.1.

<kbd>[**📖 Docs**](./docs/api/README.md)</kbd> &nbsp;·&nbsp;
<kbd>[**🚀 Quick-start**](#quick-start)</kbd> &nbsp;·&nbsp;
<kbd>[**🏗 Architecture**](#architecture)</kbd> &nbsp;·&nbsp;
<kbd>[**🔌 Adapters**](./docs/adapters/UNIVERSAL_ADAPTER_PROTOCOL.md)</kbd> &nbsp;·&nbsp;
<kbd>[**📋 Wiki**](https://github.com/Kuonirad/MCOP-Framework-2.0/wiki)</kbd>

</div>

---

<div align="center">
<img src="https://raw.githubusercontent.com/Kuonirad/MCOP-Framework-2.0/cinematic-homepage-upgrade/public/stats-bar.svg" width="100%" alt="Repository Stats — 96.6% coverage · 47 branches · 428+ commits · v2.2.1" />
</div>

---

## 🔬 System Architecture

<div align="center">
<img src="https://raw.githubusercontent.com/Kuonirad/MCOP-Framework-2.0/cinematic-homepage-upgrade/public/architecture-triad.svg" width="100%" alt="MCOP Core Triad Architecture — NovaNeoEncoder · StigmergyV5 · HolographicEtch · ProvenanceMetadata" />
</div>

| Kernel | Class | Role | Key Property |
|:---|:---|:---|:---|
| **NOVA-NEO Encoder** | `NovaNeoEncoder` | Context &rarr; Tensor | Deterministic &middot; Entropy-normalized |
| **Stigmergy v5** | `StigmergyV5` | Pheromone memory | Cosine recall &middot; Merkle-chained |
| **Holographic Etch** | `HolographicEtch` | Confidence ledger | Append-only &middot; Rank-1 &middot; Replayable |
| **Provenance** | `ProvenanceMetadata` | Cryptographic lineage | sha256 &middot; ISO8601 &middot; UUID |

<div align="center">
<img src="https://raw.githubusercontent.com/Kuonirad/MCOP-Framework-2.0/cinematic-homepage-upgrade/public/section-divider.svg" width="100%" alt="section divider" />
</div>

## ⚡ Quick-start

```bash
git clone https://github.com/Kuonirad/MCOP-Framework-2.0.git
cd MCOP-Framework-2.0
corepack enable          # first-time only
pnpm install --frozen-lockfile
pnpm dev                 # → http://localhost:3000
```

<details>
<summary><strong>TypeScript — Core Triad</strong></summary>

```typescript
import { NovaNeoEncoder, StigmergyV5, HolographicEtch } from '@/core';

const encoder  = new NovaNeoEncoder({ dimensions: 64, normalize: true });
const stigmergy = new StigmergyV5({ resonanceThreshold: 0.4 });
const etch     = new HolographicEtch({ confidenceFloor: 0 });

const context   = encoder.encode('dialectical synthesis');
const trace     = stigmergy.recordTrace(context, context, { note: 'bootstrap' });
const resonance = stigmergy.getResonance(context);
const record    = etch.applyEtch(context, trace.synthesisVector, 'init');
// Every run returns a cryptographically-linked ProvenanceMetadata bundle
```

</details>

<details>
<summary><strong>TypeScript — Magnific Adapter</strong></summary>

```typescript
import { MagnificMCOPAdapter } from '@/adapters';

const adapter = new MagnificMCOPAdapter({
  encoder:         new NovaNeoEncoder({ dimensions: 64, normalize: true }),
  stigmergy:       new StigmergyV5(),
  holographicEtch: new HolographicEtch(),
});

const { result, merkleRoot, provenance } = await adapter.generateOptimizedImage(
  'aurora-lit cathedral at dawn — crystalline geometry',
  { model: 'mystic-2.5-fluid', resolution: '4k' }
);
```

</details>

<details>
<summary><strong>Python — Higgsfield Adapter</strong></summary>

```python
from mcop_package import NovaNeoEncoder, StigmergyV5, HolographicEtch
from mcop_package.adapters import HiggsfieldMCOPAdapter

adapter = HiggsfieldMCOPAdapter(
    encoder         = NovaNeoEncoder(dimensions=64, normalize=True),
    stigmergy       = StigmergyV5(resonance_threshold=0.4),
    holographic_etch= HolographicEtch(confidence_floor=0),
)
result = adapter.optimize_cinematic_video(
    'storm-lit ocean', model='higgsfield-cinema-v2'
)
print(result.merkle_root, result.provenance)
```

</details>

<div align="center">
<img src="https://raw.githubusercontent.com/Kuonirad/MCOP-Framework-2.0/cinematic-homepage-upgrade/public/section-divider.svg" width="100%" alt="section divider" />
</div>

## 🏗 Architecture

### The Core Triad — `encode` &rarr; `resonate` &rarr; `etch` &rarr; `provenance`

**NOVA-NEO Encoder** converts any input into a deterministic fixed-dimension tensor with an entropy estimate — the same input always yields the same tensor, making every downstream computation auditable.

**Stigmergy v5** is a vector pheromone store inspired by ant-colony stigmergy. Traces are recorded with cosine similarity and Merkle-chained for tamper-evidence.

**Holographic Etch** is an append-only rank-1 micro-etch accumulator. Every etch is replayable and confidence-floored.

### Universal Adapter Protocol v2.1

The `IMCOPAdapter` contract wires the deterministic triad to any external platform. Adapters are production-tested against Magnific, Higgsfield, Freepik, Utopia, and GenSpark.

| Adapter | Platform | Status |
|:---|:---|:---|
| `MagnificMCOPAdapter` | Magnific AI | ✅ Production |
| `HiggsfieldMCOPAdapter` | Higgsfield Cinema | ✅ Production |
| `FreepikMCOPAdapter` | Freepik AI | ✅ Production |
| `UtopiaMCOPAdapter` | Utopia | 🔶 Beta |
| `GenSparkMCOPAdapter` | GenSpark | 🔶 Beta |

<div align="center">
<img src="https://raw.githubusercontent.com/Kuonirad/MCOP-Framework-2.0/cinematic-homepage-upgrade/public/section-divider.svg" width="100%" alt="section divider" />
</div>

## 🔑 Key Design Principles

| Principle | What it means | Why it matters |
|:---|:---|:---|
| **Deterministic cognition** | Same input → same tensor, always | Full reproducibility across runs |
| **Provenance-first** | Merkle-style lineage on every operation | Audit trail from encode to output |
| **Hardware-aware** | GPU / FPGA acceleration seams | Production throughput at scale |
| **Human-in-the-loop** | Dialectical synthesis confirmation gate | AGI-safe override at every step |

## 📦 Installation

```bash
git clone https://github.com/Kuonirad/MCOP-Framework-2.0.git
cd MCOP-Framework-2.0
corepack enable
pnpm install --frozen-lockfile
pnpm dev    # → http://localhost:3000
```

## 🗂 Repository Layout

```
MCOP-Framework-2.0/
├── src/core/          ← NovaNeoEncoder · StigmergyV5 · HolographicEtch
├── packages/core/     ← ESM/CJS distribution
├── mcop_package/      ← Python implementation
├── public/            ← SVG assets & OG images
├── docs/              ← API · Benchmarks · Architecture
└── examples/          ← Runnable demos
```

📋 **Plain-English Glossary:** [PLAIN_ENGLISH_GLOSSARY.md](./PLAIN_ENGLISH_GLOSSARY.md)

🤝 **Contributing:** [CONTRIBUTING.md](./CONTRIBUTING.md)

<div align="center">
<img src="https://raw.githubusercontent.com/Kuonirad/MCOP-Framework-2.0/cinematic-homepage-upgrade/public/section-divider.svg" width="100%" alt="section divider" />
</div>

## 📜 License

This project is licensed under the **Business Source License 1.1** (BUSL 1.1) — source-available. Converts automatically to **MIT** on **2030-04-26**.

See [LICENSE](./LICENSE) for full terms &middot; [LICENSE-MIT-LEGACY](./LICENSE-MIT-LEGACY) &middot; [NOTICE.md](./NOTICE.md)

<div align="center">
<img src="https://raw.githubusercontent.com/Kuonirad/MCOP-Framework-2.0/cinematic-homepage-upgrade/public/footer-brand.svg" width="100%" alt="KullAILABS — Deterministic Cognition · Provenance-First" />
</div>
