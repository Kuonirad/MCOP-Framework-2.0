/**
 * Tests for HolographicEtch ledger forwarding paths.
 */
import { HolographicEtch } from '../core/holographicEtch';
import { InMemoryEtchBackend } from '../core/etchBackend';
import type { LedgerClient } from '../ledger/ledgerClient';
import type { EtchReceipt, EtchRequest, LedgerExportBundle, LedgerQueryResult, VerifyResult } from '../ledger/types';

class FakeLedger implements LedgerClient {
  readonly source = 'embedded' as const;
  public lastEtch?: EtchRequest;
  public callCount = 0;
  public shouldFail = false;
  async etch(req: EtchRequest): Promise<EtchReceipt> {
    this.callCount++;
    if (this.shouldFail) throw new Error('ledger unavailable');
    this.lastEtch = req;
    return {
      id: 'r',
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
    return { version: 'mcop-ledger-export/1.0', tenantId, forestRoot: 'root', exportedAt: '', leaves: [] };
  }
}

describe('HolographicEtch ledger integration', () => {
  it('forwards accepted etches to the configured ledger (legacy direct path)', async () => {
    const ledger = new FakeLedger();
    const etch = new HolographicEtch({
      confidenceFloor: 0,
      ledgerClient: ledger,
      ledgerTenantId: 'tenant-1',
    });
    etch.applyEtch([0.5, 0.5], [0.5, 0.5], 'test note');
    await new Promise(r => setTimeout(r, 10));
    expect(ledger.callCount).toBeGreaterThan(0);
    expect(ledger.lastEtch?.tenantId).toBe('tenant-1');
    expect(ledger.lastEtch?.metadata?.source).toBe('holographic-etch');
  });

  it('does not crash when the ledger forwarder throws asynchronously', async () => {
    const ledger = new FakeLedger();
    ledger.shouldFail = true;
    const etch = new HolographicEtch({
      confidenceFloor: 0,
      ledgerClient: ledger,
      ledgerTenantId: 'tenant-fail',
    });
    expect(() => etch.applyEtch([1, 0], [1, 0])).not.toThrow();
    await new Promise(r => setTimeout(r, 10));
    expect(ledger.callCount).toBeGreaterThan(0);
  });

  it('hydrates from an InMemoryEtchBackend on construction', () => {
    const storage = new InMemoryEtchBackend();
    storage.appendEtch({ hash: 'h1', deltaWeight: 0.1, note: 'pre', timestamp: 't' });
    storage.appendAudit({ hash: 'a1', deltaWeight: 0, note: 'audit', timestamp: 't' });
    const etch = new HolographicEtch({
      confidenceFloor: 0,
      storage,
    });
    expect(etch.recent(5).some(r => r.hash === 'h1')).toBe(true);
    expect(etch.recentAudit(5).some(r => r.hash === 'a1')).toBe(true);
  });

  it('writes through to durable storage on accepted etches', () => {
    const storage = new InMemoryEtchBackend();
    const etch = new HolographicEtch({
      confidenceFloor: 0,
      storage,
    });
    etch.applyEtch([1, 0, 0], [1, 0, 0], 'persisted');
    expect(storage.loadRecentEtches(5).length).toBeGreaterThan(0);
  });

  it('skips low-confidence etches without ledger forwarding', () => {
    const ledger = new FakeLedger();
    const etch = new HolographicEtch({
      confidenceFloor: 0.99,
      ledgerClient: ledger,
      ledgerTenantId: 'tenant-skip',
    });
    const record = etch.applyEtch([0, 1], [1, 0], 'orthogonal');
    expect(record.note).toBe('skipped-low-confidence');
    expect(record.deltaWeight).toBe(0);
  });
});
