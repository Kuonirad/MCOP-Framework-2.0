/**
 * v3.0 Distributed cluster mode — integration coverage.
 *
 * Drives a 3-node cluster end-to-end against the in-process gossip
 * bus and asserts the four invariants documented in
 * `docs/DISTRIBUTED_CLUSTER_MODE.md`:
 *
 *   1. Single-node determinism is preserved when the cluster size is 1.
 *   2. A trace written on node A is observed by nodes B and C with
 *      matching cluster Merkle roots once gossip has drained.
 *   3. `mergeRemoteRoots()` produces byte-identical cluster roots
 *      from every node after convergence.
 *   4. Human veto on node A propagates to nodes B and C and removes
 *      the trace from their resonance surface.
 */

import {
  ClusterStigmergy,
  InMemoryGossipBus,
  ClusterOrchestrator,
  mergeClusterRoots,
  type ClusterReplayBundle,
  type ClusterReplayTrace,
  type ClusterMerkleRoot,
} from '../cluster';
import { canonicalDigest } from '../core/canonicalEncoding';
import type { PheromoneTrace } from '../core/types';

async function drain(): Promise<void> {
  // Schedule a microtask, then a macrotask, to let queueMicrotask
  // deliveries propagate through all subscribers. Uses setTimeout so
  // the helper works in both Node and jsdom test environments.
  await Promise.resolve();
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  await Promise.resolve();
}

function spawnCluster(nodes: ReadonlyArray<string>) {
  const bus = new InMemoryGossipBus();
  for (const id of nodes) bus.register(id);
  const stigmergies = new Map<string, ClusterStigmergy>();
  for (const id of nodes) {
    stigmergies.set(id, new ClusterStigmergy({ nodeId: id, transport: bus, maxTraces: 64 }));
  }
  return { bus, stigmergies };
}

function replayEntry(
  nodeId: string,
  traceId: string,
  flourishingScore = 0.8,
): ClusterReplayTrace {
  const sealedAt = '2026-07-10T12:00:00.000Z';
  const payload = {
    id: traceId,
    context: [1, 0],
    synthesisVector: [1, 0],
    weight: 1,
    metadata: { flourishingScore },
  };
  const trace: PheromoneTrace = {
    ...payload,
    timestamp: sealedAt,
    hash: canonicalDigest({ payload, parentHash: null }),
  };
  const localRoot = trace.hash;
  const lineage = [{ nodeId, root: localRoot }];
  const provenanceCommitment = {
    lineage,
    flourishingScore,
    humanVeto: false,
    sealedAt,
  };
  const clusterHash = canonicalDigest({
    type: 'MCOP_CLUSTER_TRACE',
    nodeId,
    trace,
    localRoot,
    provenance: provenanceCommitment,
  });
  return {
    nodeId,
    trace,
    localRoot,
    clusterHash,
    provenance: {
      nodeId,
      localRoot,
      clusterHash,
      ...provenanceCommitment,
    },
  };
}

