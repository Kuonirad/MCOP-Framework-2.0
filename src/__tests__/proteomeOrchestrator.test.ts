// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Kevin John Kull (Kuonirad) and KullAILABS MCOP Framework contributors
/**
 * @fileoverview Proteome layer regression suite — covers:
 *   - 150-node sparse graph construction (deterministic from seed).
 *   - Single-step / multi-step evolution on CPU.
 *   - Edge-of-chaos knob clamping + mutation behaviour.
 *   - CUDA integration via the in-process layer's `graphAggregate` op
 *     with an injected mock session.
 *   - Provenance leaf shape (kernel name, mode, knobs, Merkle root).
 *   - MetaTuner integration: accepted homeostasis / mutationTemperature
 *     mutations propagate immediately to a wired proteome.
 */

import {
  CUDAHardwareLayer,
  type OnnxInferenceSession,
} from '../hardware/CUDAHardwareLayer';
import {
  DEFAULT_PROTEOME_CONFIG,
  PROTEOME_PAYOFF_MATRIX,
  ProteomeOrchestrator,
  type ProteomeStepResult,
} from '../proteome';
import {
  DEFAULT_NOVA_EVOLVE_CONFIG,
  HolographicEtch,
  NovaEvolveTuner,
  StigmergyV5,
} from '../core';

function makeProteome(overrides = {}) {
  return new ProteomeOrchestrator({
    nodeCount: 150,
    stateDim: 8,
    avgDegree: 6,
    seed: 0xc0ffee,
    homeostasis: 0.5,
    mutationTemperature: 0.5,
    ...overrides,
  });
}

describe('ProteomeOrchestrator — construction', () => {
  it('builds a 150-node sparse graph by default', () => {
    const p = new ProteomeOrchestrator();
    expect(p.nodeCount).toBe(150);
    expect(p.config.stateDim).toBe(DEFAULT_PROTEOME_CONFIG.stateDim);
    expect(p.config.avgDegree).toBe(DEFAULT_PROTEOME_CONFIG.avgDegree);
    // sparse — edge count should be on the order of nodeCount * avgDegree
    expect(p.edgeCount).toBeGreaterThanOrEqual(150);
    expect(p.edgeCount).toBeLessThan(150 * 12);
  });

  it('graph topology is deterministic from the seed', () => {
    const a = makeProteome({ seed: 1234 });
    const b = makeProteome({ seed: 1234 });
    expect(a.graph.edgeCount).toBe(b.graph.edgeCount);
    expect(Array.from(a.graph.rowPtr)).toEqual(Array.from(b.graph.rowPtr));
    expect(Array.from(a.graph.colIdx)).toEqual(Array.from(b.graph.colIdx));
    expect(Array.from(a.graph.weights)).toEqual(Array.from(b.graph.weights));
    expect(Array.from(a.graph.edgeKinds)).toEqual(Array.from(b.graph.edgeKinds));
  });

  it('a different seed produces a structurally different graph', () => {
    const a = makeProteome({ seed: 1 });
    const b = makeProteome({ seed: 2 });
    expect(Array.from(a.graph.colIdx)).not.toEqual(Array.from(b.graph.colIdx));
  });

  it('clamps knobs to [0, 1] at construction', () => {
    const p = makeProteome({ homeostasis: 99, mutationTemperature: -3 });
    expect(p.homeostasis).toBe(1);
    expect(p.mutationTemperature).toBe(0);
  });

  it('exposes the immutable payoff matrix', () => {
    const p = new ProteomeOrchestrator();
    expect(p.getPayoffMatrix()).toBe(PROTEOME_PAYOFF_MATRIX);
    expect(Object.isFrozen(PROTEOME_PAYOFF_MATRIX)).toBe(true);
  });
});

