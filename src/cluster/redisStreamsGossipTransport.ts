import type { GossipMessage, GossipTransport, NodeId } from './types';

export interface RedisStreamEntry {
  readonly id: string;
  readonly fields: Record<string, string>;
}

export interface RedisStreamsClient {
  xAdd(stream: string, id: '*', fields: Record<string, string>): Promise<string> | string;
  xRead(stream: string, lastId: string, count: number): Promise<ReadonlyArray<RedisStreamEntry>> | ReadonlyArray<RedisStreamEntry>;
}

export interface RedisStreamsGossipTransportConfig {
  readonly nodeId: NodeId;
  readonly members: ReadonlyArray<NodeId>;
  readonly client: RedisStreamsClient;
  readonly stream?: string;
  readonly readBatchSize?: number;
}

export class RedisStreamsGossipTransport implements GossipTransport {
  private readonly nodeId: NodeId;
  private readonly nodes: ReadonlyArray<NodeId>;
  private readonly client: RedisStreamsClient;
  private readonly stream: string;
  private readonly readBatchSize: number;
  private readonly handlers: Array<(message: GossipMessage) => void> = [];
  private readonly seenStreamIds = new Set<string>();
  private lastId = '0-0';

  constructor(config: RedisStreamsGossipTransportConfig) {
    this.nodeId = config.nodeId;
    this.nodes = Object.freeze([...new Set(config.members)].sort());
    this.client = config.client;
    this.stream = config.stream ?? 'mcop:gossip';
    this.readBatchSize = Math.max(1, Math.floor(config.readBatchSize ?? 128));
  }

  async publish(message: GossipMessage): Promise<void> {
    await this.client.xAdd(this.stream, '*', {
      envelope: JSON.stringify(message),
    });
  }

  subscribe(handler: (message: GossipMessage) => void): () => void {
    this.handlers.push(handler);
    return () => {
      const idx = this.handlers.indexOf(handler);
      if (idx >= 0) this.handlers.splice(idx, 1);
    };
  }

  members(): ReadonlyArray<NodeId> {
    return this.nodes;
  }

  async pollOnce(): Promise<number> {
    const entries = await this.client.xRead(this.stream, this.lastId, this.readBatchSize);
    let delivered = 0;
    for (const entry of entries) {
      this.lastId = entry.id;
      if (this.seenStreamIds.has(entry.id)) continue;
      this.seenStreamIds.add(entry.id);
      const raw = entry.fields.envelope;
      if (!raw) continue;
      const message = JSON.parse(raw) as GossipMessage;
      if (message.from === this.nodeId) continue;
      for (const handler of [...this.handlers]) {
        try {
          handler(message);
          delivered += 1;
        } catch {
          // Keep transport delivery isolated from subscriber failures.
        }
      }
    }
    return delivered;
  }
}
