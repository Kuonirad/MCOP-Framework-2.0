# @kullailabs/mcop-core

[![npm version](https://img.shields.io/npm/v/@kullailabs/mcop-core.svg)](https://www.npmjs.com/package/@kullailabs/mcop-core)
[![provenance](https://img.shields.io/badge/npm-provenance-blue)](https://docs.npmjs.com/generating-provenance-statements)
[![license](https://img.shields.io/npm/l/@kullailabs/mcop-core.svg)](./LICENSE)

Core primitives for the **Meta-Cognitive Operating Protocol (MCOP)** — a deterministic, auditable, provenance-tracked reasoning substrate for AI agents.

Published with [npm provenance](https://docs.npmjs.com/generating-provenance-statements): every release is cryptographically linked to the exact GitHub Actions build that produced it (Sigstore transparency log).

## Install

```bash
npm install @kullailabs/mcop-core
# or
pnpm add @kullailabs/mcop-core
# or
yarn add @kullailabs/mcop-core
```

Works in Node.js 18+ (ESM and CommonJS).

## Primitives

| Class | Purpose |
|---|---|
| `NovaNeoEncoder` | SHA-256 → fixed-dimension `Float64` context tensor. Deterministic, optional L2 normalization. |
| `StigmergyV5` | Cosine-similarity pheromone store with Merkle-chained trace hashes. |
| `HolographicEtch` | Rank-1 micro-updates with configurable confidence floor and audit log. |

## Quick start

```ts
import {
  NovaNeoEncoder,
  StigmergyV5,
  HolographicEtch,
} from '@kullailabs/mcop-core';

const encoder = new NovaNeoEncoder({ dimensions: 256, normalize: true });
const stigmergy = new StigmergyV5({ resonanceThreshold: 0.5 });
const etch = new HolographicEtch({ confidenceFloor: 0.8 });

const context = encoder.encode('user asked about GDPR Article 17');
const synthesis = encoder.encode('right-to-erasure procedure');

const trace = stigmergy.recordTrace(context, synthesis, { source: 'policy-doc' });
console.log('Merkle root:', stigmergy.getMerkleRoot());

const resonance = stigmergy.getResonance(encoder.encode('how do I delete user data?'));
console.log('Resonance score:', resonance.score);

const record = etch.applyEtch(context, synthesis, 'reinforce GDPR pathway');
console.log('Etch hash:', record.hash);
```

## Optional debug hook

The encoder is zero-dependency by default. To inspect provenance events, register a hook:

```ts
import { setNovaNeoDebugHook } from '@kullailabs/mcop-core';

setNovaNeoDebugHook((event) => {
  console.log(event.msg, event.provenance);
});
```

## Types

All primitives are fully typed. Key exports:

- `ContextTensor` — `number[]`
- `PheromoneTrace` — Merkle-chained trace record
- `ResonanceResult` — `{ score, trace? }`
- `EtchRecord` — audit log entry
- `NovaNeoConfig`, `StigmergyConfig`, `HolographicEtchConfig`

## Supply-chain posture

- Built and published only from GitHub Actions via OIDC — no long-lived npm tokens.
- `npm publish --provenance` emits a [Sigstore](https://www.sigstore.dev/) transparency log entry for each release.
- All GitHub Actions used in the release pipeline are pinned to SHA-1.
- Source available at [Kuonirad/KullAILABS-MCOP-Framework-2.0](https://github.com/Kuonirad/KullAILABS-MCOP-Framework-2.0).

## License

MIT © Kevin John Kull (Kuonirad) and KullAILABS MCOP Framework contributors.