describe('ClusterStigmergy — three-node integration', () => {
  it('a single node exposes its recorded StigmergyV5 trace hash as the local root', () => {
    const bus = new InMemoryGossipBus();
    bus.register('node-a');
    const s = new ClusterStigmergy({ nodeId: 'node-a', transport: bus });
    const first = s.recordTrace([1, 0, 0], [0, 1, 0], { domain: 'lone-wolf' });
    const second = s.recordTrace([0, 1, 0], [1, 0, 0], { domain: 'lone-wolf' });
    expect(first.trace.hash).not.toBe(second.trace.hash);
    expect(s.getLocalRoot()).toBe(second.trace.hash);
  });

  it('replays a real node A trace on node C with the byte-identical global root', async () => {
    const { stigmergies } = spawnCluster(['node-a', 'node-b', 'node-c']);
    const a = stigmergies.get('node-a')!;
    const b = stigmergies.get('node-b')!;
    const c = stigmergies.get('node-c')!;

    const { trace, provenance } = a.recordTrace([0.9, 0.1, 0], [1, 0, 0], { domain: 'shared' });
    await drain();

    expect(provenance.nodeId).toBe('node-a');
    expect(provenance.localRoot).toBe(a.getLocalRoot());

    const bResonance = b.getResonance([0.9, 0.1, 0]);
    const cResonance = c.getResonance([0.9, 0.1, 0]);
    expect(bResonance.bestNodeId).toBe('node-a');
    expect(cResonance.bestNodeId).toBe('node-a');
    expect(bResonance.trace?.id).toBe(trace.id);
    expect(cResonance.trace?.id).toBe(trace.id);
    expect(cResonance.trace?.hash).toBe(trace.hash);
    expect(cResonance.score).toBeGreaterThan(0.95);

    const aRoot: ClusterMerkleRoot = a.mergeRemoteRoots();
    const bRoot: ClusterMerkleRoot = b.mergeRemoteRoots();
    const cRoot: ClusterMerkleRoot = c.mergeRemoteRoots();
    expect(aRoot.root).toBe(bRoot.root);
    expect(bRoot.root).toBe(cRoot.root);
    expect(aRoot.contributors).toEqual([{ nodeId: 'node-a', root: trace.hash }]);

    // Cross a real wire boundary: the verifier receives only JSON, not the
    // in-memory objects shared by InMemoryGossipBus.
    const wireBundle = JSON.parse(JSON.stringify(c.exportReplayBundle())) as ClusterReplayBundle;
    const wireRoots = new Map(JSON.parse(JSON.stringify([...c.getKnownRoots()]))) as Map<string, string>;
    expect(wireBundle.traces).toHaveLength(1);
    expect(wireBundle.boundaries).toHaveLength(0);
    expect(wireBundle.traces[0].provenance.clusterHash).toBe(provenance.clusterHash);

    const replayed = ClusterStigmergy.replay(wireBundle, wireRoots);
    expect(replayed.root).toBe(cRoot.root);
    expect(replayed.contributors).toEqual(cRoot.contributors);
    expect(() => ClusterStigmergy.replay(
      wireBundle,
      new Map([...wireRoots, ['node-z', 'aa'.repeat(32)]]),
    )).toThrow('missing terminal trace');

    const verifierBus = new InMemoryGossipBus();
    const verifier = new ClusterStigmergy({ nodeId: 'offline-c', transport: verifierBus });
    const admitted = verifier.writeTraceRemote('node-a', wireBundle.traces[0]);
    expect(admitted).toEqual({
      imported: true,
      active: true,
      receipt: {
        scheme: 'MCOP_TRACE_ROOT_V1',
        nodeId: 'node-a',
        traceHash: trace.hash,
        localRoot: trace.hash,
        clusterHash: provenance.clusterHash,
      },
    });
    expect(verifier.getResonance([0.9, 0.1, 0]).trace?.hash).toBe(trace.hash);
  });

  it('canonically merges an authoritative root snapshot in every insertion order', () => {
    const roots = [
      ['node-a', '00'.repeat(32)],
      ['node-b', '11'.repeat(32)],
      ['node-c', 'ff'.repeat(32)],
    ] as const;
    const forward = mergeClusterRoots(new Map(roots));
    const reverse = mergeClusterRoots(new Map([...roots].reverse()));
    const bus = new InMemoryGossipBus();
    const nodeWithUnrelatedLocalState = new ClusterStigmergy({ nodeId: 'local', transport: bus });
    nodeWithUnrelatedLocalState.recordTrace([1], [1], { domain: 'must-not-leak' });
    const authoritative = nodeWithUnrelatedLocalState.mergeRemoteRoots(
      new Map([...roots].reverse()),
    );

    expect(forward.root).toBe('57602e8ff11a76d17de14e843339127a779d97ba94f8c46bba50ac5667208b73');
    expect(reverse.root).toBe(forward.root);
    expect(authoritative.root).toBe(forward.root);
    expect(authoritative.contributors).toEqual(forward.contributors);
    expect(reverse.contributors).toEqual(forward.contributors);
    expect(forward.contributors.map(({ nodeId }) => nodeId)).toEqual([
      'node-a',
      'node-b',
      'node-c',
    ]);
  });

  it('rejects tampered remote traces before mutating node C state', async () => {
    const { stigmergies } = spawnCluster(['node-a', 'node-c']);
    const a = stigmergies.get('node-a')!;
    const c = stigmergies.get('node-c')!;
    const { trace } = a.recordTrace([1, 0], [1, 0], { domain: 'tamper-proof' });
    await drain();

    const beforeRoot = c.mergeRemoteRoots().root;
    const beforeTrace = c.getResonance([1, 0]).trace?.hash;
    const acceptedEntry = c.exportReplayBundle().traces[0];
    const tampered = JSON.parse(JSON.stringify(acceptedEntry)) as ClusterReplayTrace;
    tampered.trace.synthesisVector[0] = 0;
    const validForClusterHash = JSON.parse(
      JSON.stringify(acceptedEntry),
    ) as ClusterReplayTrace;
    const forgedClusterHash = '00'.repeat(32);
    const badClusterHash = {
      ...validForClusterHash,
      clusterHash: forgedClusterHash,
      provenance: {
        ...validForClusterHash.provenance,
        clusterHash: forgedClusterHash,
      },
    };
    const validForProvenance = JSON.parse(
      JSON.stringify(acceptedEntry),
    ) as ClusterReplayTrace;
    const badProvenance = {
      ...validForProvenance,
      provenance: { ...validForProvenance.provenance, flourishingScore: 0.99 },
    };

    expect(c.writeTraceRemote('node-a', tampered)).toEqual({
      imported: false,
      reason: 'trace-hash-mismatch',
    });
    expect(() => ClusterStigmergy.replay([tampered], c.getKnownRoots())).toThrow(
      'trace-hash-mismatch',
    );
    expect(c.writeTraceRemote('node-a', badClusterHash)).toEqual({
      imported: false,
      reason: 'cluster-hash-mismatch',
    });
    expect(c.writeTraceRemote('node-a', badProvenance)).toEqual({
      imported: false,
      reason: 'provenance-mismatch',
    });
    expect(c.mergeRemoteRoots().root).toBe(beforeRoot);
    expect(c.getResonance([1, 0]).trace?.hash).toBe(beforeTrace);
    expect(beforeTrace).toBe(trace.hash);
  });

  it('rejects malformed root snapshots instead of hashing untrusted strings', () => {
    expect(() => mergeClusterRoots(new Map([['node-a', 'not-a-root']]))).toThrow(
      'not lowercase SHA-256',
    );
  });

  it('rejects stale heads, missing ancestors, and synthetic idle contributors', async () => {
    const { stigmergies } = spawnCluster(['node-a', 'node-c']);
    const a = stigmergies.get('node-a')!;
    const c = stigmergies.get('node-c')!;
    const first = a.recordTrace([1, 0], [1, 0], { domain: 'chain' }).trace;
    const second = a.recordTrace([0, 1], [0, 1], { domain: 'chain' }).trace;
    await drain();

    const bundle = c.exportReplayBundle();
    expect(bundle.traces).toHaveLength(2);
    expect(() => ClusterStigmergy.replay(
      bundle,
      new Map([['node-a', first.hash]]),
    )).toThrow('root is not the verified head');
    expect(() => ClusterStigmergy.replay(
      bundle.traces.filter((entry) => entry.trace.hash === second.hash),
      new Map([['node-a', second.hash]]),
    )).toThrow('missing ancestor');
    expect(() => ClusterStigmergy.replay(
      bundle,
      new Map([
        ['node-a', second.hash],
        ['idle-attacker', canonicalDigest({ empty: 'idle-attacker' })],
      ]),
    )).toThrow('missing terminal trace');
  });

  it('replays a bounded window after normal trace-buffer eviction', () => {
    const node = new ClusterStigmergy({
      nodeId: 'node-a',
      transport: new InMemoryGossipBus(),
      maxTraces: 2,
    });
    const first = node.recordTrace([1, 0], [1, 0], { step: 1 }).trace;
    const second = node.recordTrace([0, 1], [0, 1], { step: 2 }).trace;
    const third = node.recordTrace([1, 1], [1, 1], { step: 3 }).trace;

    const bundle = node.exportReplayBundle();
    expect(bundle.traces.map(({ trace }) => trace.hash).sort()).toEqual(
      [second.hash, third.hash].sort(),
    );
    expect(bundle.boundaries).toEqual([{
      nodeId: 'node-a',
      firstTraceHash: second.hash,
      parentHash: first.hash,
    }]);
    expect(ClusterStigmergy.replay(bundle, node.getKnownRoots()).root).toBe(
      node.mergeRemoteRoots().root,
    );
  });

  it('keeps verified siblings and selects the same active branch in either arrival order', () => {
    const aEntry = replayEntry('node-a', 'shared-trace-id');
    const bEntry = replayEntry('node-b', 'shared-trace-id');
    const first = new ClusterStigmergy({
      nodeId: 'receiver-1',
      transport: new InMemoryGossipBus(),
    });
    const second = new ClusterStigmergy({
      nodeId: 'receiver-2',
      transport: new InMemoryGossipBus(),
    });

    expect(first.writeTraceRemote('node-a', aEntry).imported).toBe(true);
    expect(first.writeTraceRemote('node-b', bEntry).imported).toBe(true);
    expect(second.writeTraceRemote('node-b', bEntry).imported).toBe(true);
    expect(second.writeTraceRemote('node-a', aEntry).imported).toBe(true);

    expect(first.mergeRemoteRoots().root).toBe(second.mergeRemoteRoots().root);
    expect(first.exportReplayBundle().traces).toHaveLength(2);
    expect(second.exportReplayBundle().traces).toHaveLength(2);
    expect(first.getResonance([1, 0]).bestNodeId).toBe(
      second.getResonance([1, 0]).bestNodeId,
    );
  });

  it('preserves same-writer equivocation while selecting the higher flourishing branch', () => {
    const low = replayEntry('node-a', 'equivocated-id', 0.2);
    const high = replayEntry('node-a', 'equivocated-id', 0.9);
    const first = new ClusterStigmergy({
      nodeId: 'receiver-1',
      transport: new InMemoryGossipBus(),
    });
    const second = new ClusterStigmergy({
      nodeId: 'receiver-2',
      transport: new InMemoryGossipBus(),
    });

    first.writeTraceRemote('node-a', low);
    first.writeTraceRemote('node-a', high);
    second.writeTraceRemote('node-a', high);
    second.writeTraceRemote('node-a', low);

    expect(first.exportReplayBundle().traces).toHaveLength(2);
    expect(second.exportReplayBundle().traces).toHaveLength(2);
    expect(first.getResonance([1, 0]).trace?.hash).toBe(high.trace.hash);
    expect(second.getResonance([1, 0]).trace?.hash).toBe(high.trace.hash);
    expect(first.mergeRemoteRoots().root).toBe(second.mergeRemoteRoots().root);
    expect(first.getKnownRoots().get('node-a')).toBe(high.localRoot);
    expect(ClusterStigmergy.replay(
      first.exportReplayBundle(),
      first.getKnownRoots(),
    ).root).toBe(first.mergeRemoteRoots().root);
  });

  it('does not let an invalid high sequence or bare root poison later valid gossip', async () => {
    const { bus, stigmergies } = spawnCluster(['node-a', 'node-c']);
    const a = stigmergies.get('node-a')!;
    const c = stigmergies.get('node-c')!;
    bus.publish({
      type: 'trace',
      from: 'node-a',
      seq: 99,
      timestamp: '2026-07-10T12:00:00.000Z',
      payload: { trace: { id: 'forged' } },
    });
    bus.publish({
      type: 'root',
      from: 'root-attacker',
      seq: 1,
      timestamp: '2026-07-10T12:00:00.000Z',
      payload: { root: 'aa'.repeat(32) },
    });
    await drain();

    const { trace } = a.recordTrace([1, 0], [1, 0], { domain: 'valid-after-forgery' });
    await drain();
    expect(c.getResonance([1, 0]).trace?.hash).toBe(trace.hash);
    expect(c.getKnownRoots().has('root-attacker')).toBe(false);
  });

  it("human veto on node A removes the trace from B and C's resonance surface", async () => {
    const { stigmergies } = spawnCluster(['node-a', 'node-b', 'node-c']);
    const a = stigmergies.get('node-a')!;
    const b = stigmergies.get('node-b')!;
    const c = stigmergies.get('node-c')!;

    const { trace } = a.recordTrace([1, 0, 0], [0, 1, 0], { domain: 'shared' });
    await drain();
    expect(b.getResonance([1, 0, 0]).trace?.id).toBe(trace.id);

    a.vetoTrace(trace.id, 'pii-leak');
    await drain();

    expect(b.getResonance([1, 0, 0]).trace).toBeUndefined();
    expect(c.getResonance([1, 0, 0]).trace).toBeUndefined();
  });

  it('repeated resonance queries return the same winning trace', async () => {
    const { stigmergies } = spawnCluster(['node-a', 'node-b']);
    const a = stigmergies.get('node-a')!;
    const b = stigmergies.get('node-b')!;

    const { trace: lo } = a.recordTrace([1, 0], [0, 1], { domain: 'd', flourishingScore: 0.3 });
    await drain();
    // A second node contributes an equally resonant trace. Repeated reads must
    // retain the same deterministic winner.
    b.recordTrace([1, 0], [0, 1], { domain: 'd', flourishingScore: 0.95 });
    await drain();

    const resonance = a.getResonance([1, 0]);
    expect(resonance.score).toBeGreaterThan(0.9);
    expect(['node-a', 'node-b']).toContain(resonance.bestNodeId);
    expect(lo).toBeDefined();
    // Deterministic: re-querying yields the same winner.
    const resonance2 = a.getResonance([1, 0]);
    expect(resonance2.trace?.id).toBe(resonance.trace?.id);
    expect(resonance2.bestNodeId).toBe(resonance.bestNodeId);
  });

});

