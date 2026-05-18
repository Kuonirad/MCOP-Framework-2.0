/**
 * ClusterOrchestrator — pragmatic membership + leader election layer
 * for v3.0 cluster mode.
 *
 * Design choices (per the v3.0 roadmap):
 *
 *   - **Leaderless writes** by default. Leader election is offered as
 *     a `leaderForKey(key)` helper using rendezvous (highest-random-
 *     weight) hashing so write-heavy operations can opt in without
 *     introducing a global single point of failure.
 *
 *   - **Sharded reads** via the same rendezvous hash — every key
 *     deterministically resolves to a primary node, with the next-N
 *     nodes in the ring serving as replicas.
 *
 *   - **Heartbeats + capability exchange** — every `tick()` advertises
 *     the local capability over the gossip bus and prunes peers that
 *     have not been seen within the `staleAfterMs` window. Capability
 *     changes (`CUDA available?`, `resolvedFrom`) propagate as
 *     `type: 'capability'` messages handled by
 *     {@link ClusterStigmergy}.
 *
 *   - **Failure detection + automatic re-sharding** — when a node is
 *     pruned, the shard assignment is recomputed; downstream callers
 *     that use {@link shardForKey} immediately see the new owner.
 */

import type { ClusterStigmergy } from './clusterStigmergy';
import { canonicalDigest } from '../core/canonicalEncoding';
import type { ClusterCapability, GossipMessage, GossipTransport, NodeId } from './types';

export interface ClusterOrchestratorConfig {
  nodeId: NodeId;
  transport: GossipTransport;
  /** Bound stigmergy instance whose capability we re-publish on tick(). */
  stigmergy?: ClusterStigmergy;
  /**
   * Peers are considered stale if no message has been observed from
   * them within this window. Default 30 s.
   */
  staleAfterMs?: number;
  capability?: ClusterCapability;
  /**
   * Test hook: deterministic `Date.now()` replacement. Defaults to the
   * real clock.
   */
  now?: () => number;
}

export interface MembershipEntry {
  readonly nodeId: NodeId;
  readonly lastSeenMs: number;
  readonly capability: ClusterCapability;
}

export class ClusterOrchestrator {
  readonly nodeId: NodeId;
  private readonly transport: GossipTransport;
  private readonly stigmergy: ClusterStigmergy | undefined;
  private readonly staleAfterMs: number;
  private readonly now: () => number;
  private readonly members = new Map<NodeId, MembershipEntry>();
  private readonly seenSequences = new Map<NodeId, number>();
  private capability: ClusterCapability;
  private localSeq = 0;
  private readonly unsubscribe: () => void;

  constructor(config: ClusterOrchestratorConfig) {
    this.nodeId = config.nodeId;
    this.transport = config.transport;
    this.stigmergy = config.stigmergy;
    this.staleAfterMs = Math.max(1, config.staleAfterMs ?? 30_000);
    this.now = config.now ?? Date.now;
    this.capability = config.capability ?? { cuda: false };
    this.members.set(this.nodeId, {
      nodeId: this.nodeId,
      lastSeenMs: this.now(),
      capability: this.capability,
    });
    this.unsubscribe = this.transport.subscribe((msg) => this.handleInbound(msg));
  }

  close(): void {
    this.unsubscribe();
  }

  /** Snapshot of the active membership table (alive peers). */
  getMembers(): ReadonlyArray<MembershipEntry> {
    return Object.freeze([...this.members.values()].sort((a, b) => (a.nodeId < b.nodeId ? -1 : 1)));
  }

  /** Update local capability and broadcast. */
  setCapability(capability: ClusterCapability): void {
    this.capability = capability;
    this.members.set(this.nodeId, { nodeId: this.nodeId, lastSeenMs: this.now(), capability });
    this.localSeq += 1;
    void this.transport.publish({
      type: 'capability',
      from: this.nodeId,
      seq: this.localSeq,
      timestamp: new Date().toISOString(),
      payload: capability,
    });
    this.stigmergy?.advertiseCapability(capability);
  }

  /**
   * Periodic heartbeat. Call from a setInterval / orchestrator loop.
   * Prunes stale peers and rebroadcasts the local capability.
   */
  tick(): void {
    const now = this.now();
    for (const [nodeId, entry] of this.members) {
      if (nodeId === this.nodeId) continue;
      if (now - entry.lastSeenMs > this.staleAfterMs) {
        this.members.delete(nodeId);
      }
    }
    this.members.set(this.nodeId, { nodeId: this.nodeId, lastSeenMs: now, capability: this.capability });
    this.localSeq += 1;
    void this.transport.publish({
      type: 'capability',
      from: this.nodeId,
      seq: this.localSeq,
      timestamp: new Date().toISOString(),
      payload: this.capability,
    });
  }

  /**
   * Rendezvous (highest-random-weight) hashing: deterministically
   * resolve a key to the node that should own it, with the next-N
   * nodes in the ring as replicas.
   */
  shardForKey(key: string, replicas = 0): ReadonlyArray<NodeId> {
    const members = [...this.members.keys()].sort();
    if (members.length === 0) return [];
    const weighted = members.map((nodeId) => ({
      nodeId,
      weight: weighFor(key, nodeId),
    }));
    weighted.sort((a, b) => (a.weight > b.weight ? -1 : a.weight < b.weight ? 1 : a.nodeId < b.nodeId ? -1 : 1));
    return Object.freeze(weighted.slice(0, 1 + Math.max(0, replicas)).map((w) => w.nodeId));
  }

  /** Convenience wrapper: return the primary owner of `key`. */
  leaderForKey(key: string): NodeId | undefined {
    return this.shardForKey(key, 0)[0];
  }

  /** True when this node is the primary owner of `key`. */
  isLeaderFor(key: string): boolean {
    return this.leaderForKey(key) === this.nodeId;
  }

  // ----------------------------------------------------------------
  // Internal
  // ----------------------------------------------------------------

  private handleInbound(msg: GossipMessage): void {
    if (msg.from === this.nodeId) return;
    const lastSeq = this.seenSequences.get(msg.from) ?? 0;
    if (msg.seq < lastSeq) return;
    this.seenSequences.set(msg.from, msg.seq);

    const existing = this.members.get(msg.from);
    const capability: ClusterCapability =
      msg.type === 'capability' && msg.payload && typeof (msg.payload as ClusterCapability).cuda === 'boolean'
        ? (msg.payload as ClusterCapability)
        : existing?.capability ?? { cuda: false };
    this.members.set(msg.from, { nodeId: msg.from, lastSeenMs: this.now(), capability });
  }
}

/**
 * Compute a stable per-(key, node) weight in [0, 1).
 *
 * Uses RFC 8785 canonical SHA-256 so the weighting is byte-stable
 * across runtimes — TS, Python, future Rust nodes can all agree on
 * the same primary owner without coordination.
 */
function weighFor(key: string, nodeId: NodeId): number {
  const digest = canonicalDigest({ key, nodeId });
  // Convert the first 8 hex chars into a 32-bit integer → [0, 1).
  const word = parseInt(digest.slice(0, 8), 16);
  return word / 0xffffffff;
}
