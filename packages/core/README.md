# @kullailabs/mcop-core

[![npm version](https://img.shields.io/npm/v/@kullailabs/mcop-core.svg)](https://www.npmjs.com/package/@kullailabs/mcop-core)
[![provenance](https://img.shields.io/badge/npm-provenance-blue)](https://docs.npmjs.com/generating-provenance-statements)
[![license](https://img.shields.io/npm/l/@kullailabs/mcop-core.svg)](./LICENSE)

Core primitives for the **Meta-Cognitive Optimization Protocol (MCOP)** — a deterministic, auditable, provenance-tracked reasoning substrate for AI agents.

The canonical GitHub Actions release path publishes with
[npm provenance](https://docs.npmjs.com/generating-provenance-statements),
cryptographically linking each workflow-published release to the build that
produced it. Historical manual bootstrap releases are documented separately in
the repository release playbook.

## Distribution boundary

`@kullailabs/mcop-core` is the public npm library. Its supported code entry
point is the package root, `@kullailabs/mcop-core`, which exports the flagship
`NovaNeoEncoder`, `StigmergyV5`, and `HolographicEtch` triad along with the
other names documented below. Deep imports such as adapters, integrations, or
ledger subpaths are not exported.

The repository root package, `@kuonirad/mcop-framework`, is a private workspace
application and is not an npm install target. Clone the repository or use an
MCOP Desktop build for the full app-only surface.

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
| `NovaNeoEncoder` / `UniversalEncoder` | Portable SHA-256 → fixed-dimension `Float64` context tensor. Deterministic, optional L2 normalization. |
| `StigmergyV5` | Cosine-similarity pheromone store with Merkle-chained trace hashes and Positive Feedback Hysteresis. |
| `HolographicEtch` | Rank-1 micro-updates with configurable confidence floor, audit log, and optional growth ledger. |
| `PositiveResonanceAmplifier` | Merkle-chained Positive Building event ledger with contributor joy metrics. |
| `EudaimonicScoringLedger` | First-class scorer ontology with scorer definitions, episode scoring, and meta-evaluation selection. |

## Quick start

```ts
import {
  NovaNeoEncoder,
  StigmergyV5,
  HolographicEtch,
  PositiveResonanceAmplifier,
} from '@kullailabs/mcop-core';

const encoder = new NovaNeoEncoder({ dimensions: 256, normalize: true });
const stigmergy = new StigmergyV5({ resonanceThreshold: 0.5 });
const growth = new PositiveResonanceAmplifier();
const etch = new HolographicEtch({ confidenceFloor: 0, growthLedger: growth });

const context = encoder.encode('user asked about GDPR Article 17');
// Use a replay of the accepted context so this minimal example always clears
// the configured confidence floor. Production synthesis vectors can come from
// any deterministic or embedding-backed reasoning stage.
const synthesis = context.slice();

const trace = stigmergy.recordTrace(context, synthesis, { source: 'policy-doc' });
console.log('Merkle root:', stigmergy.getMerkleRoot());

const resonance = stigmergy.getResonance(encoder.encode('how do I delete user data?'));
console.log('Resonance score:', resonance.score);

const record = etch.applyEtch(context, synthesis, 'reinforce GDPR pathway');
etch.recordPositiveGrowthEvent({
  domain: 'provenance',
  title: 'Auditable GDPR pathway',
  positiveBuilding: 'Recorded a replayable right-to-erasure decision path.',
  resonanceDelta: record.deltaWeight,
  evidence: { traceHash: trace.hash, etchHash: record.hash },
});
console.log('Etch hash:', record.hash);
console.log('Positive impact:', etch.getPositiveImpactMetrics());
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
- `PositiveGrowthEvent`, `PositiveImpactMetrics` — growth-ledger records
- `ScoreDefinition`, `EpisodeScore`, `ScoreMetaEvaluation` — scorer-ledger records
- `NovaNeoConfig`, `StigmergyConfig`, `HolographicEtchConfig`
- `TRIAD_PROTOCOL_VERSION` — explicit cross-language wire/hash contract

## Supply-chain posture

- After the documented one-time bootstrap, canonical releases are built and
  published from GitHub Actions via OIDC — no long-lived npm tokens.
- `npm publish --provenance` emits a [Sigstore](https://www.sigstore.dev/)
  transparency log entry for each workflow-published release.
- All GitHub Actions used in the release pipeline are pinned to SHA-1.
- Source available at [Kuonirad/MCOP-Framework-2.0](https://github.com/Kuonirad/MCOP-Framework-2.0).

## License

Apache License 2.0 (Apache-2.0) — see [LICENSE](./LICENSE) and [NOTICE.md](./NOTICE.md). Versions originally released under MIT remain available under MIT — see [LICENSE-MIT-LEGACY](./LICENSE-MIT-LEGACY).

© 2025-2026 Kevin John Kull (Kuonirad) and KullAILABS MCOP Framework contributors.
