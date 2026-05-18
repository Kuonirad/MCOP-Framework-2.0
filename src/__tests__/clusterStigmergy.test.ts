import {
  ClusterOrchestrator,
  ClusterStigmergy,
  deserialiseTraceFromCluster,
  mergeRemoteRoots,
  sealClusterProvenanceEnvelope,
  StigmergyV5,
} from '../core';

describe('ClusterStigmergy + provenance', () => {
  it('mergeRemoteRoots is deterministic for sorted multiset', () => {
    const a = mergeRemoteRoots(['b', 'a', 'a']);
    const b = mergeRemoteRoots(['a', 'b']);
    expect(a).toBe(b);
    expect(a).toMatch(/^[a-f0-9]{64}$/);
  });

  it('sealClusterProvenanceEnvelope commits hop ordering', () => {
    const env = sealClusterProvenanceEnvelope([
      { nodeId: 'n1', merkleRoot: 'aa', clusterEpoch: 1 },
      { nodeId: 'n2', merkleRoot: 'bb', clusterEpoch: 1 },
    ]);
    expect(env.chainDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(env.hops).toHaveLength(2);
  });

  it('ingested remote trace participates in cluster resonance', () => {
    const localA = new StigmergyV5({ resonanceThreshold: 0.01, maxTraces: 64 });
    const clusterA = new ClusterStigmergy({ local: localA, localNodeId: 'node-a' });

    const localB = new StigmergyV5({ resonanceThreshold: 0.01, maxTraces: 64 });
    const traceOnB = localB.recordTrace([1, 0, 0], [1, 0, 0], { note: 'seed-b' });

    clusterA.ingestRemoteTrace('node-b', traceOnB);

    const r = clusterA.getClusterResonance([1, 0, 0]);
    expect(r.score).toBeGreaterThan(0);
    expect(r.trace?.id).toBe(traceOnB.id);
  });

  it('round-trips serialised trace payloads', () => {
    const st = new StigmergyV5({ resonanceThreshold: 0.5, maxTraces: 8 });
    const t = st.recordTrace([0.5, 0.5], [0.5, 0.5], { k: 1 });
    const cluster = new ClusterStigmergy({ local: st, localNodeId: 'x' });
    const wire = cluster.serialiseLocalTrace(t).trace as Record<string, unknown>;
    const back = deserialiseTraceFromCluster(wire);
    expect(back.id).toBe(t.id);
    expect(back.hash).toBe(t.hash);
  });

  it('ClusterOrchestrator merges gossiped roots', () => {
    const orch = new ClusterOrchestrator();
    orch.registerNode('n1', { cudaAvailable: false });
    orch.registerNode('n2', { cudaAvailable: true });
    const merged = orch.mergeGossipedRoots('local-root', { n1: 'a', n2: 'b' });
    expect(merged).toBe(mergeRemoteRoots(['local-root', 'a', 'b']));
    orch.onNodeFailure('n1');
    expect(orch.getEpoch()).toBeGreaterThan(0);
  });
});
