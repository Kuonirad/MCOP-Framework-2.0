# Distributed / Cluster Mode (v3.0)

> Companion to [`docs/CUDA_PRODUCTION.md`](./CUDA_PRODUCTION.md) and
> [`docs/HOSTED_PROVENANCE_LEDGER.md`](./HOSTED_PROVENANCE_LEDGER.md).
> Cluster mode turns the single-node stigmergic substrate into a
> cluster-coordinated one while preserving every Φ1–Φ5 audit invariant.

## Vision

A cluster of MCOP nodes shares an evolving pheromone substrate and
seals every trace + etch with **global Merkle lineage**. Three nodes
running independent agents converge on a single deterministic cluster
root for any time window. A trace written on node A is verifiable and
resonant on node C with full cryptographic lineage.

## Substrate sync model

We ship **Option A (pragmatic)** from the roadmap: sharded
`StigmergyV5` with consistent-hash routing and gossip of Merkle roots.
Options B (IPFS) and C (core-replica hybrid) remain explicit follow-ups;
the public surface (`ClusterStigmergy`, `ClusterOrchestrator`,
`GossipTransport`) is identical in all three variants so the swap is
mechanical.

### Modules

| File | Role |
| ---- | ---- |
| [`src/cluster/types.ts`](../src/cluster/types.ts) | `NodeId`, `MerkleRoot`, `ClusterTrace`, `ClusterMerkleRoot`, `ClusterProvenance`, `GossipMessage`, `GossipTransport` |
| [`src/cluster/inMemoryGossipBus.ts`](../src/cluster/inMemoryGossipBus.ts) | In-process gossip bus for tests + embedded single-process demos. NATS / libp2p / Redis Streams plug in via the same interface. |
| [`src/cluster/clusterStigmergy.ts`](../src/cluster/clusterStigmergy.ts) | Sharded `StigmergyV5` wrapper with Merkle-root gossip, conflict resolution, human-veto propagation, and a deterministic `replay()` static. |
| [`src/cluster/clusterOrchestrator.ts`](../src/cluster/clusterOrchestrator.ts) | Membership table, capability exchange (CUDA available?), rendezvous-hash sharding, failure detection. |

### Invariants (Phase 0 design)

1. **Eventual Merkle-root convergence.** Two nodes that observe the
   same set of traces fold to a byte-identical cluster root via
   `mergeRemoteRoots()`.
2. **No loss of single-node determinism.** A cluster of size 1
   produces a `localRoot` byte-identical to a plain
   `StigmergyV5.getMerkleRoot()` call.
3. **Human veto wins.** `vetoTrace(id)` propagates as a gossip
   message; downstream nodes immediately drop the trace from their
   resonance surface.
4. **Comparable resonance scoring across nodes.** `getResonance()` on
   any node returns the maximum cosine score across the union of
   local + observed-remote traces, tagged with the contributing
   `nodeId`.

### Phase 1 — core primitives (shipped)

`ClusterStigmergy.recordTrace()` commits locally, publishes a
`type: 'trace'` gossip message, and returns a sealed
`ClusterProvenance` envelope that chains `lineage: [{ nodeId, root }, …]`
covering every observed peer root.

`mergeRemoteRoots()` folds the per-node roots into a single canonical
list and digests the list via RFC 8785 → SHA-256. Byte-stable across
runtimes (TS, Python, future Rust) — see
[`src/core/canonicalEncoding.ts`](../src/core/canonicalEncoding.ts).

### Phase 2 — orchestrator & membership (shipped)

`ClusterOrchestrator.tick()`:

1. Prunes peers whose `lastSeenMs` exceeds `staleAfterMs`.
2. Rebroadcasts the local `ClusterCapability` (CUDA available?
   `resolvedFrom`, device tag).

`shardForKey(key, replicas)` resolves a key to a deterministic primary
node + N replicas via rendezvous (highest-random-weight) hashing keyed
on the canonical SHA-256 of `{key, nodeId}`. The same key → same owner
across reboots, across runtimes.

### Phase 3 — consistency & replay (shipped)

