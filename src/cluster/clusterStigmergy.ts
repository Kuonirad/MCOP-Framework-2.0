/**
 * ClusterStigmergy — a cluster-coordinated wrapper around `StigmergyV5`.
 *
 * The wrapper provides four guarantees:
 *
 *   1. **Sharded write** — every recorded trace is committed to the
 *      local node's `StigmergyV5` instance *and* gossiped to peer
 *      nodes. Reading from any node returns a deterministic merge of
 *      local + observed-remote traces.
 *   2. **Eventual Merkle-root convergence** — `mergeRemoteRoots()`
 *      folds per-node roots into a single deterministic cluster root.
 *      Two nodes that have observed the same set of traces produce
 *      byte-identical roots.
 *   3. **Conflict resolution** — when two nodes report a trace with
 *      the same `id` but different `hash`, the one with the higher
 *      flourishing score wins. A `humanVeto: true` annotation always
 *      wins over any score.
 *   4. **No loss of single-node determinism** — `recordTrace()` on a
 *      single node, with no peers, produces a byte-identical
 *      `localRoot` to a plain `StigmergyV5.getMerkleRoot()` call.
 *
 * Transport-agnostic: any `GossipTransport` (in-memory, NATS,
 * libp2p, Redis Streams) plugs in via the constructor.
 */

import { canonicalDigest } from '../core/canonicalEncoding';
import { StigmergyV5, type StigmergyConfig } from '../core/stigmergyV5';
import type { ContextTensor, PheromoneTrace } from '../core/types';
import type {
  ClusterCapability,
  ClusterMerkleRoot,
  ClusterProvenance,
  ClusterTrace,
  GossipMessage,
  GossipTransport,
  NodeId,
} from './types';

export interface ClusterStigmergyConfig extends StigmergyConfig {
  /** Stable identifier for this node. Should outlive process restarts. */
  nodeId: NodeId;
  /** Pluggable gossip transport. */
  transport: GossipTransport;
  /** Hardware capability advertised in the membership heartbeat. */
  capability?: ClusterCapability;
}

export class ClusterStigmergy {
  readonly nodeId: NodeId;
  private readonly local: StigmergyV5;
  private readonly transport: GossipTransport;
  private readonly capability: ClusterCapability;
  private readonly remoteTraces = new Map<string, ClusterTrace>();
  private readonly remoteRoots = new Map<NodeId, string>();
  private readonly nodeCapabilities = new Map<NodeId, ClusterCapability>();
  private readonly seenSequences = new Map<NodeId, number>();
  private readonly vetoed = new Set<string>();
  private localSeq = 0;
  private readonly unsubscribe: () => void;

  constructor(config: ClusterStigmergyConfig) {
    this.nodeId = config.nodeId;
    this.local = new StigmergyV5(config);
    this.transport = config.transport;
    this.capability = config.capability ?? { cuda: false };
    this.nodeCapabilities.set(this.nodeId, this.capability);
    this.unsubscribe = this.transport.subscribe((msg) => this.handleInbound(msg));
  }

  /** Stop listening to the gossip bus. Idempotent. */
  close(): void {
    this.unsubscribe();
  }

  /** Capability advertised to peers; updated by inbound heartbeats. */
  getCapabilities(): ReadonlyMap<NodeId, ClusterCapability> {
    return new Map(this.nodeCapabilities);
  }

  /**
   * Record a trace locally *and* gossip it to peers. Returns a
   * sealed {@link ClusterProvenance} envelope so callers can attach
   * cluster-aware lineage to their orchestrator log.
   */
  recordTrace(
    context: ContextTensor,
    synthesisVector: number[],
    metadata?: Record<string, unknown>,
  ): { trace: PheromoneTrace; provenance: ClusterProvenance } {
    const trace = this.local.recordTrace(context, synthesisVector, metadata);
    const localRoot = this.local.getMerkleRoot() ?? trace.hash;
    const clusterHash = computeClusterHash(this.nodeId, trace, localRoot);
    const provenance = sealClusterProvenance({
      nodeId: this.nodeId,
      localRoot,
      clusterHash,
      lineage: this.lineageSnapshot(),
      flourishingScore: pickFlourishing(metadata),
    });

    this.localSeq += 1;
    const message: GossipMessage = {
      type: 'trace',
      from: this.nodeId,
      seq: this.localSeq,
      timestamp: new Date().toISOString(),
      payload: { trace, localRoot, clusterHash, provenance },
    };
    void this.transport.publish(message);

    return { trace, provenance };
  }

