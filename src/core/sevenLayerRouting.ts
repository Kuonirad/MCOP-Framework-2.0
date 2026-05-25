export type SevenLayerNumber = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface SevenLayerRoutingEntry {
  layer: SevenLayerNumber;
  whitepaperLayer: string;
  liveComposition: string;
  implementationModule: string;
  packageSurface: string;
  operatorSignal: string;
}

export const SEVEN_LAYER_ROUTING: readonly SevenLayerRoutingEntry[] = [
  {
    layer: 1,
    whitepaperLayer: 'Context encoding',
    liveComposition: 'NovaNeoEncoder',
    implementationModule: 'src/core/novaNeoEncoder.ts',
    packageSurface: '@kullailabs/mcop-core/NovaNeoEncoder',
    operatorSignal: 'tensor fingerprint, entropy estimate',
  },
  {
    layer: 2,
    whitepaperLayer: 'Resonance memory',
    liveComposition: 'StigmergyV5',
    implementationModule: 'src/core/stigmergyV5.ts',
    packageSurface: '@kullailabs/mcop-core/StigmergyV5',
    operatorSignal: 'resonance score, Merkle root',
  },
  {
    layer: 3,
    whitepaperLayer: 'Holographic ledger',
    liveComposition: 'HolographicEtch',
    implementationModule: 'src/core/holographicEtch.ts',
    packageSurface: '@kullailabs/mcop-core/HolographicEtch',
    operatorSignal: 'confidence delta, etch hash',
  },
  {
    layer: 4,
    whitepaperLayer: 'Graph-of-thought routing',
    liveComposition: 'P_GoT algorithms',
    implementationModule: 'src/core/pGoT_algorithms.ts',
    packageSurface: 'root application extension',
    operatorSignal: 'graph expansion budget, branch score',
  },
  {
    layer: 5,
    whitepaperLayer: 'Proteome substrate',
    liveComposition: 'ProteomeOrchestrator',
    implementationModule: 'src/proteome/ProteomeOrchestrator.ts',
    packageSurface: 'root application extension',
    operatorSignal: 'equilibrium stability, substrate Merkle root',
  },
  {
    layer: 6,
    whitepaperLayer: 'Drift and Guardian hardening',
    liveComposition: 'DriftSentinelKernel + GuardianMetaReasoner',
    implementationModule: 'src/core/driftSentinelKernel.ts',
    packageSurface: 'root application telemetry extension',
    operatorSignal: 'Delta(T_d, B_e), grounding floor verdict',
  },
  {
    layer: 7,
    whitepaperLayer: 'Hardware and transport substrate',
    liveComposition: 'CUDAHardwareLayer + RedisStreamsGossipTransport',
    implementationModule: 'src/hardware/CUDAHardwareLayer.ts',
    packageSurface: 'root application hardware and cluster extensions',
    operatorSignal: 'verifiedDevice, resolvedFrom, Redis stream lag',
  },
] as const;

export function getSevenLayerRouting(
  layer: number,
): SevenLayerRoutingEntry | undefined {
  return SEVEN_LAYER_ROUTING.find((entry) => entry.layer === layer);
}
