/**
 * Phase 2 of the CUDA productionization plan: orchestrator integration
 * tests for {@link resolveHardwareLayer}. Covers every documented cell
 * of the resolution matrix:
 *
 *  - `useCUDA: false` ∨ unset → microservice path off, in-process layer
 *    flag honoured.
 *  - `useCUDA: true` × `provider: 'microservice' | 'onnx' | 'native'`
 *    → correct accelerator selection.
 *  - `enableCUDA: 'auto'` × probe outcomes → `resolvedFrom` sealed
 *    correctly and layer's `enableCUDA` flag flips deterministically.
 *  - `enableCUDA: true | false` overrides bypass the probe.
 */

import {
  CPUFallback,
  CUDAProvider,
  type Accelerator,
  resolveHardwareLayer,
  resolveHardwareLayerSync,
  type ResolvedHardwareLayer,
} from '../hardware';

function neverProbe(): Promise<{ capable: boolean }> {
  throw new Error('probe must not be called for explicit enableCUDA');
}

async function fakeAccelerator(): Promise<Accelerator> {
  return new CUDAProvider({
    endpoint: 'http://test.invalid',
    fetchImpl: ((async () => new Response('{}', { status: 200 })) as unknown) as typeof fetch,
    timeoutMs: 1,
  });
}

describe('orchestratorIntegration / resolveHardwareLayer', () => {
  it('returns a CPU accelerator + disabled CUDA layer when useCUDA is off and enableCUDA is false', async () => {
    const r: ResolvedHardwareLayer = await resolveHardwareLayer({
      config: { useCUDA: false, provider: 'microservice', enableCUDA: false, kernelDir: './models' },
      probe: neverProbe,
    });
    expect(r.accelerator).toBeInstanceOf(CPUFallback);
    expect(r.cudaLayer.enableCUDA).toBe(false);
    expect(r.resolved.enableCUDA).toBe(false);
    expect(r.resolved.resolvedFrom).toBe('explicit-off');
    expect(r.resolved.useCUDA).toBe(false);
    expect(r.resolved.provider).toBe('microservice');
  });

  it('spins up CUDAProvider when useCUDA=true + provider=microservice', async () => {
    const r = await resolveHardwareLayer({
      config: { useCUDA: true, provider: 'microservice', enableCUDA: false, kernelDir: './models' },
      createAccelerator: fakeAccelerator,
    });
    expect(r.accelerator).toBeInstanceOf(CUDAProvider);
    expect(r.cudaLayer.enableCUDA).toBe(false);
  });

  it('keeps the accelerator on CPU when provider=onnx so the in-process layer is the sole CUDA path', async () => {
    const r = await resolveHardwareLayer({
      config: { useCUDA: true, provider: 'onnx', enableCUDA: true, kernelDir: './models' },
      probe: neverProbe,
    });
    expect(r.accelerator).toBeInstanceOf(CPUFallback);
    expect(r.cudaLayer.enableCUDA).toBe(true);
    expect(r.resolved.resolvedFrom).toBe('explicit-on');
  });

  it('routes provider=native through the unified factory (no native binding shipped yet)', async () => {
    const calls: Array<unknown> = [];
    const r = await resolveHardwareLayer({
      config: { useCUDA: true, provider: 'native', enableCUDA: false, kernelDir: './models' },
      createAccelerator: async (opts) => {
        calls.push(opts);
        return new CPUFallback({ device: 'cpu-native' });
      },
    });
    expect(calls.length).toBe(1);
    expect((calls[0] as { provider?: string }).provider).toBe('native');
    expect((r.accelerator as Accelerator).device).toBe('cpu-native');
  });

  it("seals 'auto-capable' when the probe reports CUDA available", async () => {
    const r = await resolveHardwareLayer({
      config: { useCUDA: false, provider: 'onnx', enableCUDA: 'auto', kernelDir: './models' },
      probe: async () => ({ capable: true }),
    });
    expect(r.cudaLayer.enableCUDA).toBe(true);
    expect(r.resolved.enableCUDA).toBe(true);
    expect(r.resolved.resolvedFrom).toBe('auto-capable');
  });

  it("seals 'auto-not-capable' on CPU-only hosts", async () => {
    const r = await resolveHardwareLayer({
      config: { useCUDA: false, provider: 'onnx', enableCUDA: 'auto', kernelDir: './models' },
      probe: async () => ({ capable: false }),
    });
    expect(r.cudaLayer.enableCUDA).toBe(false);
    expect(r.resolved.resolvedFrom).toBe('auto-not-capable');
  });

  it('never throws when the probe rejects — folds into auto-not-capable via detectCUDACapability', async () => {
    // No probe override → uses real detectCUDACapability which folds the missing onnxruntime-node
    // into a capable=false response on CPU-only CI. Must not throw.
    const r = await resolveHardwareLayer({
      config: { useCUDA: false, provider: 'onnx', enableCUDA: 'auto', kernelDir: './models' },
    });
    expect(r.cudaLayer.enableCUDA).toBe(false);
    expect(r.resolved.resolvedFrom).toBe('auto-not-capable');
  });

  it('synchronous resolver collapses auto to disabled with audit tag', () => {
    const r = resolveHardwareLayerSync({
      config: { useCUDA: false, provider: 'onnx', enableCUDA: 'auto', kernelDir: './models' },
    });
    expect(r.cudaLayer.enableCUDA).toBe(false);
    expect(r.resolved.resolvedFrom).toBe('auto-not-capable');
  });

  it('returned object is frozen so callers cannot mutate sealed lineage', async () => {
    const r = await resolveHardwareLayer({
      config: { useCUDA: false, provider: 'onnx', enableCUDA: false, kernelDir: './models' },
      probe: neverProbe,
    });
    expect(Object.isFrozen(r)).toBe(true);
    expect(Object.isFrozen(r.resolved)).toBe(true);
  });
});
