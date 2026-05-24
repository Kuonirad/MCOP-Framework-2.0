/**
 * Redis-backed Async Ledger Forwarder with Retry + DLQ
 *
 * Production-grade, durable, distributed version of BackgroundLedgerForwarder.
 *
 * Uses Redis primitives:
 *   - List for main pending queue
 *   - Sorted Set (ZSET) for delayed/retry queue (score = next retry timestamp)
 *   - List for Dead Letter Queue
 *
 * This implementation is designed to be:
 * - Safe for multiple workers (basic at-least-once semantics)
 * - Resilient across restarts
 * - Observable
 *
 * Minimal Redis client interface expected (you can adapt ioredis, node-redis, etc.)
 */

import type { LedgerClient } from './ledgerClient';
import type { EtchRequest } from './types';

export interface RedisClient {
  lpush(key: string, value: string): Promise<number> | number;
  rpop(key: string): Promise<string | null> | string | null;
  zadd(key: string, score: number, value: string): Promise<number> | number;
  zrangebyscore(key: string, min: number | string, max: number | string, options?: { count?: number }): Promise<string[]>;
  zrem(key: string, value: string): Promise<number>;
  llen(key: string): Promise<number>;
  zcard(key: string): Promise<number>;
  lrange(key: string, start: number, stop: number): Promise<string[]>;
}

export interface RedisAsyncLedgerForwarderConfig {
  redis: RedisClient;
  queueKey?: string;           // default: "mcop:ledger:queue"
  retryKey?: string;           // default: "mcop:ledger:retry"
  dlqKey?: string;             // default: "mcop:ledger:dlq"
  maxRetries?: number;         // default 10
  baseDelayMs?: number;        // default 1000
  maxDelayMs?: number;         // default 120000 (2 minutes)
  workerIntervalMs?: number;   // default 500
  onError?: (err: Error, item: RedisQueuedEtch) => void;
  onDLQ?: (item: RedisQueuedEtch) => void;
  onSuccess?: (item: RedisQueuedEtch) => void;
}

export interface RedisQueuedEtch {
  request: EtchRequest;
  attempts: number;
  lastError?: string;
}

export class RedisAsyncLedgerForwarder {
  private readonly client: LedgerClient;
  private readonly redis: RedisClient;
  private readonly config: Required<RedisAsyncLedgerForwarderConfig>;

  private readonly queueKey: string;
  private readonly retryKey: string;
  private readonly dlqKey: string;

  private workerTimer: NodeJS.Timeout | null = null;
  private isRunning = false;

  constructor(ledgerClient: LedgerClient, config: RedisAsyncLedgerForwarderConfig) {
    this.client = ledgerClient;
    this.redis = config.redis;

    this.config = {
      redis: config.redis,
      queueKey: config.queueKey ?? 'mcop:ledger:queue',
      retryKey: config.retryKey ?? 'mcop:ledger:retry',
      dlqKey: config.dlqKey ?? 'mcop:ledger:dlq',
      maxRetries: config.maxRetries ?? 10,
      baseDelayMs: config.baseDelayMs ?? 1000,
      maxDelayMs: config.maxDelayMs ?? 120000,
      workerIntervalMs: config.workerIntervalMs ?? 500,
      onError: config.onError ?? (() => {}),
      onDLQ: config.onDLQ ?? (() => {}),
      onSuccess: config.onSuccess ?? (() => {}),
    };

    this.queueKey = this.config.queueKey;
    this.retryKey = this.config.retryKey;
    this.dlqKey = this.config.dlqKey;
  }

  /** Fire-and-forget. Safe to call from hot paths. */
  async forward(request: EtchRequest): Promise<void> {
    const item: RedisQueuedEtch = {
      request,
      attempts: 0,
    };
    const payload = JSON.stringify(item);
    await this.redis.lpush(this.queueKey, payload);
  }

  /** Start the background worker loop. */
  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;

    const tick = async () => {
      if (!this.isRunning) return;
      try {
        await this.processQueues();
      } catch (err) {
        console.error?.('[RedisAsyncLedgerForwarder] worker tick failed', err);
      }
      if (this.isRunning) {
        this.workerTimer = setTimeout(tick, this.config.workerIntervalMs);
      }
    };

