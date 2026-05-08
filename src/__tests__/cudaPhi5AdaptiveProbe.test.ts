/**
 * @fileoverview Φ5 adaptive-probe regression suite.
 *
 * Φ5 flips the in-process CUDA layer's default-on switch from a hard
 * boolean to a runtime probe (`enableCUDA: 'auto'`) so the same MCOP
 * build adapts to every ARC-AGI-3 environment without code changes:
 *
 *   - **CPU-only** `ubuntu-latest` CI runner without `onnxruntime-node`
 *     (or with a CPU-only ORT build) → probe reports `capable=false`,
 *     layer ends up disabled, ghost-GPU events stay at zero.
 *   - **Dev laptop** without the optional peer dep installed → identical
 *     to CPU-only path.
 *   - **GPU prod node** with `onnxruntime-node-gpu` exposing a CUDA
 *     backend → probe reports `capable=true`, layer flips on.
 *
 * Every leaf seals the resolution audit trail in
 * `AcceleratorProvenance.resolvedFrom` so a downstream MetaTuner can
 * condition substrate-revival on the exact reason the flag was
 * on/off, not just on the boolean outcome.
 */
import {
  CUDA_KERNEL_OPS,
  CUDAHardwareLayer,
  detectCUDACapability,
  resolveEnableCUDA,
  type CUDAKernelOp,
  type OnnxInferenceSession,
  type OnnxRuntimeApi,
  type OnnxTensor,
} from '../hardware/CUDAHardwareLayer';

/* ------------------------------------------------------------------ */
/* Test doubles                                                        */
/* ------------------------------------------------------------------ */

function makeCudaSession(): OnnxInferenceSession {
  return {
    async run() {
      return { output: { data: new Float32Array([1]), dims: [1] } };
    },
    endProfiling() {
      return JSON.stringify([{ args: { provider: 'CUDAExecutionProvider' } }]);
    },
  };
}

function buildCapableOrt(backends: ReadonlyArray<string | { name?: string }>): OnnxRuntimeApi {
  return {
    InferenceSession: {
      async create() {
        return makeCudaSession();
      },
    },
    listSupportedBackends: () => backends,
  };
}

/* ------------------------------------------------------------------ */
/* detectCUDACapability                                                */
/* ------------------------------------------------------------------ */

describe('detectCUDACapability (Φ5 probe)', () => {
  it('reports capable=true when listSupportedBackends() includes a CUDA entry', async () => {
    const ort = buildCapableOrt(['CPUExecutionProvider', 'CUDAExecutionProvider']);
    const result = await detectCUDACapability({ ortInjection: ort });
    expect(result.capable).toBe(true);
    expect(result.reason).toMatch(/CUDA backend reported/);
    expect(result.probedProviders).toEqual(['CPUExecutionProvider', 'CUDAExecutionProvider']);
    expect(typeof result.durationMs).toBe('number');
  });

  it('accepts the alternate `{ name: "cuda" }` shape some ORT builds emit', async () => {
    const ort = buildCapableOrt([{ name: 'cuda' }, { name: 'cpu' }]);
    const result = await detectCUDACapability({ ortInjection: ort });
    expect(result.capable).toBe(true);
    expect(result.probedProviders).toEqual(['cuda', 'cpu']);
  });

  it('reports capable=false when only CPU backends are available (CPU-only host)', async () => {
    const ort = buildCapableOrt(['cpu']);
    const result = await detectCUDACapability({ ortInjection: ort });
    expect(result.capable).toBe(false);
    expect(result.reason).toMatch(/not in onnxruntime-node listSupportedBackends/);
    expect(result.probedProviders).toEqual(['cpu']);
  });

  it('reports capable=false when listSupportedBackends() is missing (older ORT build)', async () => {
    const ort: OnnxRuntimeApi = {
      InferenceSession: { async create() { return makeCudaSession(); } },
    };
    const result = await detectCUDACapability({ ortInjection: ort });
    expect(result.capable).toBe(false);
    expect(result.reason).toMatch(/listSupportedBackends\(\) unavailable/);
  });

  it('reports capable=false when listSupportedBackends() throws (broken install)', async () => {
    const ort: OnnxRuntimeApi = {
      InferenceSession: { async create() { return makeCudaSession(); } },
      listSupportedBackends: () => {
        throw new Error('libonnxruntime_providers_cuda.so missing');
      },
    };
    const result = await detectCUDACapability({ ortInjection: ort });
    expect(result.capable).toBe(false);
    expect(result.reason).toMatch(/listSupportedBackends\(\) threw/);
  });

  it('falls back to capable=false cleanly when onnxruntime-node is not installed', async () => {
    // No injection → real dynamic import. On CPU-only `ubuntu-latest` CI
    // the package is absent, so this exercises the not-installed branch.
    // We don't assert the exact reason because the actual installed state
    // depends on the runner — but the contract is: the probe never throws
    // and always returns a frozen result.
    const result = await detectCUDACapability();
    expect(typeof result.capable).toBe('boolean');
    expect(typeof result.reason).toBe('string');
    expect(Object.isFrozen(result)).toBe(true);
    expect(typeof result.durationMs).toBe('number');
  });
});

