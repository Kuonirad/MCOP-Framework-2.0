/**
 * In-process gossip bus used by `ClusterStigmergy` tests and embedded
 * single-process demos.
 *
 * Provides at-least-once delivery semantics with strict ordering per
 * source node. Production deployments swap this for a NATS / libp2p /
 * Redis-Streams transport that honours the same {@link GossipTransport}
 * contract; the wire format is exactly the same JSON envelope so the
 * substitution is one-line.
 *
 * The bus is intentionally synchronous-microtask: it schedules
 * delivery via `queueMicrotask` so callers cannot accidentally observe
 * a partially-committed state during a synchronous record. Tests can
 * `await new Promise(setImmediate)` between events to drain.
 */

import type { GossipMessage, GossipTransport, NodeId } from './types';

export class InMemoryGossipBus implements GossipTransport {
  private readonly nodes = new Set<NodeId>();
  private readonly handlers: Array<(message: GossipMessage) => void> = [];

  register(nodeId: NodeId): void {
    this.nodes.add(nodeId);
  }

  unregister(nodeId: NodeId): void {
    this.nodes.delete(nodeId);
  }

  members(): ReadonlyArray<NodeId> {
    return Object.freeze([...this.nodes].sort());
  }

  publish(message: GossipMessage): void {
    // Schedule delivery so the sender's own state has already been
    // committed by the time observers run. Mirrors NATS subject-fanout.
    const snapshot = [...this.handlers];
    queueMicrotask(() => {
      for (const handler of snapshot) {
        try {
          handler(message);
        } catch {
          // Subscribers must not propagate exceptions back into the bus.
        }
      }
    });
  }

  subscribe(handler: (message: GossipMessage) => void): () => void {
    this.handlers.push(handler);
    return () => {
      const idx = this.handlers.indexOf(handler);
      if (idx >= 0) this.handlers.splice(idx, 1);
    };
  }
}
