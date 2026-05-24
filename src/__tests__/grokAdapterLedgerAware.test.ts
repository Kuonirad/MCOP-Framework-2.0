/**
 * @jest-environment node
 *
 * Tests for the GrokMCOPAdapter.createLedgerAware static factory and
 * processOrganelleResultWithLedger convenience helper.
 */
import { GrokMCOPAdapter } from '../adapters';
import { NovaNeoEncoder, StigmergyV5 } from '../core';
import type { LedgerClient } from '../ledger/ledgerClient';
import type { EtchReceipt, EtchRequest, LedgerExportBundle, LedgerQueryResult, VerifyResult } from '../ledger/types';

class StubLedger implements LedgerClient {
  readonly source = 'embedded' as const;
  public etchCalls = 0;
  async etch(req: EtchRequest): Promise<EtchReceipt> {
    this.etchCalls++;
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

describe('GrokMCOPAdapter.createLedgerAware', () => {
  it('constructs an adapter when no etch is supplied', async () => {
    const adapter = GrokMCOPAdapter.createLedgerAware({
      encoder: new NovaNeoEncoder({ dimensions: 32, normalize: true }),
      stigmergy: new StigmergyV5({ resonanceThreshold: 0.3 }),
      ledgerClient: new StubLedger(),
      ledgerTenantId: 'tenant-x',
      client: {
        async createCompletion({ options }) {
          return {
            model: options.model ?? 'unknown',
            content: '',
            finishReason: 'stop',
            usage: null,
          };
        },
      },
    });
    expect(adapter).toBeInstanceOf(GrokMCOPAdapter);

    // Stop the internal forwarder so jest can exit cleanly.
    const forwarder = (adapter as unknown as {
      _ledgerForwarder?: { stop?: () => Promise<void> | void };
    })._ledgerForwarder;
    if (forwarder?.stop) await forwarder.stop();
  });
});
