import { getSevenLayerRouting, SEVEN_LAYER_ROUTING } from '../core';

describe('seven-layer routing map', () => {
  it('maps the whitepaper layers to live implementation modules in order', () => {
    expect(SEVEN_LAYER_ROUTING).toHaveLength(7);
    expect(SEVEN_LAYER_ROUTING.map((entry) => entry.layer)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(SEVEN_LAYER_ROUTING.map((entry) => entry.implementationModule)).toEqual([
      'src/core/novaNeoEncoder.ts',
      'src/core/stigmergyV5.ts',
      'src/core/holographicEtch.ts',
      'src/core/pGoT_algorithms.ts',
      'src/proteome/ProteomeOrchestrator.ts',
      'src/core/driftSentinelKernel.ts',
      'src/hardware/CUDAHardwareLayer.ts',
    ]);
    expect(SEVEN_LAYER_ROUTING.slice(0, 3).map((entry) => entry.packageSurface)).toEqual([
      '@kullailabs/mcop-core (NovaNeoEncoder export)',
      '@kullailabs/mcop-core (StigmergyV5 export)',
      '@kullailabs/mcop-core (HolographicEtch export)',
    ]);
  });

  it('retrieves a stable mapping entry by layer number', () => {
    expect(getSevenLayerRouting(6)).toMatchObject({
      layer: 6,
      liveComposition: 'DriftSentinelKernel + GuardianMetaReasoner',
      implementationModule: 'src/core/driftSentinelKernel.ts',
    });
    expect(getSevenLayerRouting(8)).toBeUndefined();
  });
});
