# Seven-Layer Mapping

The whitepaper names seven cognitive layers. The live implementation uses
smaller modules, so this file is the public bridge between the paper vocabulary
and the code that actually ships.

The runtime export is `SEVEN_LAYER_ROUTING` from `src/core/sevenLayerRouting.ts`.
The package mirror is `packages/core/src/sevenLayerRouting.ts`.

| Layer | Whitepaper name | Live composition | Module | Operator signal |
| ---: | --- | --- | --- | --- |
| 1 | Context encoding | `NovaNeoEncoder` | `src/core/novaNeoEncoder.ts` | tensor fingerprint, entropy estimate |
| 2 | Resonance memory | `StigmergyV5` | `src/core/stigmergyV5.ts` | resonance score, Merkle root |
| 3 | Holographic ledger | `HolographicEtch` | `src/core/holographicEtch.ts` | confidence delta, etch hash |
| 4 | Graph-of-thought routing | `P_GoT algorithms` | `src/core/pGoT_algorithms.ts` | graph expansion budget, branch score |
| 5 | Proteome substrate | `ProteomeOrchestrator` | `src/proteome/ProteomeOrchestrator.ts` | equilibrium stability, substrate Merkle root |
| 6 | Drift and Guardian hardening | `DriftSentinelKernel` + `GuardianMetaReasoner` | `src/core/driftSentinelKernel.ts` | Delta(T_d, B_e), grounding floor verdict |
| 7 | Hardware and transport substrate | `CUDAHardwareLayer` + `RedisStreamsGossipTransport` | `src/hardware/CUDAHardwareLayer.ts` | verifiedDevice, resolvedFrom, Redis stream lag |

## Change Threshold

When the whitepaper is revised, either delete this bridge because the paper now
uses live module names, or promote `SEVEN_LAYER_ROUTING` to the canonical layer
enum used by docs, API references, dashboards, and external integrations.
