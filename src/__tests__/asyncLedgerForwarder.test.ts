/**
 * Tests for BackgroundLedgerForwarder (retry + DLQ).
 */
import {
  BackgroundLedgerForwarder,
  createBackgroundLedgerForwarder,
} from '../ledger/asyncLedgerForwarder';
import type { LedgerClient } from '../ledger/ledgerClient';
import type { EtchReceipt, EtchRequest, LedgerExportBundle, LedgerQueryResult, VerifyResult } from '../ledger/types';

class FakeLedgerClient implements LedgerClient {
  readonly source = 'embedded' as const;
  public calls = 0;
  public failures = 0;
  public failTimes = 0;
  async etch(req: EtchRequest): Promise<EtchReceipt> {
    this.calls++;
    if (this.failures < this.failTimes) {
      this.failures++;
      throw new Error(`forced fail #${this.failures}`);
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
  async query(): Promise<LedgerQueryResult> {
    return { leaves: [], forestRoot: 'root' };
  }
  async verifyReceipt(): Promise<VerifyResult> {
    return { valid: true };
  }
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
  return { tenantId: 't', context: [1, 2, 3], score: 0.5, note: 'unit test' };
}

describe('BackgroundLedgerForwarder', () => {
  it('forwards successfully and reports an empty queue', async () => {
    const client = new FakeLedgerClient();
    const onSuccess = jest.fn();
    const forwarder = new BackgroundLedgerForwarder(client, {
      workerIntervalMs: 10,
      onSuccess,
    });
    forwarder.start();
    forwarder.forward(req());
    await new Promise(r => setTimeout(r, 80));
    expect(client.calls).toBeGreaterThan(0);
    expect(forwarder.getQueueSize()).toBe(0);
    expect(forwarder.getDLQSize()).toBe(0);
    expect(onSuccess).toHaveBeenCalled();
    await forwarder.stop();
  });

  it('retries on failure and ultimately sends to DLQ', async () => {
    const client = new FakeLedgerClient();
    client.failTimes = 100;
    const onDLQ = jest.fn();
    const forwarder = new BackgroundLedgerForwarder(client, {
      maxRetries: 2,
      baseDelayMs: 5,
      maxDelayMs: 20,
      workerIntervalMs: 10,
      onDLQ,
    });
    forwarder.start();
    forwarder.forward(req());
    await new Promise(r => setTimeout(r, 250));
    expect(forwarder.getDLQSize()).toBeGreaterThanOrEqual(1);
    expect(onDLQ).toHaveBeenCalled();
    await forwarder.stop();
  });

  it('manually retries items from the DLQ', async () => {
    const client = new FakeLedgerClient();
    client.failTimes = 1;
    const forwarder = new BackgroundLedgerForwarder(client, {
      maxRetries: 0,
      baseDelayMs: 5,
      workerIntervalMs: 10,
    });
    forwarder.start();
    forwarder.forward(req());
    await new Promise(r => setTimeout(r, 100));
    expect(forwarder.getDLQSize()).toBeGreaterThanOrEqual(1);
    const result = await forwarder.retryDLQ();
    expect(result.retried).toBeGreaterThanOrEqual(0);
    await forwarder.stop();
  });

  it('processes queued items synchronously when shutting down', async () => {
    const client = new FakeLedgerClient();
    const forwarder = new BackgroundLedgerForwarder(client, {
      workerIntervalMs: 5,
    });
    forwarder.start();
    forwarder.forward(req());
    await forwarder.stop();
    expect(client.calls).toBeGreaterThanOrEqual(1);
  });

  it('exposes queue snapshot helpers', () => {
    const client = new FakeLedgerClient();
    const forwarder = new BackgroundLedgerForwarder(client);
    expect(forwarder.getDLQ()).toEqual([]);
    expect(forwarder.getDLQSize()).toBe(0);
    expect(forwarder.getQueueSize()).toBe(0);
  });
});

describe('createBackgroundLedgerForwarder', () => {
  it('returns a started forwarder', async () => {
    const client = new FakeLedgerClient();
    const forwarder = createBackgroundLedgerForwarder(client, {
      workerIntervalMs: 10,
    });
    forwarder.forward(req());
    await new Promise(r => setTimeout(r, 50));
    expect(client.calls).toBeGreaterThan(0);
    await forwarder.stop();
  });
});
