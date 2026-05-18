import { canonicalDigest } from './canonicalEncoding';
import type { PheromoneTrace } from './types';

/**
 * One hop in a multi-node cluster audit chain — pairs a logical node id with
 * that node's current stigmergy tip hash at a stable epoch counter.
 */
export interface ClusterHop {
  readonly nodeId: string;
  readonly merkleRoot: string;
  readonly clusterEpoch: number;
}

/**
 * Cross-node provenance envelope. The {@link ClusterProvenanceEnvelope.chainDigest}
 * commits to the ordered hop list so downstream verifiers can detect reordering.
 */
export interface ClusterProvenanceEnvelope {
  readonly hops: readonly ClusterHop[];
  readonly chainDigest: string;
}

export interface MerkleInclusionProof {
  /** Sibling digests from leaf toward root (empty = trust-on-first-use). */
  readonly siblings: readonly string[];
  readonly leafIndex: number;
}

/**
 * Deterministic fold of multiple node-local Merkle tips into one cluster-wide
 * digest. Ordering is lexicographic on root hex so every node computes the same
 * value given the same multiset of roots.
 */
export function mergeRemoteRoots(roots: readonly (string | undefined)[]): string {
  const sorted = [...new Set(roots.filter((r): r is string => Boolean(r)))].sort((a, b) =>
    a.localeCompare(b),
  );
  return canonicalDigest({ type: 'MCOP_CLUSTER_MERGED_ROOT', roots: sorted });
}

export function buildClusterChainDigest(hops: readonly ClusterHop[]): string {
  return canonicalDigest({ type: 'MCOP_CLUSTER_PROVENANCE_CHAIN', hops });
}

export function sealClusterProvenanceEnvelope(hops: readonly ClusterHop[]): ClusterProvenanceEnvelope {
  return Object.freeze({
    hops,
    chainDigest: buildClusterChainDigest(hops),
  });
}

/**
 * Serialises a {@link PheromoneTrace} for gossip transports — numeric arrays
 * stay as plain numbers for RFC 8785 parity with the triad.
 */
export function serialiseTraceForCluster(trace: PheromoneTrace): Record<string, unknown> {
  return {
    id: trace.id,
    hash: trace.hash,
    parentHash: trace.parentHash ?? null,
    context: trace.context,
    magnitude: trace.magnitude ?? null,
    synthesisVector: trace.synthesisVector,
    weight: trace.weight,
    metadata: trace.metadata ?? null,
    timestamp: trace.timestamp,
  };
}

export function deserialiseTraceFromCluster(payload: Record<string, unknown>): PheromoneTrace {
  const context = payload.context;
  const synthesisVector = payload.synthesisVector;
  if (!Array.isArray(context) || !Array.isArray(synthesisVector)) {
    throw new Error('cluster trace payload requires context and synthesisVector arrays');
  }
  const id = typeof payload.id === 'string' ? payload.id : '';
  const hash = typeof payload.hash === 'string' ? payload.hash : '';
  const parentHash = typeof payload.parentHash === 'string' ? payload.parentHash : undefined;
  const weight = typeof payload.weight === 'number' ? payload.weight : 0;
  const timestamp = typeof payload.timestamp === 'string' ? payload.timestamp : new Date().toISOString();
  const metadata = payload.metadata && typeof payload.metadata === 'object' && !Array.isArray(payload.metadata)
    ? (payload.metadata as Record<string, unknown>)
    : undefined;
  const magnitude = typeof payload.magnitude === 'number' ? payload.magnitude : undefined;
  return {
    id,
    hash,
    parentHash,
    context: context.map(Number),
    magnitude,
    synthesisVector: synthesisVector.map(Number),
    weight,
    metadata,
    timestamp,
  };
}
