import {
  CUDA_KERNEL_OPS,
  CUDAHardwareLayer,
  GhostGPUError,
  parseExecutionProvider,
  type CUDAKernelOp,
  type OnnxInferenceSession,
  type OnnxTensor,
} from '../hardware/CUDAHardwareLayer';

/* ------------------------------------------------------------------ */
/* Test doubles                                                        */
/* ------------------------------------------------------------------ */

interface MockSessionOptions {
  /** Profiler payload that endProfiling() will return. JSON or JSON-lines. */
  profilerOutput: string;
  /** Outputs returned from `run()`. */
  outputs?: Record<string, OnnxTensor>;
  /** Hook to spy on each `run()` call. */
  onRun?: (feeds: Record<string, OnnxTensor>) => void;
}

function makeMockSession(options: MockSessionOptions): OnnxInferenceSession {
  return {
    async run(feeds) {
      options.onRun?.(feeds);
      return options.outputs ?? { output: { data: new Float32Array([0]), dims: [1] } };
    },
    endProfiling() {
      return options.profilerOutput;
    },
  };
}

function cudaProfilerOutput(): string {
  return JSON.stringify([
    { cat: 'Node', name: 'MatMul', args: { provider: 'CUDAExecutionProvider' } },
    { cat: 'Node', name: 'Add', args: { provider: 'CUDAExecutionProvider' } },
  ]);
}

function cpuProfilerOutput(): string {
  return JSON.stringify([
    { cat: 'Node', name: 'MatMul', args: { provider: 'CPUExecutionProvider' } },
  ]);
}

/* ------------------------------------------------------------------ */
/* parseExecutionProvider                                              */
/* ------------------------------------------------------------------ */

describe('parseExecutionProvider', () => {
  it('returns CUDAExecutionProvider when at least one kernel ran on CUDA', () => {
    expect(parseExecutionProvider(cudaProfilerOutput())).toBe('CUDAExecutionProvider');
  });

  it('returns CPUExecutionProvider when only CPU kernels are observed', () => {
    expect(parseExecutionProvider(cpuProfilerOutput())).toBe('CPUExecutionProvider');
  });

  it('prefers CUDA over CPU when both providers appear in the same trace', () => {
    const mixed = JSON.stringify([
      { args: { provider: 'CPUExecutionProvider' } },
      { args: { provider: 'CUDAExecutionProvider' } },
    ]);
    expect(parseExecutionProvider(mixed)).toBe('CUDAExecutionProvider');
  });

  it('parses JSON-lines profiler payloads', () => {
    const jsonLines = [
      JSON.stringify({ args: { provider: 'CUDAExecutionProvider' } }),
      JSON.stringify({ args: { provider: 'CUDAExecutionProvider' } }),
    ].join('\n');
    expect(parseExecutionProvider(jsonLines)).toBe('CUDAExecutionProvider');
  });

  it('honours the alternate `execution_provider` schema some ORT builds emit', () => {
    const alt = JSON.stringify([{ args: { execution_provider: 'CUDAExecutionProvider' } }]);
    expect(parseExecutionProvider(alt)).toBe('CUDAExecutionProvider');
  });

  it('returns "unknown" for empty / non-string / unparseable input', () => {
    expect(parseExecutionProvider('')).toBe('unknown');
    expect(parseExecutionProvider('not json at all')).toBe('unknown');
    // Cast through `unknown` because the runtime check has to handle non-strings.
    expect(parseExecutionProvider(null as unknown as string)).toBe('unknown');
  });

  it('passes through a single non-standard provider verbatim', () => {
    const custom = JSON.stringify([{ args: { provider: 'WebGPUExecutionProvider' } }]);
    expect(parseExecutionProvider(custom)).toBe('WebGPUExecutionProvider');
  });

  it('never throws and never returns CUDA unless a CUDA token is present (property)', () => {
    // Lightweight fuzz sibling of the soak-harness property test — same safety
    // invariant on the TypeScript parseExecutionProvider implementation.
    const samples: unknown[] = [
      '',
      'not json',
      '{',
      null,
      undefined,
      '[]',
      '{}',
      JSON.stringify([{ args: { provider: 'CPUExecutionProvider' } }]),
      JSON.stringify([{ args: { execution_provider: 'TensorrtExecutionProvider' } }]),
      JSON.stringify([{ args: { provider: 'DmlExecutionProvider' } }]),
      JSON.stringify([
        { args: { provider: 'CPUExecutionProvider' } },
        { args: { provider: 'CUDAExecutionProvider' } },
      ]),
      JSON.stringify([[{ args: { provider: 'CPUExecutionProvider' } }]]),
      '[{"args":{"provider":"CPUExecutionProvider"}}\n{"args":{"provider":"CPUExecutionProvider"}}]',
    ];
    let rng = 0xA5A5_5A5A;
    const next = () => {
      rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0;
      return rng;
    };
    for (let i = 0; i < 30; i += 1) {
      const body = JSON.stringify({
        args: {
          provider: next() % 5 === 0 ? 'CUDAExecutionProvider' : 'CPUExecutionProvider',
        },
        nest: Array.from({ length: next() % 4 }, (_, j) => ({ id: j, args: { provider: 'CPUExecutionProvider' } })),
      });
      samples.push(body);
      samples.push(body.slice(0, 1 + (next() % Math.max(1, body.length))));
    }
    for (const sample of samples) {
      let result = 'sentinel';
      expect(() => {
        result = parseExecutionProvider(sample as string);
      }).not.toThrow();
      const raw = sample == null ? '' : String(sample);
      if (!raw.includes('CUDAExecutionProvider')) {
        expect(result).not.toBe('CUDAExecutionProvider');
      }
      expect(typeof result).toBe('string');
    }
  });
});

