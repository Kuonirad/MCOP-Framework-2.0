/**
 * Background / Async Ledger Forwarder with Retry + DLQ
 *
 * Production-grade component for reliably forwarding EtchRequests to the
 * Hosted Provenance Ledger (or any LedgerClient) without blocking the main
 * MCOP / organelle execution path.
 *
 * Features:
 * - Fire-and-forget `forward()` API
 * - Configurable exponential backoff retry
 * - Dead Letter Queue for permanently failed items
 * - Manual retry of DLQ items
 * - Graceful shutdown support
 * - Observability hooks (optional)
 *
 * Usage:
 *   const forwarder = new BackgroundLedgerForwarder(ledgerClient, {
 *     maxRetries: 8,
 *     baseDelayMs: 500,
 *     maxDelayMs: 30000,
 *   });
 *
 *   // In HolographicEtch or processOrganelleResult:
 *   forwarder.forward(etchRequest);
 */

import type { LedgerClient } from './ledgerClient';
import type { EtchRequest } from './types';

export interface AsyncLedgerForwarderConfig {
  maxRetries?: number;          // default 8
  baseDelayMs?: number;         // default 500
  maxDelayMs?: number;          // default 30000
  workerIntervalMs?: number;    // how often the background worker runs
  onError?: (err: Error, item: QueuedEtch) => void;
  onDLQ?: (item: QueuedEtch) => void;
  onSuccess?: (item: QueuedEtch) => void;
}

export interface QueuedEtch {
  request: EtchRequest;
  attempts: number;
  lastAttempt: number;
  nextAttempt: number;
  error?: string;
}

export class BackgroundLedgerForwarder {
  private readonly client: LedgerClient;
  private readonly config: Required<AsyncLedgerForwarderConfig>;
  private readonly queue: QueuedEtch[] = [];
  private readonly dlq: QueuedEtch[] = [];
  private workerTimer: NodeJS.Timeout | null = null;
  private isShuttingDown = false;

  constructor(client: LedgerClient, config: AsyncLedgerForwarderConfig = {}) {
    this.client = client;
    this.config = {
      maxRetries: config.maxRetries ?? 8,
      baseDelayMs: config.baseDelayMs ?? 500,
      maxDelayMs: config.maxDelayMs ?? 30000,
      workerIntervalMs: config.workerIntervalMs ?? 250,
      onError: config.onError ?? (() => {}),
      onDLQ: config.onDLQ ?? (() => {}),
      onSuccess: config.onSuccess ?? (() => {}),
    };
  }

  /**
   * Fire-and-forget forward. Never throws.
   */
  forward(request: EtchRequest): void {
    if (this.isShuttingDown) {
      // Still try once synchronously on shutdown
      this.client.etch(request).catch(() => {});
      return;
    }

    const now = Date.now();
    const item: QueuedEtch = {
      request,
      attempts: 0,
      lastAttempt: 0,
      nextAttempt: now,
    };

    this.queue.push(item);
  }

  /**
   * Start the background worker.
   */
  start(): void {
    if (this.workerTimer) return;

    this.workerTimer = setInterval(() => {
      this.processQueue().catch(err => {
        // Never let the worker crash
        console.error?.('[BackgroundLedgerForwarder] worker error', err);
      });
    }, this.config.workerIntervalMs);
  }

  /**
   * Stop the worker (best-effort drain).
   */
  async stop(flushTimeoutMs = 5000): Promise<void> {
    this.isShuttingDown = true;

    if (this.workerTimer) {
      clearInterval(this.workerTimer);
      this.workerTimer = null;
    }

    const start = Date.now();
    while (this.queue.length > 0 && Date.now() - start < flushTimeoutMs) {
      await this.processQueue();
      await new Promise(r => setTimeout(r, 50));
    }

    // Final attempt on remaining items
    for (const item of this.queue) {
      try {
        await this.client.etch(item.request);
      } catch (e: unknown) {
        this.sendToDLQ(item, e instanceof Error ? e.message : String(e));
      }
    }
    this.queue.length = 0;
  }

  /**
   * Manually retry everything currently in the DLQ.
   */
  async retryDLQ(): Promise<{ retried: number; stillFailed: number }> {
    const toRetry = [...this.dlq];
    this.dlq.length = 0;

    let retried = 0;
    let stillFailed = 0;

    for (const item of toRetry) {
      item.attempts = 0;
      item.nextAttempt = Date.now();
      try {
        await this.client.etch(item.request);
        retried++;
        this.config.onSuccess(item);
      } catch (e: unknown) {
        stillFailed++;
        item.error = e instanceof Error ? e.message : String(e);
        this.dlq.push(item);
      }
    }

    return { retried, stillFailed };
  }

  getQueueSize(): number {
    return this.queue.length;
  }

  getDLQSize(): number {
    return this.dlq.length;
  }

  getDLQ(): ReadonlyArray<QueuedEtch> {
    return [...this.dlq];
  }

  private async processQueue(): Promise<void> {
    if (this.queue.length === 0) return;

    const now = Date.now();
    const ready = this.queue.filter(item => item.nextAttempt <= now);

    for (const item of ready) {
      // Remove from main queue
      const idx = this.queue.indexOf(item);
      if (idx !== -1) this.queue.splice(idx, 1);

      try {
        await this.client.etch(item.request);
        this.config.onSuccess(item);
      } catch (e: unknown) {
        item.attempts++;
        item.lastAttempt = now;
        item.error = e instanceof Error ? e.message : String(e);

        if (item.attempts >= this.config.maxRetries) {
          this.sendToDLQ(item, item.error);
        } else {
          const delay = Math.min(
            this.config.baseDelayMs * Math.pow(2, item.attempts - 1),
            this.config.maxDelayMs
          );
          item.nextAttempt = now + delay + Math.random() * 100; // small jitter
          this.queue.push(item);
        }

        this.config.onError(e instanceof Error ? e : new Error(String(e)), item);
      }
    }
  }

  private sendToDLQ(item: QueuedEtch, error: string): void {
    item.error = error;
    this.dlq.push(item);
    this.config.onDLQ(item);
  }
}

/**
 * Convenience factory.
 */
export function createBackgroundLedgerForwarder(
  client: LedgerClient,
  config?: AsyncLedgerForwarderConfig
): BackgroundLedgerForwarder {
  const forwarder = new BackgroundLedgerForwarder(client, config);
  forwarder.start();
  return forwarder;
}
