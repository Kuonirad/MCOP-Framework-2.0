import {
  attachAcceleratorProvenance,
  CPUFallback,
  CUDAAccelerator,
  CUDAProvider,
  detectCUDA,
} from '../hardware';

describe('hardware accelerator provenance', () => {
  it('seals CPU fallback outputs with device-aware Merkle metadata', async () => {
    const accelerator = new CPUFallback();
    const out = await accelerator.accelerate<{ projectedGain: number }>('meta-dry-run', { projectedGain: 0.42 });

    expect(out._device).toBe('cpu');
    expect(out._provenance.device).toBe('cpu');
    expect(out._provenance.kernel).toBe('meta-dry-run');
    expect(out._provenance.merkleRoot).toMatch(/^[a-f0-9]{64}$/);
    expect(out.projectedGain).toBe(0.42);
  });

  it('falls back to CPU when the CUDA service is unavailable', async () => {
    const fetchImpl = jest.fn().mockRejectedValue(new Error('service offline'));
    const accelerator = new CUDAProvider({ fetchImpl, timeoutMs: 5 });

    const out = await accelerator.accelerate<{ nodes: number }>('proteome-graph-step', { nodes: 150 });

    expect(fetchImpl).toHaveBeenCalledWith(
      'http://localhost:8765/cuda/proteome-graph-step',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(out._device).toBe('cpu');
    expect(out._provenance.fallback).toBe(true);
    expect(out._provenance.fallbackReason).toContain('service offline');
    expect(out.nodes).toBe(150);
  });

  it('can seal synchronous adapter/provenance metadata without network calls', () => {
    const sealed = attachAcceleratorProvenance(
      { tensorHash: 'abc' },
      { op: 'holographic-write', mode: 'cuda', device: 'cuda:0', provider: 'unit-test' },
    );

    expect(sealed._device).toBe('cuda:0');
    expect(sealed._provenance.cudaGraphCaptured).toBeUndefined();
    expect(sealed._provenance.merkleRoot).toMatch(/^[a-f0-9]{64}$/);
  });

  it('detects forced CPU and injected CUDA probes without Node-only imports', async () => {
    await expect(detectCUDA({ useCUDA: false })).resolves.toMatchObject({
      cudaAvailable: false,
      mode: 'cpu',
      device: 'cpu',
    });

    await expect(detectCUDA({
      probe: async () => ({ available: true, deviceName: 'RTX Test', computeCapability: '8.9' }),
    })).resolves.toMatchObject({
      cudaAvailable: true,
      mode: 'cuda',
      deviceName: 'RTX Test',
      computeCapability: '8.9',
    });
  });

  it('exposes the requested CUDAAccelerator facade with CPU parity fallback', async () => {
    const accelerator = new CUDAAccelerator({ useCUDA: false });

    const encoded = await accelerator.encodeWithCUDA(Float32Array.from([1, 2, 3]));
    const proteome = await accelerator.propagateProteomeGraphCUDA({ nodes: 3 }, Float32Array.from([3, 2, 1]));
    const etch = await accelerator.holographicBatchUpdate([2, 3], [5, 7]);
    const projected = await accelerator.metaProject({ baseline: 1 }, () => 0.125);

    expect(accelerator.useCUDA).toBe(false);
    expect(Array.from(encoded.output)).toEqual([1, 2, 3]);
    expect(Array.from(proteome.output)).toEqual([3, 2, 1]);
    expect(Array.from(etch.output)).toEqual([10, 14, 15, 21]);
    expect(projected.projectedGain).toBe(0.125);
    expect(projected._provenance.kernel).toBe('meta-dry-run');
  });
});
