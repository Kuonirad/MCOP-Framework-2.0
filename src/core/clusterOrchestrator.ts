import { mergeRemoteRoots } from './clusterProvenance';

export interface ClusterNodeCapabilities {
  readonly cudaAvailable?: boolean;
  readonly kernelBundleDigest?: string;
}

export interface ClusterNodeRegistration {
  readonly id: string;
  readonly capabilities: ClusterNodeCapabilities;
  lastHeartbeatMs: number;
  /** Logical shard key for write-heavy routing (placeholder). */
  shardKey: string;
}

/**
 * Minimal v3.0 cluster membership registry — heartbeat + capability exchange
 * for CUDA-aware orchestration. Network I/O is intentionally omitted; callers
 * wire transports in application code.
 */
export class ClusterOrchestrator {
  private readonly nodes = new Map<string, ClusterNodeRegistration>();
  private epoch = 0;

  registerNode(id: string, capabilities: ClusterNodeCapabilities = {}): void {
    const now = Date.now();
    this.nodes.set(id, {
      id,
      capabilities: { ...capabilities },
      lastHeartbeatMs: now,
      shardKey: this.defaultShardFor(id),
    });
  }

  heartbeat(nodeId: string): void {
    const node = this.nodes.get(nodeId);
    if (!node) return;
    node.lastHeartbeatMs = Date.now();
  }

  unregisterNode(nodeId: string): void {
    if (this.nodes.delete(nodeId)) {
      this.epoch += 1;
    }
  }

  getEpoch(): number {
    return this.epoch;
  }

  listNodes(): readonly ClusterNodeRegistration[] {
    return [...this.nodes.values()];
  }

  getNode(id: string): ClusterNodeRegistration | undefined {
    return this.nodes.get(id);
  }

  /**
   * Folds every node's last gossiped Merkle tip (including an optional local
   * root) into the deterministic {@link mergeRemoteRoots} digest.
   */
  mergeGossipedRoots(localRoot: string | undefined, rootsByNode: Readonly<Record<string, string>>): string {
    const values = [localRoot, ...Object.values(rootsByNode)];
    return mergeRemoteRoots(values);
  }

  /** Marks failure and bumps epoch so ClusterStigmergy layers can re-shard. */
  onNodeFailure(nodeId: string): void {
    if (this.nodes.has(nodeId)) {
      this.nodes.delete(nodeId);
      this.epoch += 1;
    }
  }

  private defaultShardFor(id: string): string {
    let h = 0;
    for (let i = 0; i < id.length; i += 1) h = (h * 31 + id.charCodeAt(i)) >>> 0;
    return `shard-${h % 8}`;
  }
}