/* ------------------------------------------------------------------ */
/* Disabled state (Φ1 default)                                         */
/* ------------------------------------------------------------------ */

describe('CUDAHardwareLayer (disabled / default state)', () => {
  it('defaults to enableCUDA=false and exposes device / kernelDir defaults', () => {
    const layer = new CUDAHardwareLayer();
    expect(layer.enableCUDA).toBe(false);
    expect(layer.device).toBe('cuda:0');
    expect(layer.kernelDir).toBe('./models');
    expect(layer.loadedKernels).toEqual([]);
  });

  it('treats loadKernels() as a no-op when disabled', async () => {
    const layer = new CUDAHardwareLayer();
    await layer.loadKernels();
    expect(layer.loadedKernels).toEqual([]);
  });

  it('throws on accelerate() when disabled, with a Φ1-aware message', async () => {
    const layer = new CUDAHardwareLayer({ enableCUDA: false });
    await expect(layer.accelerate('encode', {})).rejects.toThrow(/Φ1 ladder default/);
  });
});

/* ------------------------------------------------------------------ */
/* loadKernels happy path                                              */
/* ------------------------------------------------------------------ */

describe('CUDAHardwareLayer.loadKernels()', () => {
  it('builds one ONNX session per spec kernel via sessionFactory injection', async () => {
    const calls: { op: CUDAKernelOp; modelPath: string }[] = [];
    const layer = new CUDAHardwareLayer({
      enableCUDA: true,
      kernelDir: '/tmp/kernels',
      sessionFactory: async (op, modelPath) => {
        calls.push({ op, modelPath });
        return makeMockSession({ profilerOutput: cudaProfilerOutput() });
      },
    });

    await layer.loadKernels();

    expect(layer.loadedKernels).toEqual(CUDA_KERNEL_OPS);
    expect(calls).toHaveLength(CUDA_KERNEL_OPS.length);
    // model paths follow the `mcop_<op>.onnx` convention, joined under kernelDir.
    expect(calls.map((c) => c.modelPath)).toEqual(
      CUDA_KERNEL_OPS.map((op) => `/tmp/kernels/mcop_${op}.onnx`),
    );
  });

  it('is idempotent — repeated loadKernels() calls only build the sessions once', async () => {
    const factory = jest.fn(async () => makeMockSession({ profilerOutput: cudaProfilerOutput() }));
    const layer = new CUDAHardwareLayer({ enableCUDA: true, sessionFactory: factory });

    await layer.loadKernels();
    await layer.loadKernels();
    await layer.loadKernels();

    expect(factory).toHaveBeenCalledTimes(CUDA_KERNEL_OPS.length);
  });
});

/* ------------------------------------------------------------------ */
/* accelerate happy path + verifiedDevice gate                         */
/* ------------------------------------------------------------------ */