`ClusterStigmergy.replay(bundle, rootsByNode)` reconstructs the
cluster root from a sealed bundle. Combined with the
`ClusterProvenance.lineage` chain, any node can replay a window of
history and prove its local root matches.

Integration test:
[`src/__tests__/clusterStigmergy.test.ts`](../src/__tests__/clusterStigmergy.test.ts)
drives a 3-node cluster: traces written on one node, verifies
resonance + matching cluster roots on the others.

### Phase 4 — production concerns (planned hooks shipped)

| Concern | Hook |
| ------- | ---- |
| mTLS    | `GossipMessage.signature` field; transport implementations should verify before delivery. |
| Observability | Every gossip message carries `from`, `seq`, `timestamp`; `ClusterProvenance.lineage` is the distributed-trace anchor. |
| Backpressure on hot shards | `ClusterOrchestrator.shardForKey(key, replicas)` allows callers to fan out reads. |
| CRDT-style merge | `ClusterStigmergy.shouldReplace()` is the conflict-resolution hook — replace with an OT/CRDT strategy at v3.1+ without changing the public surface. |

## Wire format

A `GossipMessage` is a flat JSON object:

```json
{
  "type": "trace" | "root" | "veto" | "capability",
  "from": "node-a",
  "seq": 17,
  "timestamp": "2026-05-18T05:48:00.000Z",
  "signature": "<optional Ed25519/HMAC>",
  "payload": {  // type-specific
    "trace":      { /* PheromoneTrace */ },
    "localRoot":  "<sha256>",
    "clusterHash": "<sha256>",
    "provenance": { /* ClusterProvenance */ }
  }
}
```

The format is intentionally transport-agnostic so the same envelope
travels over NATS subjects, libp2p PubSub topics, or Redis Streams
without translation.

## Quick start

```ts
import {
  ClusterStigmergy,
  ClusterOrchestrator,
  InMemoryGossipBus,
} from '@kuonirad/mcop-framework';

const bus = new InMemoryGossipBus();   // swap for NATS in production
bus.register('node-a');
bus.register('node-b');

const stigmergy = new ClusterStigmergy({ nodeId: 'node-a', transport: bus });
const orchestrator = new ClusterOrchestrator({ nodeId: 'node-a', transport: bus, stigmergy });

const { trace, provenance } = stigmergy.recordTrace(
  [1, 0, 0],
  [0, 1, 0],
  { domain: 'demo', flourishingScore: 0.8 },
);
console.log(provenance.lineage);              // [{ nodeId: 'node-a', root: '...' }, …]
console.log(stigmergy.mergeRemoteRoots().root); // deterministic cluster root

const owner = orchestrator.leaderForKey(trace.id);
```

## Substituting a real gossip transport

```ts
import { connect } from 'nats';
import { GossipTransport, GossipMessage } from '@kuonirad/mcop-framework';

class NatsTransport implements GossipTransport {
  constructor(private nc: Awaited<ReturnType<typeof connect>>, private subject: string) {}
  async publish(message: GossipMessage) {
    this.nc.publish(this.subject, new TextEncoder().encode(JSON.stringify(message)));
  }
  subscribe(handler: (m: GossipMessage) => void): () => void {
    const sub = this.nc.subscribe(this.subject);
    (async () => {
      for await (const m of sub) handler(JSON.parse(new TextDecoder().decode(m.data)));
    })();
    return () => sub.unsubscribe();
  }
  members(): readonly string[] { /* delegate to NATS JetStream consumer info */ return []; }
}
```

The same `ClusterStigmergy` + `ClusterOrchestrator` instances run
unchanged on top of any transport that conforms to the interface.

## Success criteria — three-node integration

The CI-resident
[`clusterStigmergy.test.ts`](../src/__tests__/clusterStigmergy.test.ts)
suite asserts:

- Single-node Merkle root matches plain `StigmergyV5`.
- Trace on node A → resonant on B and C with matching `clusterHash`.
- `mergeRemoteRoots()` produces byte-identical roots from every node.
- Human veto propagates and removes the trace from peer resonance
  surfaces.
- Rendezvous hashing is deterministic + stable under membership
  churn.

All ten tests pass on `ubuntu-latest`. The same suite is the
canonical regression gate for v3.1+ work.
