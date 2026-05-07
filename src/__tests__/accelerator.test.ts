import { attachAcceleratorProvenance, CPUFallback, CUDAProvider } from '../hardware';

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
});