describe('CUDAHardwareLayer.accelerate()', () => {
  it('seals successful CUDA runs with verifiedDevice + substrateLineage provenance', async () => {
    const layer = new CUDAHardwareLayer({
      enableCUDA: true,
      device: 'cuda:7',
      sessionFactory: async () =>
        makeMockSession({
          profilerOutput: cudaProfilerOutput(),
          outputs: { output: { data: new Float32Array([0.5, 1.5]), dims: [2] } },
        }),
    });
    await layer.loadKernels();

    const result = await layer.accelerate('graphAggregate', {
      input: { data: new Float32Array([1, 2, 3]), dims: [3] },
    });

    expect(result._device).toBe('cuda:7');
    expect(result._provenance.mode).toBe('cuda');
    expect(result._provenance.kernel).toBe('proteome-graph-step');
    expect(result._provenance.provider).toBe('CUDAHardwareLayer:onnx');
    expect(result._provenance.verifiedDevice).toBe('CUDAExecutionProvider');
    // Φ3 substrate-lineage tag combines the verified provider with the
    // stream-allocation regime so MetaTuner can revive on lineage parity.
    expect(result._provenance.substrateLineage).toBe('CUDAExecutionProvider/per-op');
    expect(result._provenance.requestedDevice).toBe('cuda:7');
    expect(result._provenance.cudaGraphCaptured).toBe(true);
    expect(result._provenance.merkleRoot).toMatch(/^[a-f0-9]{64}$/);
    expect(typeof result._provenance.durationMs).toBe('number');
    expect(result.outputs.output.dims).toEqual([2]);
  });

  it('maps every spec kernel name to its canonical kebab-case operation', async () => {
    const layer = new CUDAHardwareLayer({
      enableCUDA: true,
      sessionFactory: async () => makeMockSession({ profilerOutput: cudaProfilerOutput() }),
    });
    await layer.loadKernels();

    const expected: Record<CUDAKernelOp, string> = {
      encode: 'nova-neo-encode',
      graphAggregate: 'proteome-graph-step',
      holographicUpdate: 'holographic-write',
      cosineRecall: 'cosine-recall',
      evolveScore: 'nova-evolve-score',
      homeostasis: 'homeostasis',
    };

    for (const op of CUDA_KERNEL_OPS) {
      const result = await layer.accelerate(op, {});
      expect(result._provenance.kernel).toBe(expected[op]);
    }
  });

  it('Φ3 streams=shared override flows into substrateLineage and the streams getter', async () => {
    const layer = new CUDAHardwareLayer({
      enableCUDA: true,
      streams: 'shared',
      sessionFactory: async () => makeMockSession({ profilerOutput: cudaProfilerOutput() }),
    });
    expect(layer.streams).toBe('shared');
    await layer.loadKernels();
    const result = await layer.accelerate('cosineRecall', {});
    expect(result._provenance.substrateLineage).toBe('CUDAExecutionProvider/shared');
  });

  it('Φ3 streams default to per-op when omitted', () => {
    const layer = new CUDAHardwareLayer({ enableCUDA: false });
    expect(layer.streams).toBe('per-op');
  });

  it('throws GhostGPUError when the profiler shows a CPU fallback for a CUDA-requested op', async () => {
    const layer = new CUDAHardwareLayer({
      enableCUDA: true,
      device: 'cuda:0',
      sessionFactory: async () => makeMockSession({ profilerOutput: cpuProfilerOutput() }),
    });
    await layer.loadKernels();

    await expect(layer.accelerate('encode', {})).rejects.toBeInstanceOf(GhostGPUError);
    await expect(layer.accelerate('encode', {})).rejects.toMatchObject({
      op: 'encode',
      requestedDevice: 'cuda:0',
      verifiedProvider: 'CPUExecutionProvider',
    });
  });

  it('throws GhostGPUError when the profiler payload is empty / unparseable (treated as silent fallback)', async () => {
    const layer = new CUDAHardwareLayer({
      enableCUDA: true,
      sessionFactory: async () => makeMockSession({ profilerOutput: '' }),
    });
    await layer.loadKernels();

    await expect(layer.accelerate('homeostasis', {})).rejects.toBeInstanceOf(GhostGPUError);
  });

  it('throws when accelerate() is called before loadKernels()', async () => {
    const layer = new CUDAHardwareLayer({
      enableCUDA: true,
      sessionFactory: async () => makeMockSession({ profilerOutput: cudaProfilerOutput() }),
    });
    await expect(layer.accelerate('cosineRecall', {})).rejects.toThrow(/kernel not loaded/);
  });

  it('forwards feeds verbatim to the underlying session', async () => {
    const seen: Record<string, OnnxTensor>[] = [];
    const layer = new CUDAHardwareLayer({
      enableCUDA: true,
      sessionFactory: async () =>
        makeMockSession({
          profilerOutput: cudaProfilerOutput(),
          onRun: (feeds) => seen.push(feeds),
        }),
    });
    await layer.loadKernels();
    const tensor: OnnxTensor = { data: new Float32Array([7]), dims: [1] };

    await layer.accelerate('evolveScore', { input: tensor });
    expect(seen).toHaveLength(1);
    expect(seen[0].input).toBe(tensor);
  });
});