  /**
   * Cluster-aware resonance query. Searches local traces *and*
   * observed-remote traces. The returned score is the maximum
   * cosine-resonance across the union; the `bestNodeId` field
   * tells the caller which node produced the winning trace.
   */
  getResonance(context: ContextTensor): {
    score: number;
    trace?: PheromoneTrace;
    bestNodeId?: NodeId;
    contributingNodes: ReadonlyArray<NodeId>;
  } {
    const local = this.local.getResonance(context);
    let best = { score: local.score, trace: local.trace, nodeId: this.nodeId };
    const nodes = new Set<NodeId>();
    if (local.trace !== undefined) nodes.add(this.nodeId);
    for (const ct of this.remoteTraces.values()) {
      if (this.vetoed.has(ct.trace.id)) continue;
      nodes.add(ct.nodeId);
      const resonance = cosineFor(context, ct.trace);
      if (resonance > best.score) {
        best = { score: resonance, trace: ct.trace, nodeId: ct.nodeId };
      }
    }
    return {
      score: best.score,
      trace: best.trace,
      bestNodeId: best.trace ? best.nodeId : undefined,
      contributingNodes: Object.freeze([...nodes].sort()),
    };
  }

  /** Local Merkle root — byte-identical to {@link StigmergyV5.getMerkleRoot}. */
  getLocalRoot(): string {
    return this.local.getMerkleRoot() ?? canonicalDigest({ empty: this.nodeId });
  }

  /**
   * Snapshot of every observed node's most recent local Merkle root,
   * including this node's own root.
   */
  getKnownRoots(): ReadonlyMap<NodeId, string> {
    const roots = new Map(this.remoteRoots);
    roots.set(this.nodeId, this.getLocalRoot());
    return roots;
  }

  /**
   * Fold every known per-node root into a single cluster Merkle root.
   *
   * The fold is intentionally simple and deterministic:
   *
   *   1. Sort `(nodeId, root)` pairs by `nodeId` (lexicographic).
   *   2. Take the canonical digest of the sorted list.
   *
   * Two nodes that have observed the same set of roots produce
   * byte-identical cluster roots — the convergence invariant.
   */
  mergeRemoteRoots(extraRoots: ReadonlyMap<NodeId, string> = new Map()): ClusterMerkleRoot {
    const merged = new Map<NodeId, string>(this.getKnownRoots());
    for (const [node, root] of extraRoots) merged.set(node, root);
    const contributors = [...merged.entries()]
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([nodeId, root]) => Object.freeze({ nodeId, root }));
    const root = canonicalDigest({ type: 'MCOP_CLUSTER_ROOT', contributors });
    return Object.freeze({
      root,
      contributors: Object.freeze(contributors),
      sealedAt: new Date().toISOString(),
    });
  }

  /**
   * Record a human-veto on a specific trace `id`. The veto is
   * gossiped to peers and wins over any resonance / flourishing-score
   * conflict resolution.
   */
  vetoTrace(traceId: string, reason?: string): void {
    this.vetoed.add(traceId);
    this.localSeq += 1;
    void this.transport.publish({
      type: 'veto',
      from: this.nodeId,
      seq: this.localSeq,
      timestamp: new Date().toISOString(),
      payload: { traceId, reason },
    });
  }

  /** Advertise capability changes (e.g. CUDA layer flipped on). */
  advertiseCapability(capability: ClusterCapability): void {
    this.nodeCapabilities.set(this.nodeId, capability);
    this.localSeq += 1;
    void this.transport.publish({
      type: 'capability',
      from: this.nodeId,
      seq: this.localSeq,
      timestamp: new Date().toISOString(),
      payload: capability,
    });
  }

  /**
   * Replay a window of cluster history into a fresh `ClusterStigmergy`
   * instance. Given a set of `ClusterTrace`s and the observed roots,
   * the replayed cluster root *must* match the original — the
   * deterministic-replay invariant.
   */
  static replay(
    bundle: ReadonlyArray<ClusterTrace>,
    rootsByNode: ReadonlyMap<NodeId, string>,
  ): ClusterMerkleRoot {
    const contributors = [...rootsByNode.entries()]
      .filter(([nodeId]) => bundle.some((t) => t.nodeId === nodeId))
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([nodeId, root]) => Object.freeze({ nodeId, root }));
    const root = canonicalDigest({ type: 'MCOP_CLUSTER_ROOT', contributors });
    return Object.freeze({
      root,
      contributors: Object.freeze(contributors),
      sealedAt: new Date().toISOString(),
    });
  }

  // ----------------------------------------------------------------
  // Internal
  // ----------------------------------------------------------------

  private lineageSnapshot(): ReadonlyArray<{ nodeId: NodeId; root: string }> {
    const items: Array<{ nodeId: NodeId; root: string }> = [];
    for (const [nodeId, root] of this.getKnownRoots()) {
      items.push({ nodeId, root });
    }
    items.sort((a, b) => (a.nodeId < b.nodeId ? -1 : a.nodeId > b.nodeId ? 1 : 0));
    return Object.freeze(items);
  }

  private handleInbound(message: GossipMessage): void {
    if (message.from === this.nodeId) return;
    const lastSeq = this.seenSequences.get(message.from) ?? 0;
    if (message.seq <= lastSeq) return; // dedup; at-least-once → exactly-once locally
    this.seenSequences.set(message.from, message.seq);

    if (message.type === 'trace') {
      const incoming = message.payload as {
        trace: PheromoneTrace;
        localRoot: string;
        clusterHash: string;
        provenance: ClusterProvenance;
      };
      if (this.vetoed.has(incoming.trace.id)) return;
      const existing = this.remoteTraces.get(incoming.trace.id);
      if (existing && !this.shouldReplace(existing, incoming)) return;
      this.remoteTraces.set(incoming.trace.id, {
        nodeId: message.from,
        trace: incoming.trace,
        localRoot: incoming.localRoot,
        clusterHash: incoming.clusterHash,
      });
      this.remoteRoots.set(message.from, incoming.localRoot);
      return;
    }

    if (message.type === 'root') {
      const root = String((message.payload as { root?: unknown })?.root ?? '');
      if (root) this.remoteRoots.set(message.from, root);
      return;
    }

    if (message.type === 'veto') {
      const traceId = String((message.payload as { traceId?: unknown })?.traceId ?? '');
      if (traceId) {
        this.vetoed.add(traceId);
        this.remoteTraces.delete(traceId);
      }
      return;
    }

    if (message.type === 'capability') {
      const cap = message.payload as ClusterCapability;
      if (cap && typeof cap.cuda === 'boolean') {
        this.nodeCapabilities.set(message.from, cap);
      }
      return;
    }
  }

  private shouldReplace(
    current: ClusterTrace,
    incoming: { trace: PheromoneTrace; provenance: ClusterProvenance },
  ): boolean {
    // Human veto always wins.
    if (incoming.provenance.humanVeto) return true;
    // Higher flourishing score wins; ties broken by lexicographic clusterHash for determinism.
    const currentScore = pickFlourishingFromMeta(current.trace);
    const incomingScore = incoming.provenance.flourishingScore ?? pickFlourishingFromMeta(incoming.trace);
    if (incomingScore > currentScore) return true;
    if (incomingScore < currentScore) return false;
    return current.clusterHash > computeClusterHash(this.nodeId, incoming.trace, current.localRoot);
  }
}

