/**
 * @jest-environment node
 */

import {
  RedisStreamsGossipTransport,
  type GossipMessage,
  type RedisStreamsClient,
} from '../cluster';

class FakeRedisStreams implements RedisStreamsClient {
  public readonly entries: Array<{ id: string; fields: Record<string, string> }> = [];

  async xAdd(_stream: string, _id: '*', fields: Record<string, string>): Promise<string> {
    const id = `${this.entries.length + 1}-0`;
    this.entries.push({ id, fields });
    return id;
  }

  async xRead(_stream: string, lastId: string, count: number) {
    const lastSeq = Number(lastId.split('-')[0] ?? '0');
    return this.entries
      .filter((entry) => Number(entry.id.split('-')[0]) > lastSeq)
      .slice(0, count)
      .map((entry) => ({ id: entry.id, fields: entry.fields }));
  }
}

const message: GossipMessage = {
  type: 'trace',
  from: 'node-a',
  payload: { traceId: 'trace-1' },
  seq: 1,
  timestamp: '2026-05-19T00:00:00.000Z',
};

describe('RedisStreamsGossipTransport', () => {
  it('publishes the canonical gossip envelope to Redis Streams', async () => {
    const redis = new FakeRedisStreams();
    const transport = new RedisStreamsGossipTransport({
      nodeId: 'node-a',
      members: ['node-a', 'node-b'],
      client: redis,
    });

    await transport.publish(message);

    expect(redis.entries).toHaveLength(1);
    expect(redis.entries[0].fields).toEqual({
      envelope: JSON.stringify(message),
    });
    expect(transport.members()).toEqual(['node-a', 'node-b']);
  });

  it('polls cross-process messages and delivers them to subscribers once', async () => {
    const redis = new FakeRedisStreams();
    const publisher = new RedisStreamsGossipTransport({
      nodeId: 'node-a',
      members: ['node-a', 'node-b'],
      client: redis,
    });
    const subscriber = new RedisStreamsGossipTransport({
      nodeId: 'node-b',
      members: ['node-a', 'node-b'],
      client: redis,
    });
    const seen: GossipMessage[] = [];
    subscriber.subscribe((incoming) => seen.push(incoming));

    await publisher.publish(message);
    await subscriber.pollOnce();
    await subscriber.pollOnce();

    expect(seen).toEqual([message]);
  });
});
