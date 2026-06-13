// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Kevin John Kull (Kuonirad) and KullAILABS MCOP Framework contributors
/**
 * Falsifier: ΔF-governed expansion vs fixed fanout on a cost–quality frontier.
 *
 * Minimizing F = U − T·S maximizes T·S, so free-energy descent optimizes
 * *coverage per unit budget*: it prefers thoughts that raise ensemble entropy
 * (reach new regions of the hypothesis space) and halts when the marginal
 * entropy gain no longer offsets the per-node budget. The falsifiable claim is
 * therefore: **for the same admitted-node budget, ΔF-governance covers at least
 * as many distinct semantic clusters as fixed fanout, and it reaches full
 * coverage at no greater cost.** This test pins that claim and emits the
 * frontier artifact `docs/benchmarks/free-energy-frontier.json`.
 *
 * If a future change makes fixed fanout dominate, this test fails — which is the
 * point of a falsifier.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';

import { NovaNeoEncoder } from '../core/novaNeoEncoder';
import { governExpansion, type GovernedThought } from '../core/freeEnergyGovernor';

// Four semantic clusters, four paraphrases each. Order is cluster-grouped — the
// natural way thoughts arrive (elaborate a topic, then move on).
const CLUSTERS: Record<string, string[]> = {
  cats: [
    'the cat sat on the mat',
    'a cat is on the mat',
    'cats sit on soft mats',
    'the mat holds a sleeping cat',
  ],
  space: [
    'lunar regolith rover telemetry',
    'the moon rover crosses regolith',
    'telemetry from the lunar lander',
    'rovers map fine moon dust',
  ],
  consensus: [
    'byzantine consensus quorum proof',
    'the quorum reaches consensus',
    'byzantine fault tolerant agreement',
    'consensus among distributed nodes',
  ],
  thermo: [
    'helmholtz free energy descent',
    'free energy relaxes to equilibrium',
    'entropy and internal energy balance',
    'the ensemble minimizes free energy',
  ],
};

const encoder = new NovaNeoEncoder({ dimensions: 64, normalize: true, backend: 'embedding' });

interface Labelled extends GovernedThought {
  cluster: string;
}

function buildPool(): Labelled[] {
  const pool: Labelled[] = [];
  let i = 0;
  for (const [cluster, texts] of Object.entries(CLUSTERS)) {
    for (const text of texts) {
      pool.push({ id: `n${i++}`, cluster, energy: 1, stateVector: encoder.encode(text) });
    }
  }
  return pool;
}

function coverage(nodes: readonly Labelled[]): number {
  return new Set(nodes.map((n) => n.cluster)).size;
}

describe('Falsifier — ΔF-governed expansion vs fixed fanout', () => {
  const pool = buildPool();
  const totalClusters = Object.keys(CLUSTERS).length;
  // Seed with two thoughts from one cluster (a narrow starting point).
  const seed = pool.slice(0, 2);
  const candidates = pool.slice(2);
  const byId = new Map(pool.map((n) => [n.id, n]));

  // Fixed-fanout frontier: admit the first k candidates in arrival order.
  const fixedFrontier = candidates.map((_, k) => {
    const admitted = candidates.slice(0, k + 1);
    return { cost: admitted.length, coverage: coverage([...seed, ...admitted]) };
  });

  // ΔF-governed frontier: the admission order chosen by free-energy descent.
  const governed = governExpansion(seed, candidates, { curiosityTemperature: 4 });
  const governedAdmitted = governed.accepted.map((a) => byId.get(a.id) as Labelled);
  const governedFrontier = governedAdmitted.map((_, k) => {
    const admitted = governedAdmitted.slice(0, k + 1);
    return { cost: admitted.length, coverage: coverage([...seed, ...admitted]) };
  });

  test('the free-energy signal is informative on this semantic pool', () => {
    expect(governed.mode).toBe('free-energy');
  });

  test('ΔF-governance dominates fixed fanout on coverage-per-cost', () => {
    // At every cost the governor actually used, its coverage ≥ fixed fanout's.
    for (const point of governedFrontier) {
      const fixedAt = fixedFrontier.find((f) => f.cost === point.cost);
      if (fixedAt) expect(point.coverage).toBeGreaterThanOrEqual(fixedAt.coverage);
    }
  });

  test('ΔF-governance reaches full cluster coverage at no greater cost', () => {
    const govFull = governedFrontier.find((p) => p.coverage === totalClusters);
    const fixedFull = fixedFrontier.find((p) => p.coverage === totalClusters);
    expect(govFull).toBeDefined();
    // Fixed fanout, taking cluster-grouped arrivals in order, needs more nodes
    // to touch every cluster than diversity-seeking free-energy descent.
    if (fixedFull && govFull) expect(govFull.cost).toBeLessThanOrEqual(fixedFull.cost);
  });

  test('emits the cost–quality frontier artifact', () => {
    const outDir = path.resolve(__dirname, '..', '..', 'docs', 'benchmarks');
    mkdirSync(outDir, { recursive: true });
    const artifact = {
      generatedBy: 'src/__tests__/freeEnergyGovernor.frontier.test.ts',
      note: 'Deterministic. Minimizing F = U − T·S optimizes coverage per unit budget.',
      backend: 'embedding',
      curiosityTemperature: 4,
      totalClusters,
      seedClusters: coverage(seed),
      governed: {
        haltReason: governed.haltReason,
        admittedClusters: governedAdmitted.map((n) => n.cluster),
        frontier: governedFrontier,
      },
      fixedFanout: { frontier: fixedFrontier },
    };
    writeFileSync(
      path.join(outDir, 'free-energy-frontier.json'),
      `${JSON.stringify(artifact, null, 2)}\n`,
    );
    expect(governedFrontier.length).toBeGreaterThan(0);
  });
});
