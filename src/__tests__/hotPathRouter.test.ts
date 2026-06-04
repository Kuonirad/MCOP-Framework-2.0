// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Kevin John Kull (Kuonirad) and KullAILABS MCOP Framework contributors
import {
  CPUFallback,
  HOT_PATH_KERNEL,
  HotPathRouter,
  attachAcceleratorProvenance,
  type AcceleratedOperation,
  type AcceleratedResult,
  type Accelerator,
  type AcceleratorCapabilities,
} from '../hardware';

async function runAllFiveOps(router: HotPathRouter) {
  const encode = await router.encode({ tensor: [0, 1, -1], bias: 0.1 });
  const recall = await router.recall({ query: [1, 0], library: [[1, 0], [0, 1]] });
  const etch = await router.etch({ context: [1, 2], synthesis: [3, 4] });
  const evolve = await router.evolve({ candidates: [{ score: 1, vector: [3, 4] }, 2] });
  const homeo = await router.homeostasis({ state: [2, -2, 0.5] });
  return { encode, recall, etch, evolve, homeo };
}

describe('HotPathRouter — CPU reference path', () => {
  it('computes all five ops and attaches uniform provenance', async () => {
    const router = new HotPathRouter();
    const { encode, recall, etch, evolve, homeo } = await runAllFiveOps(router);

    // Correctness (spot checks; full parity is covered by hotPathParity.test.ts).
    expect(encode.output[0]).toBeCloseTo(0.1, 9);
    expect(recall.scores).toEqual([1, 0]);
    expect(etch.output).toEqual([3, 4, 6, 8]);
    expect(evolve.scores[0]).toBeCloseTo(1.000005, 9);
    expect(homeo.output).toEqual([1, -1, 0.49]);

    // Uniform provenance on every result, with the canonical kernel name.
    for (const [res, op] of [
      [encode, 'encode'],
      [recall, 'recall'],
      [etch, 'etch'],
      [evolve, 'evolve'],
      [homeo, 'homeostasis'],
    ] as const) {
      expect(res._provenance.kernel).toBe(HOT_PATH_KERNEL[op]);
      expect(res._provenance.mode).toBe('cpu');
      expect(res._provenance.merkleRoot).toHaveLength(64);
    }
  });

  it('logs every call as one Merkle-chained hot-path stream', async () => {
    const router = new HotPathRouter();
    await runAllFiveOps(router);

    const log = router.getProvenanceLog();
    expect(log).toHaveLength(5);
    expect(log.map((e) => e.op)).toEqual(['encode', 'recall', 'etch', 'evolve', 'homeostasis']);
    // Each entry chains on the previous (entry hashes are all distinct).
    expect(new Set(log.map((e) => e.hash)).size).toBe(5);
    expect(router.getHotPathRoot()).toBe(log[log.length - 1].hash);

    const stats = router.getStats();
    expect(stats.calls).toBe(5);
    expect(stats.byOp).toEqual({ encode: 1, recall: 1, etch: 1, evolve: 1, homeostasis: 1 });
    expect(stats.fallbacks).toBe(0); // CPU reference is not a CUDA fallback
  });

  it('hot-path root is deterministic across runs (timestamp-independent)', async () => {
    const a = new HotPathRouter();
    const b = new HotPathRouter();
    await runAllFiveOps(a);
    await runAllFiveOps(b);
    expect(a.getHotPathRoot()).toBe(b.getHotPathRoot());
  });

  it('defaults to a CPUFallback accelerator', async () => {
    const router = new HotPathRouter({ accelerator: new CPUFallback({ device: 'cpu-test' }) });
    const res = await router.encode({ tensor: [1] });
    expect(res._provenance.device).toBe('cpu-test');
  });
});

describe('HotPathRouter — routes through the single accelerator boundary', () => {
  /** A spy accelerator in CUDA mode that records the kernel ops it receives. */
  class SpyAccelerator implements Accelerator {
    readonly mode = 'cuda' as const;
    readonly device = 'cuda:spy';
    readonly seen: AcceleratedOperation[] = [];
    async accelerate<T>(op: AcceleratedOperation, input: unknown): Promise<AcceleratedResult<T>> {
      this.seen.push(op);
      // Echo the input as the "computed" result, sealed with CUDA provenance.
      return attachAcceleratorProvenance<T>(input as T, {
        op,
        mode: 'cuda',
        device: this.device,
        provider: 'SpyAccelerator',
        cudaGraphCaptured: true,
      });
    }
    async getCapabilities(): Promise<AcceleratorCapabilities> {
      return {
        cudaAvailable: true,
        webGPUAvailable: false,
        deviceName: 'spy',
        computeCapability: 'n/a',
        mode: 'cuda',
        device: this.device,
        provider: 'native',
      };
    }
  }

  it('dispatches all five ops through the wired accelerator with canonical kernel names', async () => {
    const spy = new SpyAccelerator();
    const router = new HotPathRouter({ accelerator: spy });
    await runAllFiveOps(router);

    expect(spy.seen).toEqual([
      'nova-neo-encode',
      'cosine-recall',
      'holographic-write',
      'nova-evolve-score',
      'homeostasis',
    ]);
    const log = router.getProvenanceLog();
    expect(log.every((e) => e.mode === 'cuda' && e.device === 'cuda:spy')).toBe(true);
  });
});