describe('ClusterOrchestrator — membership + sharding', () => {
  it('rendezvous hashing deterministically resolves a key to one owner', () => {
    const bus = new InMemoryGossipBus();
    bus.register('a');
    bus.register('b');
    bus.register('c');
    const o = new ClusterOrchestrator({ nodeId: 'a', transport: bus });
    // Simulate seeing b and c.
    o['members'].set('b', { nodeId: 'b', lastSeenMs: Date.now(), capability: { cuda: false } });
    o['members'].set('c', { nodeId: 'c', lastSeenMs: Date.now(), capability: { cuda: true } });
    const owner1 = o.leaderForKey('shard-key-1');
    const owner2 = o.leaderForKey('shard-key-1');
    expect(owner1).toBe(owner2);
    expect(['a', 'b', 'c']).toContain(owner1);
  });

  it('prunes stale peers on tick()', () => {
    let now = 1_000;
    const bus = new InMemoryGossipBus();
    const o = new ClusterOrchestrator({
      nodeId: 'a',
      transport: bus,
      staleAfterMs: 100,
      now: () => now,
    });
    o['members'].set('b', { nodeId: 'b', lastSeenMs: now, capability: { cuda: false } });
    now += 50;
    o.tick();
    expect(o.getMembers().map((m) => m.nodeId)).toContain('b');
    now += 200;
    o.tick();
    expect(o.getMembers().map((m) => m.nodeId)).not.toContain('b');
  });

  it('shardForKey returns N replicas in deterministic order', () => {
    const bus = new InMemoryGossipBus();
    const o = new ClusterOrchestrator({ nodeId: 'a', transport: bus });
    o['members'].set('b', { nodeId: 'b', lastSeenMs: Date.now(), capability: { cuda: false } });
    o['members'].set('c', { nodeId: 'c', lastSeenMs: Date.now(), capability: { cuda: false } });
    const r1 = o.shardForKey('x', 1);
    const r2 = o.shardForKey('x', 1);
    expect(r1).toEqual(r2);
    expect(r1).toHaveLength(2);
  });

  it('capability advertisements flow into the membership table', async () => {
    const bus = new InMemoryGossipBus();
    bus.register('a');
    bus.register('b');
    const orchA = new ClusterOrchestrator({ nodeId: 'a', transport: bus });
    const orchB = new ClusterOrchestrator({ nodeId: 'b', transport: bus });
    orchA.setCapability({ cuda: true, resolvedFrom: 'auto-capable' });
    await drain();
    const b = orchB.getMembers().find((m) => m.nodeId === 'a');
    expect(b?.capability.cuda).toBe(true);
    expect(b?.capability.resolvedFrom).toBe('auto-capable');
  });
});
