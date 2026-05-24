/**
 * Tests for ledger reconciliation utilities.
 */
import {
  reconcileEtchSnapshotWithLedger,
  reconcileFullSnapshotWithLedger,
  reconcileFileEtchBackendWithLedger,
  replayMissingEtchesToLedger,
} from '../utils/ledgerReconciliation';
import type { EtchSnapshot } from '../core/snapshotTypes';
import type { LedgerClient } from '../ledger/ledgerClient';
import type { EtchReceipt, LedgerExportBundle, LedgerLeaf, LedgerQueryResult, VerifyResult } from '../ledger/types';

function makeSnapshot(overrides: Partial<EtchSnapshot> = {}): EtchSnapshot {
  return {
    metadata: {
      version: 1,
      createdAt: '2026-05-24T00:00:00.000Z',
      source: 'mixed',
    },
    etches: [],
    ...overrides,
  };
}

function makeLeaf(overrides: Partial<LedgerLeaf>): LedgerLeaf {
  return {
    id: 'leaf-1',
    tenantId: 't',
    leafHash: 'h1',
    context: [],
    score: 0.5,
    sealedAt: '2026-05-24T00:00:00.000Z',
    ...overrides,
  };
}

class FakeLedgerClient implements LedgerClient {
  readonly source = 'embedded' as const;
  public etched: Array<{ tenantId: string; note?: string }> = [];
  public failNextEtch = false;
  constructor(private readonly result: LedgerQueryResult) {}
  async etch(req: { tenantId: string; note?: string }): Promise<EtchReceipt> {
    if (this.failNextEtch) {
      this.failNextEtch = false;
      throw new Error('forced fail');
    }
    this.etched.push({ tenantId: req.tenantId, note: req.note });
    return {
      id: `r-${this.etched.length}`,
      tenantId: req.tenantId,
      leafHash: `new-${this.etched.length}`,
      forestRoot: 'root',
      inclusionProof: [],
      sealedAt: new Date().toISOString(),
    };
  }
  async query(): Promise<LedgerQueryResult> {
    return this.result;
  }
  async verifyReceipt(): Promise<VerifyResult> {
    return { valid: true };
  }
  async exportFullLedger(tenantId: string): Promise<LedgerExportBundle> {
    return {
      version: 'mcop-ledger-export/1.0',
      tenantId,
      forestRoot: this.result.forestRoot,
      exportedAt: new Date().toISOString(),
      leaves: this.result.leaves,
    };
  }
}

describe('reconcileEtchSnapshotWithLedger', () => {
  it('reports nothing missing when local and ledger match', async () => {
    const snapshot = makeSnapshot({
      etches: [
        {
          hash: 'h1',
          deltaWeight: 0.1,
          note: 'one',
          timestamp: '2026-05-24T00:00:00.000Z',
        },
      ],
    });
    const ledgerClient = new FakeLedgerClient({
      leaves: [makeLeaf({ leafHash: 'h1' })],
      forestRoot: 'root',
    });
    const report = await reconcileEtchSnapshotWithLedger(snapshot, ledgerClient, 't');
    expect(report.fullyReconciled).toBe(true);
    expect(report.differences).toHaveLength(0);
    expect(report.totalLocalItems).toBe(1);
    expect(report.totalLedgerItems).toBe(1);
    expect(report.organelleSpecific).toBeDefined();
  });

  it('reports missing-in-ledger when local items are absent remotely', async () => {
    const snapshot = makeSnapshot({
      etches: [
        {
          hash: 'h-local',
          deltaWeight: 0.1,
          note: 'orphan',
          timestamp: '2026-05-24T00:00:00.000Z',
        },
      ],
    });
    const ledgerClient = new FakeLedgerClient({ leaves: [], forestRoot: 'root' });
    const report = await reconcileEtchSnapshotWithLedger(snapshot, ledgerClient, 't');
    expect(report.fullyReconciled).toBe(false);
    expect(report.differences).toHaveLength(1);
    expect(report.differences[0].type).toBe('missing_in_ledger');
  });

  it('reports missing-locally when ledger has tagged items the snapshot lacks', async () => {
    const snapshot = makeSnapshot({ etches: [] });
    const ledgerClient = new FakeLedgerClient({
      leaves: [makeLeaf({ leafHash: 'lh', metadata: { source: 'holographic-etch' } })],
      forestRoot: 'root',
    });
    const report = await reconcileEtchSnapshotWithLedger(snapshot, ledgerClient, 't');
    expect(report.differences.some(d => d.type === 'missing_locally')).toBe(true);
  });

  it('filters to organelle-only when requested', async () => {
    const snapshot = makeSnapshot({
      etches: [
        {
          hash: 'h-organelle',
          deltaWeight: 0,
          note: '',
          timestamp: 't',
          metadata: { source: 'grok-organelle' },
        },
        {
          hash: 'h-other',
          deltaWeight: 0,
          note: '',
          timestamp: 't',
          metadata: { source: 'other' },
        },
      ],
    });
    const ledgerClient = new FakeLedgerClient({ leaves: [], forestRoot: 'root' });
    const report = await reconcileEtchSnapshotWithLedger(snapshot, ledgerClient, 't', {
      onlyOrganelle: true,
    });
    expect(report.totalLocalItems).toBe(1);
    expect(report.organelleSpecific).toBeUndefined();
  });
});