describe('ProteomeOrchestrator — CPU step', () => {
  it('produces a complete step result with frozen provenance', async () => {
    const p = makeProteome();
    const result: ProteomeStepResult = await p.step();
    expect(result.step).toBe(1);
    expect(result.merkleRoot).toMatch(/^[a-f0-9]{64}$/);
    expect(result.provenance.kernel).toBe('proteome-cpu-step');
    expect(result.provenance.mode).toBe('cpu');
    expect(result.provenance.device).toBe('cpu');
    expect(Object.isFrozen(result.provenance)).toBe(true);
    expect(result.provenance.knobs.homeostasis).toBeCloseTo(0.5);
    expect(result.provenance.knobs.mutationTemperature).toBeCloseTo(0.5);
    expect(typeof result.provenance.durationMs).toBe('number');
  });

  it('Merkle root chain advances after each step', async () => {
    const p = makeProteome();
    const a = await p.step();
    const b = await p.step();
    expect(a.merkleRoot).not.toBe(b.merkleRoot);
    expect(p.merkleRoot).toBe(b.merkleRoot);
    expect(p.stepCount).toBe(2);
  });

  it('byte-stable across runs given the same seed + knobs (mutationTemperature=0)', async () => {
    const a = makeProteome({ seed: 7, mutationTemperature: 0 });
    const b = makeProteome({ seed: 7, mutationTemperature: 0 });
    const aSeq = await a.runSteps(10);
    const bSeq = await b.runSteps(10);
    expect(aSeq.map((s) => s.merkleRoot)).toEqual(bSeq.map((s) => s.merkleRoot));
  });

  it('reset() rewinds step count + Merkle root + node energies', async () => {
    const p = makeProteome();
    await p.runSteps(5);
    expect(p.stepCount).toBe(5);
    p.reset();
    expect(p.stepCount).toBe(0);
    expect(p.merkleRoot).toBeUndefined();
    for (const n of p.snapshot().nodes) expect(n.energy).toBeCloseTo(1.0);
  });
});

describe('ProteomeOrchestrator — edge-of-chaos behaviour', () => {
  it('high mutationTemperature increases per-node state variance vs low', async () => {
    const chaos = makeProteome({ mutationTemperature: 0.95, homeostasis: 0, seed: 42 });
    const order = makeProteome({ mutationTemperature: 0.02, homeostasis: 0.9, seed: 42 });
    await chaos.runSteps(15);
    await order.runSteps(15);
    const chaosVariance = stateVariance(chaos);
    const orderVariance = stateVariance(order);
    expect(chaosVariance).toBeGreaterThan(orderVariance);
  });

  it('strong homeostasis pulls energies back toward equilibrium', async () => {
    const p = makeProteome({ homeostasis: 0.95, mutationTemperature: 0, seed: 11 });
    // Perturb energies by hand to force a pull-back signal.
    const snap = p.snapshot();
    for (let i = 0; i < snap.nodes.length; i += 1) {
      // mutate through the orchestrator's internal node list — snapshot
      // node copies are frozen, but the orchestrator's owned objects
      // remain mutable.
      const direct = (p as unknown as { _nodes: { energy: number }[] })._nodes[i];
      direct.energy = i % 2 === 0 ? 0.1 : 1.9;
    }
    await p.runSteps(20);
    const energies = p.snapshot().nodes.map((n) => n.energy);
    const mean = energies.reduce((a, b) => a + b, 0) / energies.length;
    expect(mean).toBeCloseTo(1.0, 0);
  });
});

