// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Kevin John Kull (Kuonirad) and KullAILABS MCOP Framework contributors
import { HolographicEtch, NovaNeoEncoder, PGoT, StigmergyV5 } from '../core';
import type { GovernedExpansionCandidate } from '../core/pGoT_types';

function makePGoT(backend: 'hash' | 'embedding', maxFanout = 16) {
  const encoder = new NovaNeoEncoder({ dimensions: 64, normalize: true, backend });
  const stigmergy = new StigmergyV5({ resonanceThreshold: 0.1 });
  const etch = new HolographicEtch({ confidenceFloor: 0, auditLog: true });
  return new PGoT(encoder, stigmergy, etch, { maxFanout });
}

const SYNTH = new Array(64).fill(0.1);
function candidates(texts: string[], energy = 2): GovernedExpansionCandidate[] {
  return texts.map((text) => ({ text, synthesisVector: SYNTH, energy }));
}

const SCATTERED = [
  'quantum entropy spirals outward',
  'lunar regolith rover telemetry',
  'byzantine consensus quorum proof',
  'helmholtz free energy descent',
];

describe('PGoT.governedExpand', () => {
  it('governs expansion by free energy under the embedding backend', () => {
    const graph = makePGoT('embedding');
    const root = graph.addThought('the cat sat on the mat', SYNTH, 'root');
    graph.addThought('a cat is on the mat', SYNTH, 'sibling'); // seed ensemble ≥ 2

    const outcome = graph.governedExpand(root.id, candidates(SCATTERED), {
      curiosityTemperature: 6,
    });

    expect(outcome.backend).toBe('embedding');
    expect(outcome.mode).toBe('free-energy');
    // Admitted nodes are actually wired into the graph under the parent.
    const snap = graph.snapshot();
    for (const node of outcome.admitted) expect(snap.V.has(node.id)).toBe(true);
    expect(snap.E.filter((e) => e.from === root.id)).toHaveLength(outcome.admitted.length);
    // Every governed admission lowered free energy.
    for (const step of outcome.trajectory) expect(step.deltaF).toBeLessThanOrEqual(1e-9);
  });

  it('falls back to administrative limits under the hash backend (degenerate signal)', () => {
    const graph = makePGoT('hash', 2);
    const root = graph.addThought('the cat sat on the mat', SYNTH, 'root');
    graph.addThought('a cat is on the mat', SYNTH, 'sibling');

    const outcome = graph.governedExpand(root.id, candidates(SCATTERED));

    expect(outcome.backend).toBe('hash');
    expect(outcome.mode).toBe('administrative-fallback');
    // maxFanout = 2 hard cap is respected even in fallback.
    expect(outcome.admitted.length).toBeLessThanOrEqual(2);
    expect(outcome.signal.informative).toBe(false);
  });

  it('respects maxFanout as a hard safety cap even when F would admit more', () => {
    const graph = makePGoT('embedding', 1);
    const root = graph.addThought('the cat sat on the mat', SYNTH, 'root');
    graph.addThought('a cat is on the mat', SYNTH, 'sibling');

    const outcome = graph.governedExpand(root.id, candidates(SCATTERED), {
      curiosityTemperature: 20, // very hot: F would admit many
    });
    expect(outcome.admitted.length).toBeLessThanOrEqual(1);
  });

  it('throws on an unknown parent id', () => {
    const graph = makePGoT('embedding');
    expect(() => graph.governedExpand('nope', candidates(SCATTERED))).toThrow(/unknown thought id/);
  });
});