describe('reconcileFullSnapshotWithLedger', () => {
  it('runs etch reconciliation when an etch snapshot is provided', async () => {
    const ledgerClient = new FakeLedgerClient({ leaves: [], forestRoot: 'root' });
    const out = await reconcileFullSnapshotWithLedger(
      { etch: makeSnapshot() },
      ledgerClient,
      't'
    );
    expect(out.etchReport).toBeDefined();
  });

  it('returns a note when only a stigmergy snapshot is supplied', async () => {
    const ledgerClient = new FakeLedgerClient({ leaves: [], forestRoot: 'root' });
    const out = await reconcileFullSnapshotWithLedger(
      {
        stigmergy: {
          metadata: { version: 1, createdAt: '', source: 'mixed' },
          traces: [],
          merkleRoot: '',
          totalTracesWritten: 0,
        },
      },
      ledgerClient,
      't'
    );
    expect(out.note).toMatch(/Stigmergy/);
    expect(out.etchReport).toBeUndefined();
  });
});

describe('reconcileFileEtchBackendWithLedger', () => {
  it('throws when backend does not expose createSnapshot', async () => {
    const ledgerClient = new FakeLedgerClient({ leaves: [], forestRoot: 'root' });
    await expect(
      reconcileFileEtchBackendWithLedger({}, ledgerClient, 't')
    ).rejects.toThrow(/snapshots/);
  });

  it('uses the backend snapshot when available', async () => {
    const ledgerClient = new FakeLedgerClient({ leaves: [], forestRoot: 'root' });
    const backend = {
      createSnapshot: () => makeSnapshot({ etches: [] }),
    };
    const report = await reconcileFileEtchBackendWithLedger(backend, ledgerClient, 't');
    expect(report.fullyReconciled).toBe(true);
  });
});

describe('replayMissingEtchesToLedger', () => {
  it('replays etches that are missing on the ledger', async () => {
    const snapshot = makeSnapshot({
      etches: [
        {
          hash: 'h-miss',
          deltaWeight: 0.42,
          note: 'replay-me',
          timestamp: '2026-05-24T00:00:00.000Z',
        },
      ],
    });
    const ledgerClient = new FakeLedgerClient({ leaves: [], forestRoot: 'root' });
    const result = await replayMissingEtchesToLedger(snapshot, ledgerClient, 't');
    expect(result.replayed).toBe(1);
    expect(ledgerClient.etched).toHaveLength(1);
    expect(ledgerClient.etched[0].note).toBe('replay-me');
  });

  it('respects dryRun mode and does not actually replay', async () => {
    const snapshot = makeSnapshot({
      etches: [
        {
          hash: 'h-dry',
          deltaWeight: 0,
          note: '',
          timestamp: '2026-05-24T00:00:00.000Z',
        },
      ],
    });
    const ledgerClient = new FakeLedgerClient({ leaves: [], forestRoot: 'root' });
    const result = await replayMissingEtchesToLedger(snapshot, ledgerClient, 't', { dryRun: true });
    expect(result.replayed).toBe(1);
    expect(ledgerClient.etched).toHaveLength(0);
  });

  it('records errors when ledger.etch throws', async () => {
    const snapshot = makeSnapshot({
      etches: [
        {
          hash: 'h-fail',
          deltaWeight: 0,
          note: '',
          timestamp: '2026-05-24T00:00:00.000Z',
        },
      ],
    });
    const ledgerClient = new FakeLedgerClient({ leaves: [], forestRoot: 'root' });
    ledgerClient.failNextEtch = true;
    const result = await replayMissingEtchesToLedger(snapshot, ledgerClient, 't');
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatch(/forced fail/);
  });
});