describe('ProteomeOrchestrator — CUDA integration', () => {
  function makeCudaSession(): OnnxInferenceSession {
    return {
      async run(feeds) {
        const input = feeds.input.data as Float32Array;
        // identity-passthrough: model returns the input verbatim so the
        // CSR aggregation behaves identically to the CPU reference.
        const rowPtr = feeds.rowPtr.data as Int32Array;
        const colIdx = feeds.colIdx.data as Int32Array;
        const weights = feeds.weights.data as Float32Array;
        const n = rowPtr.length - 1;
        const out = new Float32Array(n);
        for (let v = 0; v < n; v += 1) {
          const start = rowPtr[v];
          const end = rowPtr[v + 1];
          if (end <= start) {
            out[v] = input[v];
            continue;
          }
          let s = 0;
          for (let k = start; k < end; k += 1) s += weights[k] * input[colIdx[k]];
          out[v] = s / (end - start);
        }
        return { output: { data: out, dims: [n] } };
      },
      endProfiling() {
        return JSON.stringify([{ args: { provider: 'CUDAExecutionProvider' } }]);
      },
    };
  }

  it('routes graphAggregate through CUDAHardwareLayer when enabled', async () => {
    const cudaLayer = new CUDAHardwareLayer({
      enableCUDA: true,
      device: 'cuda:3',
      sessionFactory: async () => makeCudaSession(),
    });
    await cudaLayer.loadKernels();

    const p = new ProteomeOrchestrator(
      { nodeCount: 32, stateDim: 4, avgDegree: 3, seed: 9, mutationTemperature: 0, homeostasis: 0 },
      { cudaLayer },
    );
    const result = await p.step();
    expect(result.provenance.kernel).toBe('proteome-graph-step');
    expect(result.provenance.mode).toBe('cuda');
    expect(result.provenance.device).toBe('cuda:3');
    expect(result.provenance.verifiedDevice).toBe('CUDAExecutionProvider');
    expect(result.provenance.substrateLineage).toBe('CUDAExecutionProvider/per-op');
  });

  it('falls back to CPU when the layer is disabled', async () => {
    const cudaLayer = new CUDAHardwareLayer({ enableCUDA: false });
    const p = new ProteomeOrchestrator({ nodeCount: 16, stateDim: 4, seed: 5 }, { cudaLayer });
    const result = await p.step();
    expect(result.provenance.mode).toBe('cpu');
    expect(result.provenance.kernel).toBe('proteome-cpu-step');
    expect(result.provenance.resolvedFrom).toBe('explicit-off');
  });
});

describe('ProteomeOrchestrator + NovaEvolveTuner integration', () => {
  it('accepted mutationTemperature / homeostasis mutations propagate to the proteome', async () => {
    const proteome = makeProteome({ homeostasis: 0.5, mutationTemperature: 0.5 });
    const stigmergy = new StigmergyV5({ resonanceThreshold: 0, maxTraces: 64 });
    const etch = new HolographicEtch({ confidenceFloor: 0, maxEtches: 64 });
    const tuner = new NovaEvolveTuner(
      { stigmergy, etch, proteome },
      DEFAULT_NOVA_EVOLVE_CONFIG,
      {
        metaTuneInterval: 1,
        projectedGainThreshold: 0.0001,
        // High-entropy regime drives the homeostasisTarget down to
        // 0.4 (chaotic-regime needs less pull-back). The proposal
        // moves the genome toward that target — −0.08 after clamp.
        proposalGenerator: () => ({
          knob: 'homeostasis',
          delta: -0.08,
          rationale: 'edge-of-chaos: relax pull-back for high-entropy proteome',
        }),
      },
    );

    const before = proteome.homeostasis;
    const decision = await tuner.maybeMetaTune([
      { accuracy: 0.55, novelty: 0.35, entropy: 0.78, latencyMs: 5.5, confidence: 0.62 },
    ]);
    expect(decision?.accepted).toBe(true);
    expect(proteome.homeostasis).toBeCloseTo(before - 0.08, 5);
    expect(proteome.mutationTemperature).toBeCloseTo(DEFAULT_NOVA_EVOLVE_CONFIG.mutationTemperature);
  });

  it('initial constructor call also primes the proteome from the genome', () => {
    const proteome = makeProteome({ homeostasis: 0.1, mutationTemperature: 0.1 });
    const stigmergy = new StigmergyV5();
    const etch = new HolographicEtch();
    new NovaEvolveTuner({ stigmergy, etch, proteome }, DEFAULT_NOVA_EVOLVE_CONFIG);
    expect(proteome.homeostasis).toBeCloseTo(DEFAULT_NOVA_EVOLVE_CONFIG.homeostasis);
    expect(proteome.mutationTemperature).toBeCloseTo(DEFAULT_NOVA_EVOLVE_CONFIG.mutationTemperature);
  });
});

function stateVariance(p: ProteomeOrchestrator): number {
  const all: number[] = [];
  for (const n of p.snapshot().nodes) for (const x of n.state) all.push(x);
  const mean = all.reduce((a, b) => a + b, 0) / all.length;
  let s = 0;
  for (const x of all) s += (x - mean) * (x - mean);
  return s / all.length;
}