// ----------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------

function computeClusterHash(nodeId: NodeId, trace: PheromoneTrace, localRoot: string): string {
  return canonicalDigest({ type: 'MCOP_CLUSTER_TRACE', nodeId, trace, localRoot });
}

function sealClusterProvenance(input: {
  nodeId: NodeId;
  localRoot: string;
  clusterHash: string;
  lineage: ReadonlyArray<{ nodeId: NodeId; root: string }>;
  flourishingScore?: number;
  humanVeto?: boolean;
}): ClusterProvenance {
  return Object.freeze({
    nodeId: input.nodeId,
    localRoot: input.localRoot,
    clusterHash: input.clusterHash,
    lineage: Object.freeze(input.lineage.map((e) => Object.freeze({ ...e }))),
    flourishingScore: input.flourishingScore,
    humanVeto: input.humanVeto ?? false,
    sealedAt: new Date().toISOString(),
  });
}

function pickFlourishing(metadata: Record<string, unknown> | undefined): number | undefined {
  if (!metadata) return undefined;
  const v = (metadata as Record<string, unknown>)['flourishingScore'];
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  return undefined;
}

function pickFlourishingFromMeta(trace: PheromoneTrace): number {
  const meta = trace.metadata;
  if (!meta) return 0;
  const v = (meta as Record<string, unknown>)['flourishingScore'];
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  return 0;
}

function cosineFor(context: ContextTensor, trace: PheromoneTrace): number {
  const a = context;
  const b = trace.context;
  const len = Math.min(a.length, b.length);
  if (len === 0) return 0;
  let dot = 0;
  let aMag = 0;
  let bMag = 0;
  for (let i = 0; i < len; i += 1) {
    const av = a[i];
    const bv = b[i];
    dot += av * bv;
    aMag += av * av;
    bMag += bv * bv;
  }
  if (aMag === 0 || bMag === 0) return 0;
  return dot / Math.sqrt(aMag * bMag);
}
