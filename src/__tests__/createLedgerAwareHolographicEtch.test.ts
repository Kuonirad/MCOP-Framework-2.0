/**
 * Tests for the LedgerAware HolographicEtch factory helpers.
 */
import {
  createLedgerAwareHolographicEtch,
  createOrganelleReadyEtch,
} from '../ledger/createLedgerAwareHolographicEtch';
import { HolographicEtch } from '../core/holographicEtch';
import type { LedgerClient } from '../ledger/ledgerClient';
import type { EtchReceipt, EtchRequest, LedgerExportBundle, LedgerQueryResult, VerifyResult } from '../ledger/types';

class StubLedger implements LedgerClient {
  readonly source = 'embedded' as const;
  async etch(req: EtchRequest): Promise<EtchReceipt> {
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
    return {
      version: 'mcop-ledger-export/1.0',
      tenantId,
      forestRoot: 'root',
      exportedAt: new Date().toISOString(),
      leaves: [],
    };
  }
}

describe('createLedgerAwareHolographicEtch', () => {
  it('returns a HolographicEtch wired with in-memory forwarding when no redis is supplied', () => {
    const etch = createLedgerAwareHolographicEtch({
      ledgerClient: new StubLedger(),
      ledgerTenantId: 'tenant-a',
      confidenceFloor: 0,
    });
    expect(etch).toBeInstanceOf(HolographicEtch);
    // Forwarder is internal to the etch; jest --forceExit handles the rest.
  });
});

describe('createOrganelleReadyEtch', () => {
  it('returns both an etch and a forwarder', async () => {
    const { etch, forwarder } = createOrganelleReadyEtch({
      ledgerClient: new StubLedger(),
      ledgerTenantId: 'tenant-b',
      confidenceFloor: 0,
    });
    expect(etch).toBeInstanceOf(HolographicEtch);
    expect(forwarder).toBeDefined();
    expect(typeof forwarder.forward).toBe('function');
    await forwarder.stop();
  });
});