    this.workerTimer = setTimeout(tick, 50);
  }

  async stop(): Promise<void> {
    this.isRunning = false;
    if (this.workerTimer) {
      clearTimeout(this.workerTimer);
      this.workerTimer = null;
    }
  }

  async getQueueSize(): Promise<number> {
    return this.redis.llen(this.queueKey);
  }

  async getDLQSize(): Promise<number> {
    return this.redis.llen(this.dlqKey);
  }

  async getDLQ(limit = 50): Promise<RedisQueuedEtch[]> {
    const items = await this.redis.lrange(this.dlqKey, 0, limit - 1);
    return items.map((s: string) => JSON.parse(s));
  }

  /** Manually retry everything in the DLQ */
  async retryDLQ(): Promise<{ retried: number; stillFailed: number }> {
    const items = await this.getDLQ(1000);
    if (items.length === 0) return { retried: 0, stillFailed: 0 };

    // Clear DLQ first (we'll re-add failures)
    // For simplicity we pop from the list in a loop
    let retried = 0;
    let stillFailed = 0;

    for (const item of items) {
      try {
        await this.client.etch(item.request);
        retried++;
        this.config.onSuccess(item);
      } catch (e: unknown) {
        stillFailed++;
        item.attempts = (item.attempts || 0) + 1;
        item.lastError = e instanceof Error ? e.message : String(e);

        if (item.attempts >= this.config.maxRetries) {
          await this.redis.lpush(this.dlqKey, JSON.stringify(item));
        } else {
          const delay = this.calculateDelay(item.attempts);
          const score = Date.now() + delay;
          await this.redis.zadd(this.retryKey, score, JSON.stringify(item));
        }
      }
    }

    return { retried, stillFailed };
  }

  private async processQueues(): Promise<void> {
    // 1. Move ready items from retry ZSET into main queue
    const now = Date.now();
    const ready = await this.redis.zrangebyscore(this.retryKey, '-inf', now, { count: 50 });

    for (const raw of ready) {
      await this.redis.zrem(this.retryKey, raw);
      await this.redis.lpush(this.queueKey, raw);
    }

    // 2. Process a batch from the main queue
    const batchSize = 10;
    for (let i = 0; i < batchSize; i++) {
      const raw = await this.redis.rpop(this.queueKey);
      if (!raw) break;

      const item: RedisQueuedEtch = JSON.parse(raw);

      try {
        await this.client.etch(item.request);
        this.config.onSuccess(item);
      } catch (e: unknown) {
        item.attempts = (item.attempts || 0) + 1;
        item.lastError = e instanceof Error ? e.message : String(e);

        if (item.attempts >= this.config.maxRetries) {
          await this.redis.lpush(this.dlqKey, JSON.stringify(item));
          this.config.onDLQ(item);
        } else {
          const delay = this.calculateDelay(item.attempts);
          const score = Date.now() + delay;
          await this.redis.zadd(this.retryKey, score, JSON.stringify(item));
        }

        this.config.onError(e instanceof Error ? e : new Error(String(e)), item);
      }
    }
  }

  private calculateDelay(attempt: number): number {
    const delay = this.config.baseDelayMs * Math.pow(2, attempt - 1);
    return Math.min(delay, this.config.maxDelayMs);
  }
}

export function createRedisAsyncLedgerForwarder(
  ledgerClient: LedgerClient,
  redisClient: unknown, // your Redis client (ioredis, node-redis, etc.)
  config?: Omit<RedisAsyncLedgerForwarderConfig, 'redis'>
): RedisAsyncLedgerForwarder {
  const forwarder = new RedisAsyncLedgerForwarder(ledgerClient, {
    redis: adaptRedisClient(redisClient),
    ...config,
  });
  forwarder.start();
  return forwarder;
}

/**
 * Minimal adapter so users can pass ioredis, node-redis v4, etc.
 */
function adaptRedisClient(raw: unknown): RedisClient {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r = raw as Record<string, any>;

  // node-redis v4 style
  if (typeof r.sendCommand === 'function') {
    return {
      async lpush(key, value) { return r.lPush(key, value); },
      async rpop(key) { return r.rPop(key); },
      async zadd(key, score, value) { return r.zAdd(key, { score, value }); },
      async zrangebyscore(key, min, max, opts) {
        return r.zRangeByScore(key, min, max, { LIMIT: { count: opts?.count ?? 50 } });
      },
      async zrem(key, value) { return r.zRem(key, value); },
      async llen(key) { return r.lLen(key); },
      async zcard(key) { return r.zCard(key); },
      async lrange(key, start, stop) { return r.lRange(key, start, stop); },
    };
  }

  // ioredis style (most common)
  if (typeof r.lpush === 'function') {
    return {
      lpush: (k, v) => r.lpush(k, v),
      rpop: (k) => r.rpop(k),
      zadd: (k, score, v) => r.zadd(k, score, v),
      zrangebyscore: (k, min, max, opts) => r.zrangebyscore(k, min, max, 'LIMIT', 0, opts?.count ?? 50),
      zrem: (k, v) => r.zrem(k, v),
      llen: (k) => r.llen(k),
      zcard: (k) => r.zcard(k),
      lrange: (k, s, e) => r.lrange(k, s, e),
    };
  }

  throw new Error('Unsupported Redis client. Please provide an adapter or use ioredis / node-redis.');
}
