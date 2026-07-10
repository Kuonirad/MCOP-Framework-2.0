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
  ClusterReplayBoundary,
  ClusterReplayBundle,
  ClusterReplayTrace,
  ClusterTraceAdmissionReceipt,
  GossipMessage,
  GossipTransport,
  NodeId,
  RemoteTraceWriteResult,
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
  private readonly remoteTraces = new Map<string, ClusterReplayTrace>();
  private readonly verifiedReplayTraces = new Map<string, ClusterReplayTrace>();
  private readonly localReplayTraces = new Map<string, ClusterReplayTrace>();
  private readonly replayCapacity: number;
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
    this.replayCapacity = config.maxTraces ?? 2048;
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
    const lineage = this.lineageSnapshot();
    const flourishingScore = pickFlourishing(metadata);
    const sealedAt = new Date().toISOString();
    const clusterHash = computeClusterHash(this.nodeId, trace, localRoot, {
      lineage,
      flourishingScore,
      humanVeto: false,
      sealedAt,
    });
    const provenance = sealClusterProvenance({
      nodeId: this.nodeId,
      localRoot,
      clusterHash,
      lineage,
      flourishingScore,
      sealedAt,
    });
    this.rememberLocalReplayTrace({
      nodeId: this.nodeId,
      trace,
      localRoot,
      clusterHash,
      provenance,
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
   * including this node's own root once it has written in the window.
   */
  getKnownRoots(): ReadonlyMap<NodeId, string> {
    const roots = new Map(this.remoteRoots);
    const localRoot = this.local.getMerkleRoot();
    if (localRoot !== undefined) roots.set(this.nodeId, localRoot);
    return roots;
  }

  /**
   * Fold a root snapshot into a single cluster Merkle root.
   *
   * The fold is intentionally simple and deterministic:
   *
   *   1. Sort `(nodeId, root)` pairs by `nodeId` (lexicographic).
   *   2. Take the canonical digest of the sorted list.
   *
   * When `roots` is supplied it is authoritative; receiver-local state is not
   * mixed in. Two nodes given the same snapshot therefore produce a
   * byte-identical root regardless of Map insertion order.
   */
  mergeRemoteRoots(roots: ReadonlyMap<NodeId, string> = this.getKnownRoots()): ClusterMerkleRoot {
    return mergeClusterRoots(roots);
  }

  /**
   * Verify and admit one remote trace. All cryptographic bindings are checked
   * before `remoteTraces` or `remoteRoots` can change.
   */
  writeTraceRemote(nodeId: NodeId, entry: ClusterReplayTrace): RemoteTraceWriteResult {
    const verified = verifyReplayTrace(nodeId, entry);
    if ('reason' in verified) return Object.freeze({ imported: false, reason: verified.reason });

    const replayKey = replayTraceKey(entry);
    const recorded = this.verifiedReplayTraces.get(replayKey);
    if (recorded?.clusterHash === entry.clusterHash) {
      return Object.freeze({ imported: false, reason: 'duplicate', receipt: verified.receipt });
    }

    const frozenEntry = freezeReplayTrace(entry);
    this.verifiedReplayTraces.set(replayKey, frozenEntry);
    const preferredWriterEntry = [...this.verifiedReplayTraces.values()]
      .filter((candidate) =>
        candidate.nodeId === nodeId && candidate.trace.id === entry.trace.id,
      )
      .reduce(selectPreferredTrace);
    this.remoteRoots.set(nodeId, preferredWriterEntry.localRoot);

    const existing = this.remoteTraces.get(entry.trace.id);
    const active = existing === undefined || selectPreferredTrace(existing, frozenEntry) === frozenEntry;
    if (active) this.remoteTraces.set(entry.trace.id, frozenEntry);
    return Object.freeze({ imported: true, active, receipt: verified.receipt });
  }

  /** Export a canonical, JSON-serializable replay window and its boundary anchors. */
  exportReplayBundle(): ClusterReplayBundle {
    const byTrace = new Map<string, ClusterReplayTrace>();
    for (const entry of this.localReplayTraces.values()) {
      byTrace.set(replayTraceKey(entry), entry);
    }
    for (const entry of this.verifiedReplayTraces.values()) {
      byTrace.set(replayTraceKey(entry), entry);
    }
    const traces = [...byTrace.values()]
      .sort((a, b) => compareNodeIds(a.nodeId, b.nodeId) || compareText(a.trace.id, b.trace.id))
      .map(freezeReplayTrace);
    const hashesByNode = new Map<NodeId, Set<string>>();
    for (const entry of traces) {
      const hashes = hashesByNode.get(entry.nodeId) ?? new Set<string>();
      hashes.add(entry.trace.hash);
      hashesByNode.set(entry.nodeId, hashes);
    }
    const boundaries = traces
      .filter((entry) =>
        entry.trace.parentHash !== undefined &&
        !hashesByNode.get(entry.nodeId)?.has(entry.trace.parentHash),
      )
      .map((entry) => Object.freeze({
        nodeId: entry.nodeId,
        firstTraceHash: entry.trace.hash,
        parentHash: entry.trace.parentHash as string,
      }));
    return Object.freeze({
      traces: Object.freeze(traces),
      boundaries: Object.freeze(boundaries),
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
   * Replay a window of cluster history from accepted traces and an observed
   * root snapshot. Every non-empty contributor must have a verified terminal
   * trace in the bundle.
   */
  static replay(
    bundle: ReadonlyArray<ClusterReplayTrace> | ClusterReplayBundle,
    rootsByNode: ReadonlyMap<NodeId, string>,
  ): ClusterMerkleRoot {
    const replayBundle = Array.isArray(bundle) ? undefined : bundle as ClusterReplayBundle;
    const traces = replayBundle?.traces ?? bundle as ReadonlyArray<ClusterReplayTrace>;
    const boundaries = replayBundle?.boundaries ?? [];
    const tracesByNode = new Map<NodeId, Map<string, ClusterReplayTrace>>();
    const activeByIdentity = new Map<string, ClusterReplayTrace>();

    for (const entry of traces) {
      if (!rootsByNode.has(entry.nodeId)) {
        throw new Error(`cluster replay contains uncommitted trace from ${entry.nodeId}`);
      }
      const verified = verifyReplayTrace(entry.nodeId, entry);
      if ('reason' in verified) {
        throw new Error(`cluster replay rejected ${entry.nodeId}/${entry.trace.id}: ${verified.reason}`);
      }
      const key = traceIdentityKey(entry);
      const previous = activeByIdentity.get(key);
      activeByIdentity.set(key, previous ? selectPreferredTrace(previous, entry) : entry);
    }

    for (const entry of activeByIdentity.values()) {
      const traces = tracesByNode.get(entry.nodeId) ?? new Map<string, ClusterReplayTrace>();
      traces.set(entry.trace.hash, entry);
      tracesByNode.set(entry.nodeId, traces);
    }

    const boundaryByNode = new Map<NodeId, ClusterReplayBoundary>();
    for (const boundary of boundaries) {
      if (boundaryByNode.has(boundary.nodeId) ||
          !isSha256(boundary.firstTraceHash) ||
          !isSha256(boundary.parentHash)) {
        throw new Error(`cluster replay rejected invalid boundary for ${boundary.nodeId}`);
      }
      const first = tracesByNode.get(boundary.nodeId)?.get(boundary.firstTraceHash);
      if (!first ||
          first.trace.parentHash !== boundary.parentHash ||
          tracesByNode.get(boundary.nodeId)?.has(boundary.parentHash)) {
        throw new Error(`cluster replay boundary does not match ${boundary.nodeId}`);
      }
      boundaryByNode.set(boundary.nodeId, boundary);
    }

    for (const [nodeId, root] of rootsByNode) {
      const traces = tracesByNode.get(nodeId);
      if (!traces || traces.size === 0) {
        throw new Error(`cluster replay missing terminal trace for ${nodeId}/${root}`);
      }
      const referencedParents = new Set<string>();
      for (const entry of traces.values()) {
        const parentHash = entry.trace.parentHash;
        if (parentHash === undefined) continue;
        if (!traces.has(parentHash)) {
          const boundary = boundaryByNode.get(nodeId);
          if (!boundary ||
              boundary.firstTraceHash !== entry.trace.hash ||
              boundary.parentHash !== parentHash) {
            throw new Error(`cluster replay missing ancestor ${nodeId}/${parentHash}`);
          }
          continue;
        }
        referencedParents.add(parentHash);
      }
      const heads = [...traces.values()].filter(
        (entry) => !referencedParents.has(entry.trace.hash),
      );
      if (heads.length !== 1) {
        throw new Error(`cluster replay found ${heads.length} heads for ${nodeId}`);
      }
      if (heads[0].trace.hash !== root) {
        throw new Error(`cluster replay root is not the verified head for ${nodeId}`);
      }
    }

    return mergeClusterRoots(rootsByNode);
  }

  // ----------------------------------------------------------------
  // Internal
  // ----------------------------------------------------------------

  private lineageSnapshot(): ReadonlyArray<{ nodeId: NodeId; root: string }> {
    const items: Array<{ nodeId: NodeId; root: string }> = [];
    for (const [nodeId, root] of this.getKnownRoots()) {
      items.push({ nodeId, root });
    }
    items.sort((a, b) => compareNodeIds(a.nodeId, b.nodeId));
    return Object.freeze(items);
  }

  private handleInbound(message: GossipMessage): void {
    if (message.from === this.nodeId) return;
    const lastSeq = this.seenSequences.get(message.from) ?? 0;
    if (message.seq <= lastSeq) return; // dedup; at-least-once → exactly-once locally

    if (message.type === 'trace') {
      const incoming = message.payload as {
        trace: PheromoneTrace;
        localRoot: string;
        clusterHash: string;
        provenance: ClusterProvenance;
      };
      const result = this.writeTraceRemote(message.from, {
        nodeId: message.from,
        trace: incoming.trace,
        localRoot: incoming.localRoot,
        clusterHash: incoming.clusterHash,
        provenance: incoming.provenance,
      });
      if (!result.imported && result.receipt === undefined) return;
      this.seenSequences.set(message.from, message.seq);
      if (this.vetoed.has(incoming.trace.id)) this.remoteTraces.delete(incoming.trace.id);
      return;
    }

    if (message.type === 'root') {
      // A bare root carries no terminal trace/provenance commitment. Keep the
      // wire variant reserved, but do not admit it until authenticated root
      // announcements have a proof-bearing envelope.
      return;
    }

    if (message.type === 'veto') {
      const traceId = String((message.payload as { traceId?: unknown })?.traceId ?? '');
      if (traceId) {
        this.vetoed.add(traceId);
        this.remoteTraces.delete(traceId);
        this.seenSequences.set(message.from, message.seq);
      }
      return;
    }

    if (message.type === 'capability') {
      const cap = message.payload as ClusterCapability;
      if (cap && typeof cap.cuda === 'boolean') {
        this.nodeCapabilities.set(message.from, cap);
        this.seenSequences.set(message.from, message.seq);
      }
      return;
    }
  }

  private rememberLocalReplayTrace(entry: ClusterReplayTrace): void {
    this.localReplayTraces.set(entry.trace.id, freezeReplayTrace(entry));
    while (this.localReplayTraces.size > this.replayCapacity) {
      const oldest = this.localReplayTraces.keys().next().value as string | undefined;
      if (oldest === undefined) break;
      this.localReplayTraces.delete(oldest);
    }
  }
}

// ----------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------

type RemoteTraceRejectReason = Extract<
  RemoteTraceWriteResult,
  { imported: false }
>['reason'];

/** Canonical root fold shared by live merge and offline replay. */
export function mergeClusterRoots(roots: ReadonlyMap<NodeId, string>): ClusterMerkleRoot {
  const contributors = [...roots.entries()]
    .map(([nodeId, root]) => {
      if (nodeId.length === 0) throw new Error('cluster root contributor has an empty nodeId');
      if (!isSha256(root)) throw new Error(`cluster root for ${nodeId} is not lowercase SHA-256`);
      return Object.freeze({ nodeId, root });
    })
    .sort((a, b) => compareNodeIds(a.nodeId, b.nodeId));
  const root = canonicalDigest({ type: 'MCOP_CLUSTER_ROOT', contributors });
  return Object.freeze({
    root,
    contributors: Object.freeze(contributors),
    sealedAt: new Date().toISOString(),
  });
}

function verifyReplayTrace(
  expectedNodeId: NodeId,
  entry: ClusterReplayTrace,
): { receipt: ClusterTraceAdmissionReceipt } | { reason: RemoteTraceRejectReason } {
  if (entry.nodeId !== expectedNodeId) return { reason: 'origin-mismatch' };
  if (!isSha256(entry.trace?.hash) || computeTraceHash(entry.trace) !== entry.trace.hash) {
    return { reason: 'trace-hash-mismatch' };
  }
  if (entry.localRoot !== entry.trace.hash) return { reason: 'local-root-mismatch' };

  const provenance = entry.provenance;
  const flourishingScore = pickFlourishingFromMeta(entry.trace);
  const recordedScore = provenance?.flourishingScore ?? 0;
  if (!provenance ||
      provenance.nodeId !== expectedNodeId ||
      provenance.localRoot !== entry.localRoot ||
      provenance.clusterHash !== entry.clusterHash ||
      provenance.humanVeto === true ||
      recordedScore !== flourishingScore ||
      !isCanonicalLineage(provenance.lineage, expectedNodeId, entry.localRoot) ||
      !isIsoTimestamp(provenance.sealedAt)) {
    return { reason: 'provenance-mismatch' };
  }
  if (!isSha256(entry.clusterHash) ||
      computeClusterHash(expectedNodeId, entry.trace, entry.localRoot, {
        lineage: provenance.lineage,
        flourishingScore: provenance.flourishingScore,
        humanVeto: provenance.humanVeto ?? false,
        sealedAt: provenance.sealedAt,
      }) !== entry.clusterHash) {
    return { reason: 'cluster-hash-mismatch' };
  }

  return {
    receipt: Object.freeze({
      scheme: 'MCOP_TRACE_ROOT_V1',
      nodeId: expectedNodeId,
      traceHash: entry.trace.hash,
      localRoot: entry.localRoot,
      clusterHash: entry.clusterHash,
    }),
  };
}

function computeTraceHash(trace: PheromoneTrace): string {
  const payload = trace.semanticContext !== undefined
    ? {
        id: trace.id,
        context: trace.context,
        synthesisVector: trace.synthesisVector,
        metadata: trace.metadata,
        weight: trace.weight,
        semanticContext: trace.semanticContext,
      }
    : {
        id: trace.id,
        context: trace.context,
        synthesisVector: trace.synthesisVector,
        metadata: trace.metadata,
        weight: trace.weight,
      };
  return canonicalDigest({ payload, parentHash: trace.parentHash ?? null });
}

function freezeReplayTrace(entry: ClusterReplayTrace): ClusterReplayTrace {
  return deepFreeze(JSON.parse(JSON.stringify(entry)) as ClusterReplayTrace);
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
    Object.freeze(value);
  }
  return value;
}

function isSha256(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
}

function compareNodeIds(a: NodeId, b: NodeId): number {
  return Buffer.compare(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));
}

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function replayTraceKey(entry: ClusterReplayTrace): string {
  return `${entry.nodeId}\u0000${entry.trace.id}\u0000${entry.clusterHash}`;
}

function traceIdentityKey(entry: ClusterReplayTrace): string {
  return `${entry.nodeId}\u0000${entry.trace.id}`;
}

function selectPreferredTrace(
  current: ClusterReplayTrace,
  incoming: ClusterReplayTrace,
): ClusterReplayTrace {
  const currentScore = current.provenance.flourishingScore ?? pickFlourishingFromMeta(current.trace);
  const incomingScore = incoming.provenance.flourishingScore ?? pickFlourishingFromMeta(incoming.trace);
  if (incomingScore > currentScore) return incoming;
  if (incomingScore < currentScore) return current;
  return incoming.clusterHash < current.clusterHash ? incoming : current;
}

function isCanonicalLineage(
  lineage: ClusterProvenance['lineage'],
  nodeId: NodeId,
  localRoot: string,
): boolean {
  if (!Array.isArray(lineage) || lineage.length === 0) return false;
  const seen = new Set<string>();
  for (let index = 0; index < lineage.length; index += 1) {
    const item = lineage[index];
    if (!item || item.nodeId.length === 0 || !isSha256(item.root) || seen.has(item.nodeId)) {
      return false;
    }
    if (index > 0 && compareNodeIds(lineage[index - 1].nodeId, item.nodeId) >= 0) return false;
    seen.add(item.nodeId);
  }
  return lineage.some((item) => item.nodeId === nodeId && item.root === localRoot);
}

function isIsoTimestamp(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
}

interface ProvenanceCommitment {
  lineage: ClusterProvenance['lineage'];
  flourishingScore?: number;
  humanVeto: boolean;
  sealedAt: string;
}

function computeClusterHash(
  nodeId: NodeId,
  trace: PheromoneTrace,
  localRoot: string,
  provenance: ProvenanceCommitment,
): string {
  return canonicalDigest({
    type: 'MCOP_CLUSTER_TRACE',
    nodeId,
    trace,
    localRoot,
    provenance,
  });
}

function sealClusterProvenance(input: {
  nodeId: NodeId;
  localRoot: string;
  clusterHash: string;
  lineage: ReadonlyArray<{ nodeId: NodeId; root: string }>;
  flourishingScore?: number;
  humanVeto?: boolean;
  sealedAt: string;
}): ClusterProvenance {
  return Object.freeze({
    nodeId: input.nodeId,
    localRoot: input.localRoot,
    clusterHash: input.clusterHash,
    lineage: Object.freeze(input.lineage.map((e) => Object.freeze({ ...e }))),
    flourishingScore: input.flourishingScore,
    humanVeto: input.humanVeto ?? false,
    sealedAt: input.sealedAt,
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
