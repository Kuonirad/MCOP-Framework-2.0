/**
 * Cluster-mode type surface.
 *
 * The single-node MCOP substrate evolves into a cluster-coordinated
 * substrate by introducing four primitives that all carry
 * cryptographic lineage:
 *
 *   1. {@link NodeId}              — globally unique node identifier
 *   2. {@link MerkleRoot}          — RFC 8785 SHA-256 root of a trace bundle
 *   3. {@link ClusterTrace}        — single pheromone trace plus the
 *                                    issuing node and its Merkle root
 *   4. {@link ClusterMerkleRoot}   — deterministic fold of per-node
 *                                    roots, the cluster's audit anchor
 *
 * Every cross-node operation produces a {@link ClusterProvenance}
 * envelope so the replay subsystem can reconstruct a global timeline
 * from the gossiped Merkle roots alone.
 */

import type { PheromoneTrace } from '../core/types';

export type NodeId = string;
export type MerkleRoot = string;

export interface ClusterCapability {
  readonly cuda: boolean;
  readonly resolvedFrom?: string;
  readonly device?: string;
}

export interface ClusterTrace {
  readonly nodeId: NodeId;
  readonly trace: PheromoneTrace;
  /** Merkle root of the issuing node's local stigmergy at the moment the trace was minted. */
  readonly localRoot: MerkleRoot;
  /** RFC 8785 digest of the trace, root, and provenance commitment. */
  readonly clusterHash: string;
}

/** A trace plus the provenance envelope required for offline cluster replay. */
export interface ClusterReplayTrace extends ClusterTrace {
  readonly provenance: ClusterProvenance;
}

/** Explicit anchor for a retained window whose predecessor is outside the bundle. */
export interface ClusterReplayBoundary {
  readonly nodeId: NodeId;
  readonly firstTraceHash: string;
  readonly parentHash: string;
}

export interface ClusterReplayBundle {
  readonly traces: ReadonlyArray<ClusterReplayTrace>;
  readonly boundaries: ReadonlyArray<ClusterReplayBoundary>;
}

/** Receipt describing the integrity checks applied before remote admission. */
export interface ClusterTraceAdmissionReceipt {
  readonly scheme: 'MCOP_TRACE_ROOT_V1';
  readonly nodeId: NodeId;
  readonly traceHash: string;
  readonly localRoot: MerkleRoot;
  readonly clusterHash: string;
}

export type RemoteTraceWriteResult =
  | {
      readonly imported: true;
      /** Whether this verified sibling is active on the resonance surface. */
      readonly active: boolean;
      readonly receipt: ClusterTraceAdmissionReceipt;
    }
  | {
      readonly imported: false;
      readonly receipt?: ClusterTraceAdmissionReceipt;
      readonly reason:
    | 'duplicate'
    | 'origin-mismatch'
    | 'trace-hash-mismatch'
    | 'local-root-mismatch'
    | 'cluster-hash-mismatch'
    | 'provenance-mismatch';
    };

export interface ClusterMerkleRoot {
  /** Deterministic fold across the supplied root snapshot. Byte-stable across reruns. */
  readonly root: MerkleRoot;
  /** Sorted node roots that produced {@link root}, in the order they were folded. */
  readonly contributors: ReadonlyArray<{ readonly nodeId: NodeId; readonly root: MerkleRoot }>;
  /** ISO timestamp the fold was sealed. */
  readonly sealedAt: string;
}

export interface ClusterProvenance {
  /** Originating node. */
  readonly nodeId: NodeId;
  /** The node's local Merkle root *after* committing the trace. */
  readonly localRoot: MerkleRoot;
  /** Per-trace canonical fingerprint — unique across the cluster. */
  readonly clusterHash: string;
  /** Chain of node IDs and Merkle roots this operation depends on. */
  readonly lineage: ReadonlyArray<{ readonly nodeId: NodeId; readonly root: MerkleRoot }>;
  /** Optional human-veto flag — propagates across the cluster and wins conflict resolution. */
  readonly humanVeto?: boolean;
  /** Optional eudaimonic flourishing score used to break ties between concurrent edits. */
  readonly flourishingScore?: number;
  /** ISO timestamp the envelope was sealed. */
  readonly sealedAt: string;
}

export interface GossipMessage {
  readonly type: 'trace' | 'root' | 'veto' | 'capability';
  readonly from: NodeId;
  readonly payload: unknown;
  /** Monotonic logical sequence number per source node — duplicates are deduplicated. */
  readonly seq: number;
  readonly timestamp: string;
  /** Optional Ed25519/HMAC signature for mTLS-style trust. */
  readonly signature?: string;
}

export interface GossipTransport {
  /** Broadcast a message to every other node in the membership. */
  publish(message: GossipMessage): Promise<void> | void;
  /**
   * Subscribe to inbound messages from other nodes. Implementations must
   * deliver each message at-least-once; ClusterStigmergy handles
   * deduplication via {@link GossipMessage.seq}.
   */
  subscribe(handler: (message: GossipMessage) => void): () => void;
  /** Inspect the current membership. */
  members(): ReadonlyArray<NodeId>;
}
