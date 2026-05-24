/**
 * Tests for RedisAsyncLedgerForwarder using a minimal in-memory Redis stub.
 */
import {
  RedisAsyncLedgerForwarder,
  createRedisAsyncLedgerForwarder,
  type RedisClient,
} from '../ledger/redisAsyncLedgerForwarder';
import type { LedgerClient } from '../ledger/ledgerClient';
import type { EtchReceipt, EtchRequest, LedgerExportBundle, LedgerQueryResult, VerifyResult } from '../ledger/types';

class FakeRedis implements RedisClient {
  lists = new Map<string, string[]>();
  sets = new Map<string, Map<string, number>>();

  private getList(key: string): string[] {
    if (!this.lists.has(key)) this.lists.set(key, []);
    return this.lists.get(key)!;
  }
  private getSet(key: string): Map<string, number> {
    if (!this.sets.has(key)) this.sets.set(key, new Map());
    return this.sets.get(key)!;
  }

  async lpush(key: string, value: string): Promise<number> {
    const list = this.getList(key);
    list.unshift(value);
    return list.length;
  }
  async rpop(key: string): Promise<string | null> {
    const list = this.getList(key);
    return list.pop() ?? null;
  }
  async zadd(key: string, score: number, value: string): Promise<number> {
    this.getSet(key).set(value, score);
    return 1;
  }
  async zrangebyscore(key: string, min: number | string, max: number | string, options?: { count?: number }): Promise<string[]> {
    const set = this.getSet(key);
    const minN = min === '-inf' ? -Infinity : Number(min);
    const maxN = max === '+inf' ? Infinity : Number(max);
    const all = [...set.entries()]
      .filter(([, score]) => score >= minN && score <= maxN)
      .sort((a, b) => a[1] - b[1])
      .map(([v]) => v);
    return options?.count ? all.slice(0, options.count) : all;
  }
  async zrem(key: string, value: string): Promise<number> {
    const set = this.getSet(key);
    const had = set.delete(value);
    return had ? 1 : 0;
  }
  async llen(key: string): Promise<number> {
    return this.getList(key).length;
  }
  async zcard(key: string): Promise<number> {
    return this.getSet(key).size;
  }
  async lrange(key: string, start: number, stop: number): Promise<string[]> {
    const list = this.getList(key);
    const end = stop === -1 ? list.length : stop + 1;
    return list.slice(start, end);
  }
}

class FakeLedger implements LedgerClient {
  readonly source = 'embedded' as const;
  public calls = 0;
  public failTimes = 0;
  async etch(req: EtchRequest): Promise<EtchReceipt> {
    this.calls++;
    if (this.calls <= this.failTimes) {
      throw new Error(`forced fail #${this.calls}`);
    }
    return {
      id: `r-${this.calls}`,
      tenantId: req.tenantId,
      leafHash: 'h',
      forestRoot: 'root',
      inclusionProof: [],
      sealedAt: new Date().toISOString(),
    };
  }
  async query(): Promise<LedgerQueryResult> { return { leaves: [], forestRoot: 'root' }; }
  async verifyReceipt(): Promise<VerifyResult> { return { valid: true }; }
  async exportFullLedger(tenantId: string): Promise<LedgerExportBundle> {
    return {
      version: 'mcop-ledger-export/1.0',
      tenantId,
      forestRoot: 'root',
      exportedAt: new Date().toISOString(),
      leaves: [],
    };
  }
}

function req(): EtchRequest {
  return { tenantId: 't', context: [1], score: 0.1, note: 'n' };
}

describe('RedisAsyncLedgerForwarder', () => {
  it('forwards requests through the queue', async () => {
    const redis = new FakeRedis();
    const ledger = new FakeLedger();
    const forwarder = new RedisAsyncLedgerForwarder(ledger, {
      redis,
      workerIntervalMs: 10,
      maxRetries: 2,
    });
    forwarder.start();
    await forwarder.forward(req());
    expect(await forwarder.getQueueSize()).toBe(1);
    await new Promise(r => setTimeout(r, 120));
    expect(ledger.calls).toBeGreaterThan(0);
    await forwarder.stop();
  });

  it('moves failing items into the DLQ after maxRetries', async () => {
    const redis = new FakeRedis();
    const ledger = new FakeLedger();
    ledger.failTimes = 10;
    const onDLQ = jest.fn();
    const forwarder = new RedisAsyncLedgerForwarder(ledger, {
      redis,
      workerIntervalMs: 10,
      maxRetries: 1,
      baseDelayMs: 5,
      maxDelayMs: 10,
      onDLQ,
    });
    forwarder.start();
    await forwarder.forward(req());
    await new Promise(r => setTimeout(r, 200));
    expect(await forwarder.getDLQSize()).toBeGreaterThanOrEqual(1);
    expect(onDLQ).toHaveBeenCalled();
    await forwarder.stop();
  });

  it('retryDLQ re-processes failed items', async () => {
    const redis = new FakeRedis();
    const ledger = new FakeLedger();
    ledger.failTimes = 5;
    const forwarder = new RedisAsyncLedgerForwarder(ledger, {
      redis,
      workerIntervalMs: 5,
      maxRetries: 1,
      baseDelayMs: 1,
      maxDelayMs: 5,
    });
    forwarder.start();
    await forwarder.forward(req());
    await new Promise(r => setTimeout(r, 200));
    const before = await forwarder.getDLQSize();
    expect(before).toBeGreaterThanOrEqual(1);
    ledger.failTimes = 0;
    const out = await forwarder.retryDLQ();
    expect(out.retried + out.stillFailed).toBeGreaterThanOrEqual(1);
    await forwarder.stop();
  });

  it('start() is idempotent and stop() is safe to call repeatedly', async () => {
    const redis = new FakeRedis();
    const ledger = new FakeLedger();
    const forwarder = new RedisAsyncLedgerForwarder(ledger, { redis });
    forwarder.start();
    forwarder.start();
    await forwarder.stop();
    await forwarder.stop();
  });
});

describe('createRedisAsyncLedgerForwarder', () => {
  it('returns a started forwarder when given a Redis-like object', async () => {
    const ledger = new FakeLedger();
    const redis = new FakeRedis();
    const forwarder = createRedisAsyncLedgerForwarder(ledger, redis, {
      workerIntervalMs: 10,
    });
    await forwarder.forward(req());
    expect(await forwarder.getQueueSize()).toBe(1);
    await forwarder.stop();
  });
});
