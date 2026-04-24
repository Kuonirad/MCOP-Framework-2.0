import {
  HolographicEtch,
  NovaNeoEncoder,
  PGoT,
  StigmergyV5,
} from '../core';

const makePGoT = (overrides?: { maxFanout?: number; confidenceFloor?: number }) => {
  const encoder = new NovaNeoEncoder({ dimensions: 8, normalize: true });
  const stigmergy = new StigmergyV5({ resonanceThreshold: 0.1 });
  const etch = new HolographicEtch({ confidenceFloor: overrides?.confidenceFloor ?? 0, auditLog: true });
  const graph = new PGoT(encoder, stigmergy, etch, { maxFanout: overrides?.maxFanout });
  return { encoder, stigmergy, etch, graph };
};

describe('PGoT', () => {
  it('addThought writes to Φ, Ψ, Λ, and Ω', () => {
    const { graph, stigmergy } = makePGoT();
    const synth = [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5];
    const node = graph.addThought('first thought', synth, 'alpha', { source: 'test' });

    expect(node.id).toBeTruthy();
    expect(node.label).toBe('alpha');
    expect(node.context).toHaveLength(8);
    expect(node.synthesisVector).toEqual(synth);
    expect(stigmergy.getMerkleRoot()).toBeTruthy();
    expect(graph.merkleRoot()).toEqual(stigmergy.getMerkleRoot());
  });

  it('addEdge connects thoughts and rejects unknown ids', () => {
    const { graph } = makePGoT();
    const a = graph.addThought('a', [1, 0, 0, 0, 0, 0, 0, 0]);
    const b = graph.addThought('b', [0, 1, 0, 0, 0, 0, 0, 0]);

    const edge = graph.addEdge(a.id, b.id, 0.7, 'implies');
    expect(edge).toEqual({ from: a.id, to: b.id, weight: 0.7, kind: 'implies' });

    expect(() => graph.addEdge('nope', b.id, 0.1)).toThrow(/unknown thought id/);
    expect(() => graph.addEdge(a.id, 'nope', 0.1)).toThrow(/unknown thought id/);
  });

  it('addEdge enforces maxFanout', () => {
    const { graph } = makePGoT({ maxFanout: 2 });
    const root = graph.addThought('root', [1, 0, 0, 0, 0, 0, 0, 0]);
    const c1 = graph.addThought('c1', [0, 1, 0, 0, 0, 0, 0, 0]);
    const c2 = graph.addThought('c2', [0, 0, 1, 0, 0, 0, 0, 0]);
    const c3 = graph.addThought('c3', [0, 0, 0, 1, 0, 0, 0, 0]);

    graph.addEdge(root.id, c1.id, 1);
    graph.addEdge(root.id, c2.id, 1);
    expect(() => graph.addEdge(root.id, c3.id, 1)).toThrow(/maxFanout exceeded/);
  });

  it('reasonFrom returns resonance steps over existing thoughts', () => {
    const { graph } = makePGoT();
    graph.addThought('the sky is blue', [1, 0, 0, 0, 0, 0, 0, 0], 'sky');
    graph.addThought('grass is green', [0, 1, 0, 0, 0, 0, 0, 0], 'grass');

    const steps = graph.reasonFrom('sky', 3);
    expect(steps.length).toBeGreaterThan(0);
    for (const step of steps) {
      expect(step.node.id).toBeTruthy();
      expect(typeof step.resonance).toBe('number');
      expect(typeof step.etched).toBe('boolean');
      expect(step.merkleHash).toBeTruthy();
    }
  });

  it('reasonFrom returns empty when no thoughts exist', () => {
    const { graph } = makePGoT();
    expect(graph.reasonFrom('anything', 3)).toEqual([]);
  });

  it('snapshot returns an immutable copy of the graph state', () => {
    const { graph } = makePGoT();
    const a = graph.addThought('a', [1, 0, 0, 0, 0, 0, 0, 0]);
    const b = graph.addThought('b', [0, 1, 0, 0, 0, 0, 0, 0]);
    graph.addEdge(a.id, b.id, 0.5);

    const snap = graph.snapshot();
    expect(snap.V.size).toBe(2);
    expect(snap.E).toHaveLength(1);
    expect(snap.Phi.size).toBe(2);
    expect(snap.Psi.size).toBe(2);
    expect(snap.Omega.length).toBeGreaterThan(0);
    expect(snap.tau).toMatch(/\d{4}-\d{2}-\d{2}T/);

    snap.E.push({ from: 'x', to: 'y', weight: 0 });
    expect(graph.snapshot().E).toHaveLength(1);
  });

  it('entropy returns NovaNeo estimate for known id and 0 for unknown', () => {
    const { graph, encoder } = makePGoT();
    const a = graph.addThought('entropy target', [1, 0, 0, 0, 0, 0, 0, 0]);

    const direct = encoder.estimateEntropy(a.context);
    expect(graph.entropy(a.id)).toBeCloseTo(direct, 10);
    expect(graph.entropy('missing-id')).toBe(0);
  });

  it('uses default maxFanout when config omits it', () => {
    const { graph } = makePGoT();
    const root = graph.addThought('root', [1, 0, 0, 0, 0, 0, 0, 0]);
    // Default is 16 — one child is well under the limit
    const child = graph.addThought('child', [0, 1, 0, 0, 0, 0, 0, 0]);
    expect(() => graph.addEdge(root.id, child.id, 1)).not.toThrow();
  });

  it('skips Ω commit when etch confidenceFloor rejects the delta', () => {
    const { graph } = makePGoT({ confidenceFloor: 10 });
    const node = graph.addThought('low-conf', [1, 1, 1, 1, 1, 1, 1, 1]);
    const snap = graph.snapshot();
    expect(snap.V.get(node.id)).toBeDefined();
    expect(snap.Omega).toHaveLength(0);
  });
});
