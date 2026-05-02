<div align="center">

<img src="https://raw.githubusercontent.com/Kuonirad/MCOP-Framework-2.0/main/public/og-image.svg" width="100%" alt="MCOP Framework 2.0 — Meta-Cognitive Optimization Protocol" />

<br />

[![CI](https://github.com/Kuonirad/MCOP-Framework-2.0/actions/workflows/ci.yml/badge.svg)](https://github.com/Kuonirad/MCOP-Framework-2.0/actions/workflows/ci.yml)
[![CodeQL](https://github.com/Kuonirad/MCOP-Framework-2.0/actions/workflows/codeql.yml/badge.svg)](https://github.com/Kuonirad/MCOP-Framework-2.0/actions/workflows/codeql.yml)
[![Coverage](./docs/badges/coverage.svg)](./docs/api/README.md)
[![API TypeDoc](https://img.shields.io/badge/API-TypeDoc-3178C6?style=flat-square)](./docs/api/README.md)
[![Benchmarks](https://img.shields.io/badge/benchmarks-public-emerald?style=flat-square)](./docs/benchmarks/methodology.md)
[![Release](https://img.shields.io/github/v/release/Kuonirad/MCOP-Framework-2.0?style=flat-square)](https://github.com/Kuonirad/MCOP-Framework-2.0/releases)
[![License: BUSL 1.1](https://img.shields.io/badge/License-BUSL%201.1-amber?style=flat-square)](LICENSE)
[![Maintained](https://img.shields.io/badge/maintained-yes-brightgreen?style=flat-square)](./GOVERNANCE.md)

<br />

### *Deterministic cognition. Provenance-first. Human-in-the-loop.*

**Meta-Cognitive Optimization Protocol** — recursive triad orchestration across encode → resonate → etch → provenance.\
Built with **Next.js 16 + TypeScript**. Production-hardened. Hardware-acceleration-ready.

[**📖 Docs**](./docs/api/README.md) &nbsp;·&nbsp;
[**🚀 Quick-start**](#-quick-start) &nbsp;·&nbsp;
[**🏗 Architecture**](#-architecture) &nbsp;·&nbsp;
[**🔌 Adapters**](./docs/adapters/UNIVERSAL_ADAPTER_PROTOCOL.md) &nbsp;·&nbsp;
[**📋 Wiki**](https://github.com/Kuonirad/MCOP-Framework-2.0/wiki)

</div>

---

## 🔬 System Architecture

<div align="center">

```
╔══════════════════════════════════════════════════════════════════════════════╗
║                      MCOP FRAMEWORK 2.0 — CORE TRIAD                       ║
╠══════════════════════════════════════════════════════════════════════════════╣
║                                                                              ║
║   USER INPUT                                                                 ║
║        │ Context                                                             ║
║        ▼                                                                     ║
║  ┌─────────────────┐  Tensor   ┌────────────────────┐                       ║
║  │  NOVA-NEO       │──────────▶│  Holographic Etch  │                       ║
║  │  Encoder        │           │  Rank-1 micro-etch │                       ║
║  │  Deterministic  │  Tensor   │  Confidence delta  │                       ║
║  │  SHA-256 hash   │─────┐     │  Replayable audit  │                       ║
║  └─────────────────┘     │     └──────────┬─────────┘                       ║
║                          ▼                │ Micro-Etch Weights              ║
║              ┌──────────────────┐         │                                 ║
║              │  Stigmergy v5    │◀────────┘                                 ║
║              │  Pheromone store │                                            ║
║              │  Cosine recall   │  Resonance                                ║
║              │  Merkle-chained  │──────────┐                                ║
║              └──────────────────┘          ▼                                ║
║                                   ┌─────────────────┐                       ║
║                                   │  Dialectical    │                       ║
║                                   │  Synthesizer    │                       ║
║                                   └────────┬────────┘                       ║
║                                            │ Refined Prompt                 ║
║                                            ▼                                ║
║                              ┌─────────────────────────┐                   ║
║                              │    Adapter Layer v2.1   │                   ║
║                              │  REST · SDK · MCP        │                   ║
║                              └──────────┬──────────────┘                   ║
║                          ┌─────────────┴──────────────────┐               ║
║                          ▼                                 ▼               ║
║              ┌────────────────────┐           ┌───────────────────────┐   ║
║              │  Next.js           │           │  Magnific · Higgsfield│   ║
║              │  Experience        │           │  Utopai · Generic     │   ║
║              │  Merkle Root       │           └───────────────────────┘   ║
║              └────────────────────┘                                        ║
╚══════════════════════════════════════════════════════════════════════════════╝
```

</div>

| Kernel | Class | Role | Key Property |
|--------|-------|------|--------------|
| **NOVA-NEO Encoder** | `NovaNeoEncoder` | Context → Tensor | Deterministic · Entropy-normalized |
| **Stigmergy v5** | `StigmergyV5` | Pheromone memory | Cosine recall · Merkle-chained |
| **Holographic Etch** | `HolographicEtch` | Confidence ledger | Append-only · Rank-1 · Replayable |

---

## ⚡ Quick-start

### TypeScript (Core Triad)

```typescript
import { NovaNeoEncoder, StigmergyV5, HolographicEtch } from '@/core';

const encoder  = new NovaNeoEncoder({ dimensions: 64, normalize: true });
const stigmergy = new StigmergyV5({ resonanceThreshold: 0.4 });
const etch     = new HolographicEtch({ confidenceFloor: 0 });

const context   = encoder.encode('dialectical synthesis');
const trace     = stigmergy.recordTrace(context, context, { note: 'bootstrap' });
const resonance = stigmergy.getResonance(context);
const record    = etch.applyEtch(context, trace.synthesisVector, 'init');

// Every run returns a cryptographically-linked ProvenanceMetadata bundle:
// { merkleRoot, entropyScore, resonanceScore, etchHash, provenance }
```

### TypeScript (Magnific Adapter)

```typescript
import { MagnificMCOPAdapter } from '@/adapters';

const adapter = new MagnificMCOPAdapter({
  encoder:        new NovaNeoEncoder({ dimensions: 64, normalize: true }),
  stigmergy:      new StigmergyV5(),
  holographicEtch: new HolographicEtch(),
});

const { result, merkleRoot, provenance } = await adapter.generateOptimizedImage(
  'aurora-lit cathedral at dawn — crystalline geometry',
  { model: 'mystic-2.5-fluid', resolution: '4k' }
);
```

### Python (Higgsfield)

```python
from mcop_package import NovaNeoEncoder, StigmergyV5, HolographicEtch
from mcop_package.adapters import HiggsfieldMCOPAdapter

adapter = HiggsfieldMCOPAdapter(
    encoder=NovaNeoEncoder(dimensions=64, normalize=True),
    stigmergy=StigmergyV5(resonance_threshold=0.4),
    holographic_etch=HolographicEtch(confidence_floor=0),
)
result = adapter.optimize_cinematic_video('storm-lit ocean', model='higgsfield-cinema-v2')
print(result.merkle_root, result.provenance)
```

---

## 🏗 Architecture

### The Core Triad — encode → resonate → etch → provenance

**NOVA-NEO Encoder** converts any input into a *deterministic* fixed-dimension tensor with an entropy estimate. Same input → same tensor, always, on any platform.

**Stigmergy v5** is a vector pheromone store inspired by ant-colony stigmergy: agents coordinate through shared environmental traces rather than direct communication. Every trace is Merkle-chained for tamper-evidence.

**Holographic Etch** is an append-only rank-1 micro-etch accumulator: every confidence-delta update is cryptographically linked to the previous state and can be replayed to reconstruct any historical configuration.

> *See [ARCHITECTURE.md](./ARCHITECTURE.md) for complete diagrams and data-flow specifications.*

### Universal Adapter Protocol v2.1

The `IMCOPAdapter` contract wires the deterministic triad to any external platform **without modifying core**:

```
Magnific (image AI)  ·  Higgsfield (video AI)  ·  Utopai  ·  Generic REST/MCP/HTTP
```

---

## 🔑 Key Design Principles

| Principle | What it means |
|-----------|---------------|
| **Deterministic cognition** | Reproducible context tensors with explicit entropy metrics — same input always produces same output |
| **Provenance-first** | Merkle-style lineage for every pheromone trace and etch update — full cryptographic audit trail |
| **Hardware-aware** | Clear seams for GPU/FPGA acceleration of rank-1 updates and cosine similarity search |
| **Human-in-the-loop** | Dialectical synthesis loop that embraces audits, overrides, and deterministic replay |

---

## 📦 Installation

```bash
git clone https://github.com/Kuonirad/MCOP-Framework-2.0.git
cd MCOP-Framework-2.0
corepack enable          # first-time only
pnpm install --frozen-lockfile
pnpm dev                 # → http://localhost:3000
```

**Prerequisites:** Node.js 20+ · pnpm 9+ · (Python 3.10+ for `mcop_package`)

---

## 🗂 Repository Layout

```
MCOP-Framework-2.0/
├── src/
│   ├── core/         ← NovaNeoEncoder · StigmergyV5 · HolographicEtch
│   └── adapters/     ← Universal Adapter Protocol v2.1
├── packages/core/    ← ESM/CJS TypeScript distribution
├── mcop_package/     ← Python implementation
├── docs/             ← API · ADRs · Benchmarks · Whitepapers
├── examples/         ← Runnable adapter examples
└── config/examples/  ← Sample configuration
```

---

## 📋 Plain-English Glossary

New to the vocabulary? [`PLAIN_ENGLISH_GLOSSARY.md`](./PLAIN_ENGLISH_GLOSSARY.md) translates every custom term (NOVA-NEO, Stigmergy, Holographic Etch, pheromone trace, Merkle Root, ProvenanceMetadata) into clear, jargon-free language.

---

## 🤝 Contributing

See [`CONTRIBUTING.md`](./CONTRIBUTING.md) for dev setup, coding standards (strict TypeScript · ruff/mypy Python · WCAG 2.2 AA), PR workflow, and changeset conventions.

```bash
pnpm test         # Jest (96.6% coverage)
pnpm lint         # ESLint + Prettier
pnpm typecheck    # TypeScript strict
pnpm cypress:run  # E2E (exploratory)
```

---

## 📜 License

**BUSL 1.1** (Business Source License 1.1) — source-available now; converts to **MIT on 2030-04-26**.\
See [LICENSE](./LICENSE) for full terms, [LICENSE-MIT-LEGACY](./LICENSE-MIT-LEGACY) for pre-2026-04-26 MIT commits, and [NOTICE.md](./NOTICE.md) for the transition notice.

---

<div align="center">

*Built by [KullAILABS](https://github.com/Kuonirad) · Deterministic cognition / Provenance-first*

**[⭐ Star this repo](https://github.com/Kuonirad/MCOP-Framework-2.0) · [📖 Wiki](https://github.com/Kuonirad/MCOP-Framework-2.0/wiki) · [🐛 Issues](https://github.com/Kuonirad/MCOP-Framework-2.0/issues)**

</div>
