<div align="center">

[![Build and Test](https://github.com/Kuonirad/MCOP-Framework-2.0/actions/workflows/ci.yml/badge.svg)](https://github.com/Kuonirad/MCOP-Framework-2.0/actions/workflows/ci.yml)
[![CodeQL](https://github.com/Kuonirad/MCOP-Framework-2.0/actions/workflows/codeql.yml/badge.svg)](https://github.com/Kuonirad/MCOP-Framework-2.0/actions/workflows/codeql.yml)
[![Coverage](https://img.shields.io/badge/coverage-96.6%25-00f0ff?style=flat-square&logo=jest)](./docs/api/README.md)
[![Release](https://img.shields.io/github/v/release/Kuonirad/MCOP-Framework-2.0?style=flat-square&color=7b2dff)](https://github.com/Kuonirad/MCOP-Framework-2.0/releases)
[![License: BUSL 1.1](https://img.shields.io/badge/License-BUSL%201.1-ffd700?style=flat-square)](LICENSE)
[![Maintained](https://img.shields.io/badge/maintained-yes-00ff88?style=flat-square)](./GOVERNANCE.md)

</div>

<picture>
  <img src="https://raw.githubusercontent.com/Kuonirad/MCOP-Framework-2.0/visual-overhaul-v2/public/mcop-hero-banner.svg" width="100%" alt="MCOP Framework 2.0" />
</picture>

<br/>

<div align="center">

<table>
<tr>
<td align="center" width="200"><a href="./docs/api/README.md"><img src="https://img.shields.io/badge/%F0%9F%93%96-Documentation-0d1117?style=for-the-badge&labelColor=00f0ff&color=0d1117" /></a></td>
<td align="center" width="200"><a href="#-quick-start"><img src="https://img.shields.io/badge/%F0%9F%9A%80-Quick%20Start-0d1117?style=for-the-badge&labelColor=7b2dff&color=0d1117" /></a></td>
<td align="center" width="200"><a href="#-architecture"><img src="https://img.shields.io/badge/%F0%9F%8F%97-Architecture-0d1117?style=for-the-badge&labelColor=ff006e&color=0d1117" /></a></td>
<td align="center" width="200"><a href="./docs/adapters/UNIVERSAL_ADAPTER_PROTOCOL.md"><img src="https://img.shields.io/badge/%F0%9F%94%8C-Adapters-0d1117?style=for-the-badge&labelColor=ffd700&color=0d1117" /></a></td>
<td align="center" width="200"><a href="https://github.com/Kuonirad/MCOP-Framework-2.0/wiki"><img src="https://img.shields.io/badge/%F0%9F%93%8B-Wiki-0d1117?style=for-the-badge&labelColor=00ff88&color=0d1117" /></a></td>
</tr>
</table>

</div>

---

<div align="center">

```
████████████████████████████████████████████████████████████████████████
 INPUT  ─►  NOVA-NEO  ─►  STIGMERGY  ─►  HOLO-ETCH  ─►  PROVENANCE
████████████████████████████████████████████████████████████████████████
```

**Meta-Cognitive Optimization Protocol** &mdash; recursive triad orchestration with deterministic,
cryptographically-linked provenance at every step.\
Built on **Next.js 16 + TypeScript**. Production-hardened. Hardware-acceleration-ready.

</div>

---

## 🔬 System Architecture

<picture>
  <img src="https://raw.githubusercontent.com/Kuonirad/MCOP-Framework-2.0/visual-overhaul-v2/public/architecture-triad.svg" width="100%" alt="MCOP Core Triad Architecture" />
</picture>

<br/>

<div align="center">

| &nbsp; | Kernel | Class | Role | Key Property |
|:---:|:---|:---|:---|:---|
| 💙 | **NOVA-NEO Encoder** | `NovaNeoEncoder` | Context &rarr; Tensor | Deterministic &middot; Entropy-normalized |
| 🟣 | **Stigmergy v5** | `StigmergyV5` | Pheromone memory | Cosine recall &middot; Merkle-chained |
| 🔴 | **Holographic Etch** | `HolographicEtch` | Confidence ledger | Append-only &middot; Rank-1 &middot; Replayable |
| 🟡 | **Provenance** | `ProvenanceMetadata` | Cryptographic lineage | SHA-256 &middot; ISO8601 &middot; UUID-v4 |

</div>

---

## ⚡ Quick-start

```bash
git clone https://github.com/Kuonirad/MCOP-Framework-2.0.git
cd MCOP-Framework-2.0
corepack enable
pnpm install --frozen-lockfile
pnpm dev    # → http://localhost:3000
```

<details>
<summary><strong>🟦 TypeScript &mdash; Core Triad</strong></summary>

```typescript
import { NovaNeoEncoder, StigmergyV5, HolographicEtch } from '@/core';

const encoder   = new NovaNeoEncoder({ dimensions: 64, normalize: true });
const stigmergy = new StigmergyV5({ resonanceThreshold: 0.4 });
const etch      = new HolographicEtch({ confidenceFloor: 0 });

const context   = encoder.encode('dialectical synthesis');
const trace     = stigmergy.recordTrace(context, context, { note: 'bootstrap' });
const resonance = stigmergy.getResonance(context);
const record    = etch.applyEtch(context, trace.synthesisVector, 'init');
// ↳ Every run returns a cryptographically-linked ProvenanceMetadata bundle
```

</details>

<details>
<summary><strong>🟣 TypeScript &mdash; Magnific Adapter</strong></summary>

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
<summary><strong>🔴 Python &mdash; Higgsfield Adapter</strong></summary>

```python
from mcop_package import NovaNeoEncoder, StigmergyV5, HolographicEtch
from mcop_package.adapters import HiggsfieldMCOPAdapter

adapter = HiggsfieldMCOPAdapter(
    encoder          = NovaNeoEncoder(dimensions=64, normalize=True),
    stigmergy        = StigmergyV5(resonance_threshold=0.4),
    holographic_etch = HolographicEtch(confidence_floor=0),
)
result = adapter.optimize_cinematic_video('storm-lit ocean', model='higgsfield-cinema-v2')
print(result.merkle_root, result.provenance)
```

</details>

---

## 🏗 Architecture

### The Core Triad &mdash; `encode` &rarr; `resonate` &rarr; `etch` &rarr; `provenance`

**NOVA-NEO Encoder** converts any input into a deterministic fixed-dimension tensor with an entropy estimate &mdash; the same input always yields the same tensor.

**Stigmergy v5** is a vector pheromone store inspired by ant-colony stigmergy. Traces are cosine-recalled and Merkle-chained for tamper-evidence.

**Holographic Etch** is an append-only rank-1 micro-etch accumulator. Every etch is replayable and confidence-floored.

### Universal Adapter Protocol v2.1

<div align="center">

| Adapter | Platform | Status | Lang |
|:---|:---|:---:|:---:|
| `MagnificMCOPAdapter` | Magnific AI | ✅ Production | TS |
| `HiggsfieldMCOPAdapter` | Higgsfield Cinema | ✅ Production | PY |
| `FreepikMCOPAdapter` | Freepik AI | ✅ Production | TS |
| `UtopiaMCOPAdapter` | Utopia | 🔶 Beta | TS |
| `GenSparkMCOPAdapter` | GenSpark | 🔶 Beta | TS |

</div>

---

## 🔑 Design Principles

<div align="center">

| Principle | Meaning | Guarantee |
|:---|:---|:---|
| **Deterministic cognition** | Same input &rarr; same tensor | Full reproducibility across runs |
| **Provenance-first** | Merkle lineage on every op | Cryptographic audit trail |
| **Hardware-aware** | GPU / FPGA acceleration | Production throughput at scale |
| **Human-in-the-loop** | Dialectical confirmation gate | AGI-safe override at every step |

</div>

---

## 📦 Installation

```bash
git clone https://github.com/Kuonirad/MCOP-Framework-2.0.git
cd MCOP-Framework-2.0 && corepack enable
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

---

## 📜 License

This project is licensed under the **Business Source License 1.1** (BUSL 1.1) &mdash; source-available. Converts automatically to **MIT** on **2030-04-26**.

See [LICENSE](./LICENSE) for full terms &middot; [LICENSE-MIT-LEGACY](./LICENSE-MIT-LEGACY) &middot; [NOTICE.md](./NOTICE.md)

<br/>

<div align="center">

<picture>
  <img src="https://raw.githubusercontent.com/Kuonirad/MCOP-Framework-2.0/visual-overhaul-v2/public/footer-brand.svg" width="100%" alt="KullAILABS" />
</picture>

---

*Built by [KullAILABS](https://github.com/Kuonirad) &middot; Deterministic cognition &middot; Provenance-first &middot; v2.2.1*

</div>
