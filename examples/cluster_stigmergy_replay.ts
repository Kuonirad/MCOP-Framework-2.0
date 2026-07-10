/**
 * Flagship distributed-substrate proof.
 *
 * Node A writes one trace. Node C receives it over gossip, recalls it by
 * resonance, exports a JSON replay bundle, and recomputes the same canonical
 * global root offline. The proof covers integrity and deterministic replay;
 * authenticated node identity remains a production transport concern.
 */

import {
  ClusterStigmergy,
  InMemoryGossipBus,
  type ClusterReplayBundle,
} from '../src/cluster';

export interface ClusterReplayDemoResult {
  readonly originNode: 'node-a';
  readonly verifierNode: 'node-c';
  readonly traceId: string;
  readonly traceHash: string;
  readonly clusterHash: string;
  readonly resonanceScore: number;
  readonly globalRoot: string;
  readonly replayRoot: string;
  readonly contributors: ReadonlyArray<string>;
  readonly byteIdentical: true;
}

async function drainGossip(): Promise<void> {
  await Promise.resolve();
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  await Promise.resolve();
}

export async function runClusterStigmergyReplayDemo(): Promise<ClusterReplayDemoResult> {
  const bus = new InMemoryGossipBus();
  const nodes = ['node-a', 'node-b', 'node-c'] as const;
  for (const nodeId of nodes) bus.register(nodeId);

  const a = new ClusterStigmergy({ nodeId: 'node-a', transport: bus });
  const b = new ClusterStigmergy({ nodeId: 'node-b', transport: bus });
  const c = new ClusterStigmergy({ nodeId: 'node-c', transport: bus });

  try {
    const { trace, provenance } = a.recordTrace(
      [1, 0, 0],
      [1, 0, 0],
      { domain: 'stigmergic-trust-substrate', flourishingScore: 1 },
    );
    await drainGossip();

    const resonance = c.getResonance([1, 0, 0]);
    if (resonance.bestNodeId !== 'node-a' || resonance.trace?.hash !== trace.hash) {
      throw new Error('node C did not verify node A resonance');
    }

    const liveRoots = [a, b, c].map((node) => node.mergeRemoteRoots().root);
    if (new Set(liveRoots).size !== 1) {
      throw new Error('cluster nodes did not converge on one global root');
    }

    const wireBundle = JSON.parse(JSON.stringify(c.exportReplayBundle())) as ClusterReplayBundle;
    const wireRoots = new Map(
      JSON.parse(JSON.stringify([...c.getKnownRoots()])),
    ) as Map<string, string>;
    const replayed = ClusterStigmergy.replay(wireBundle, wireRoots);
    if (replayed.root !== liveRoots[0]) {
      throw new Error('offline replay root differs from the live cluster root');
    }

    return Object.freeze({
      originNode: 'node-a',
      verifierNode: 'node-c',
      traceId: trace.id,
      traceHash: trace.hash,
      clusterHash: provenance.clusterHash,
      resonanceScore: resonance.score,
      globalRoot: liveRoots[0],
      replayRoot: replayed.root,
      contributors: Object.freeze(replayed.contributors.map(({ nodeId }) => nodeId)),
      byteIdentical: true,
    });
  } finally {
    a.close();
    b.close();
    c.close();
  }
}