/* ------------------------------------------------------------------ */
/* resolveEnableCUDA                                                   */
/* ------------------------------------------------------------------ */

describe('resolveEnableCUDA (Φ5 helper)', () => {
  it('honours explicit-on over the probe', async () => {
    const probe = jest.fn();
    const out = await resolveEnableCUDA(true, { probe });
    expect(out).toEqual({ enableCUDA: true, resolvedFrom: 'explicit-on' });
    expect(probe).not.toHaveBeenCalled();
  });

  it('honours explicit-off over the probe', async () => {
    const probe = jest.fn();
    const out = await resolveEnableCUDA(false, { probe });
    expect(out).toEqual({ enableCUDA: false, resolvedFrom: 'explicit-off' });
    expect(probe).not.toHaveBeenCalled();
  });

  it('falls back to default-off when no value is supplied', async () => {
    const probe = jest.fn();
    const out = await resolveEnableCUDA(undefined, { probe });
    expect(out).toEqual({ enableCUDA: false, resolvedFrom: 'default-off' });
    expect(probe).not.toHaveBeenCalled();
  });

  it('on auto + capable probe → enableCUDA=true with auto-capable lineage', async () => {
    const out = await resolveEnableCUDA('auto', {
      probe: async () =>
        Object.freeze({
          capable: true,
          reason: 'mock',
          probedProviders: Object.freeze(['CUDAExecutionProvider']),
          durationMs: 1,
        }),
    });
    expect(out.enableCUDA).toBe(true);
    expect(out.resolvedFrom).toBe('auto-capable');
    expect(out.probe?.capable).toBe(true);
  });

  it('on auto + non-capable probe → enableCUDA=false with auto-not-capable lineage', async () => {
    const out = await resolveEnableCUDA('auto', {
      probe: async () =>
        Object.freeze({
          capable: false,
          reason: 'no GPU',
          probedProviders: Object.freeze(['CPUExecutionProvider']),
          durationMs: 0,
        }),
    });
    expect(out.enableCUDA).toBe(false);
    expect(out.resolvedFrom).toBe('auto-not-capable');
    expect(out.probe?.capable).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/* CUDAHardwareLayer.create() factory                                  */
/* ------------------------------------------------------------------ */

describe('CUDAHardwareLayer.create() (Φ5 async factory)', () => {
  it('passes booleans through to the synchronous constructor (zero overhead)', async () => {
    const onLayer = await CUDAHardwareLayer.create({ enableCUDA: true });
    expect(onLayer.enableCUDA).toBe(true);
    expect(onLayer.resolvedFrom).toBe('explicit-on');

    const offLayer = await CUDAHardwareLayer.create({ enableCUDA: false });
    expect(offLayer.enableCUDA).toBe(false);
    expect(offLayer.resolvedFrom).toBe('explicit-off');
  });

  it('on auto + capable substrate, the factory flips enableCUDA to true', async () => {
    const ort = buildCapableOrt(['CUDAExecutionProvider', 'CPUExecutionProvider']);
    const layer = await CUDAHardwareLayer.create({
      enableCUDA: 'auto',
      ortInjection: ort,
    });
    expect(layer.enableCUDA).toBe(true);
    expect(layer.resolvedFrom).toBe('auto-capable');
  });

  it('on auto + non-capable substrate, the factory keeps enableCUDA at false', async () => {
    const ort = buildCapableOrt(['CPUExecutionProvider']);
    const layer = await CUDAHardwareLayer.create({
      enableCUDA: 'auto',
      ortInjection: ort,
    });
    expect(layer.enableCUDA).toBe(false);
    expect(layer.resolvedFrom).toBe('auto-not-capable');
  });

  it('synchronous constructor with auto resolves to disabled with auto-not-capable lineage', () => {
    const layer = new CUDAHardwareLayer({ enableCUDA: 'auto' });
    expect(layer.enableCUDA).toBe(false);
    expect(layer.resolvedFrom).toBe('auto-not-capable');
  });

  it('explicit resolvedFrom override is preserved by the constructor (audit injection)', () => {
    const layer = new CUDAHardwareLayer({
      enableCUDA: true,
      resolvedFrom: 'auto-capable',
    });
    expect(layer.enableCUDA).toBe(true);
    expect(layer.resolvedFrom).toBe('auto-capable');
  });
});

/* ------------------------------------------------------------------ */
/* Φ5 — three-substrate soak: explicit-on / explicit-off / auto-not   */
/* ------------------------------------------------------------------ */

describe('Φ5 three-substrate soak', () => {
  function buildLayer(opts: {
    enableCUDA: boolean;
    resolvedFrom: 'explicit-on' | 'explicit-off' | 'auto-not-capable';
  }): CUDAHardwareLayer {
    return new CUDAHardwareLayer({
      enableCUDA: opts.enableCUDA,
      resolvedFrom: opts.resolvedFrom,
      sessionFactory: async () => makeCudaSession(),
    });
  }

  /** Drive the layer through a deterministic op cycle. */
  async function driveSoak(layer: CUDAHardwareLayer, steps: number) {
    if (layer.enableCUDA) await layer.loadKernels();
    const lineages: string[] = [];
    const resolvedFroms: string[] = [];
    let ghostEvents = 0;
    for (let step = 0; step < steps; step++) {
      const op = CUDA_KERNEL_OPS[step % CUDA_KERNEL_OPS.length] as CUDAKernelOp;
      try {
        const fakeInput: { input: OnnxTensor } = {
          input: { data: new Float32Array([step]), dims: [1] },
        };
        const result = await layer.accelerate(op, fakeInput);
        if (result._provenance.substrateLineage) {
          lineages.push(result._provenance.substrateLineage);
        }
        if (result._provenance.resolvedFrom) {
          resolvedFroms.push(result._provenance.resolvedFrom);
        }
      } catch (err) {
        if ((err as Error).name === 'GhostGPUError') ghostEvents++;
      }
    }
    return { lineages, resolvedFroms, ghostEvents };
  }

  it('explicit-on substrate produces explicit-on resolvedFrom on every successful leaf', async () => {
    const layer = buildLayer({ enableCUDA: true, resolvedFrom: 'explicit-on' });
    const out = await driveSoak(layer, 60);
    expect(out.ghostEvents).toBe(0);
    expect(out.resolvedFroms).toHaveLength(60);
    expect(new Set(out.resolvedFroms).size).toBe(1);
    expect(out.resolvedFroms[0]).toBe('explicit-on');
    expect(new Set(out.lineages).size).toBe(1);
    expect(out.lineages[0]).toBe('CUDAExecutionProvider/per-op');
  });

  it('explicit-off substrate refuses accelerate() — every step a graceful no-op (CPU stays sovereign)', async () => {
    const layer = buildLayer({ enableCUDA: false, resolvedFrom: 'explicit-off' });
    let throws = 0;
    for (let step = 0; step < 60; step++) {
      try {
        await layer.accelerate(CUDA_KERNEL_OPS[step % CUDA_KERNEL_OPS.length], {});
      } catch (err) {
        // The Φ1 disabled-state guard is the safety net here — every
        // call throws cleanly with a known message; downstream code is
        // expected to fall back to the CPU path. Zero ghost-GPU events,
        // zero silent fallbacks.
        expect((err as Error).message).toMatch(/Φ1 ladder default|enableCUDA/);
        throws++;
      }
    }
    expect(throws).toBe(60);
  });

  it('auto-not-capable substrate is byte-equivalent to explicit-off at the layer surface, but distinguishable in provenance', async () => {
    const explicitOff = buildLayer({ enableCUDA: false, resolvedFrom: 'explicit-off' });
    const autoNotCapable = buildLayer({ enableCUDA: false, resolvedFrom: 'auto-not-capable' });
    expect(explicitOff.enableCUDA).toBe(autoNotCapable.enableCUDA);
    expect(explicitOff.device).toBe(autoNotCapable.device);
    expect(explicitOff.streams).toBe(autoNotCapable.streams);
    // Φ5 — but the audit field diverges so MetaTuner can revive
    // strategies conditioned on the exact resolution path.
    expect(explicitOff.resolvedFrom).not.toBe(autoNotCapable.resolvedFrom);
  });

  it('all three substrate-class layers can coexist in one orchestration without cross-talk', async () => {
    const explicitOn = buildLayer({ enableCUDA: true, resolvedFrom: 'explicit-on' });
    const explicitOff = buildLayer({ enableCUDA: false, resolvedFrom: 'explicit-off' });
    const autoNotCapable = buildLayer({ enableCUDA: false, resolvedFrom: 'auto-not-capable' });

    if (explicitOn.enableCUDA) await explicitOn.loadKernels();

    const tensor: OnnxTensor = { data: new Float32Array([1]), dims: [1] };
    const onResult = await explicitOn.accelerate('encode', { input: tensor });
    expect(onResult._provenance.resolvedFrom).toBe('explicit-on');
    expect(onResult._provenance.verifiedDevice).toBe('CUDAExecutionProvider');

    await expect(explicitOff.accelerate('encode', { input: tensor })).rejects.toThrow();
    await expect(autoNotCapable.accelerate('encode', { input: tensor })).rejects.toThrow();
  });
});
