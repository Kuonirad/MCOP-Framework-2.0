/**
 * Snapshot + Ledger Reconciliation Tooling
 *
 * Production-grade utilities for reconciling local durable snapshots
 * (Stigmergy / Etch) against the Hosted Provenance Ledger.
 *
 * This is especially critical for organelle merges, where work performed
 * remotely (e.g. inside Grok-4.3) must be verifiably present in the central
 * audit ledger.
 */

import type { EtchSnapshot, StigmergySnapshot, SnapshotMetadata } from '../core/snapshotTypes';
import type { LedgerClient } from '../ledger/ledgerClient';
import type { LedgerQueryResult } from '../ledger/types';
import type { ContextTensor } from '../core/types';
import { canonicalDigest } from '../core/canonicalEncoding';

export interface ReconciliationDifference {
  type: 'missing_in_ledger' | 'missing_locally' | 'hash_mismatch' | 'root_mismatch';
  id: string;
  localHash?: string;
  ledgerHash?: string;
  details?: string;
  metadata?: Record<string, unknown>;
}

export interface ReconciliationReport {
  tenantId: string;
  snapshotMetadata: SnapshotMetadata;
  checkedAt: string;
  totalLocalItems: number;
  totalLedgerItems: number;
  differences: ReconciliationDifference[];
  ledgerForestRoot: string;
  localComputedRoot?: string;
  fullyReconciled: boolean;
  organelleSpecific?: {
    organelleItemsInSnapshot: number;
    organelleItemsInLedger: number;
    organelleDifferences: ReconciliationDifference[];
  };
}

/**
 * Reconciles an EtchSnapshot against the hosted ledger for a given tenant.
 */
export async function reconcileEtchSnapshotWithLedger(
  snapshot: EtchSnapshot,
  ledgerClient: LedgerClient,
  tenantId: string,
  options: {
    onlyOrganelle?: boolean;
  } = {}
): Promise<ReconciliationReport> {
  const { onlyOrganelle = false } = options;

  const checkedAt = new Date().toISOString();

  // Filter to organelle if requested
  let localEtches = snapshot.etches;
  if (onlyOrganelle) {
    localEtches = localEtches.filter(e => {
      const meta = (e as { metadata?: Record<string, unknown> }).metadata;
      return meta?.source === 'grok-organelle' || meta?.source === 'holographic-etch';
    });
  }

  const localHashes = new Set(localEtches.map(e => e.hash).filter(Boolean));

  // Query the full ledger for the tenant
  const ledgerResult: LedgerQueryResult = await ledgerClient.query({
    tenantId,
    limit: 10000,
  });

  const ledgerByHash = new Map(ledgerResult.leaves.map(l => [l.leafHash, l]));

  const differences: ReconciliationDifference[] = [];

  // Check local items against ledger
  for (const local of localEtches) {
    if (!local.hash) continue;
    const ledgerItem = ledgerByHash.get(local.hash);
    if (!ledgerItem) {
      differences.push({
        type: 'missing_in_ledger',
        id: local.hash,
        localHash: local.hash,
        details: `Etch missing from ledger. Note: ${local.note}`,
        metadata: local.metadata,
      });
    } else if (ledgerItem.leafHash !== local.hash) {
      differences.push({
        type: 'hash_mismatch',
        id: local.hash,
        localHash: local.hash,
        ledgerHash: ledgerItem.leafHash,
      });
    }
  }

  // Check ledger items against local
  for (const leaf of ledgerResult.leaves) {
    if (!localHashes.has(leaf.leafHash)) {
      // Only report as missing locally if it looks like it came from us
      const isFromUs = leaf.metadata?.source === 'holographic-etch' || 
                       leaf.metadata?.source === 'grok-organelle';
      if (!onlyOrganelle || isFromUs) {
        differences.push({
          type: 'missing_locally',
          id: leaf.leafHash,
          ledgerHash: leaf.leafHash,
          details: `Ledger has item not in local snapshot. Note: ${leaf.note}`,
          metadata: leaf.metadata,
        });
      }
    }
  }

  // Root verification
  let localComputedRoot: string | undefined;
  if (localEtches.length > 0) {
    // Simple root for etches: hash of sorted leaf hashes (matching ledger forest root logic)
    const sortedHashes = [...localHashes].sort();
    localComputedRoot = canonicalDigest({ tenantId, leaves: sortedHashes });
  }

  const organelleDifferences = onlyOrganelle 
    ? differences 
    : differences.filter(d => {
        const meta = d.metadata || {};
        return meta.source === 'grok-organelle' || meta.source === 'holographic-etch';
      });

  const report: ReconciliationReport = {
    tenantId,
    snapshotMetadata: snapshot.metadata,
    checkedAt,
    totalLocalItems: localEtches.length,
    totalLedgerItems: ledgerResult.leaves.length,
    differences,
    ledgerForestRoot: ledgerResult.forestRoot,
    localComputedRoot,
    fullyReconciled: differences.length === 0,
    organelleSpecific: onlyOrganelle ? undefined : {
      organelleItemsInSnapshot: snapshot.etches.filter(e => {
        const meta = (e as { metadata?: Record<string, unknown> }).metadata;
        return meta?.source === 'grok-organelle';
      }).length,
      organelleItemsInLedger: ledgerResult.leaves.filter(l =>
        l.metadata?.source === 'grok-organelle'
      ).length,
      organelleDifferences,
    },
  };

  return report;
}

/**
 * Reconciles a full MCOP snapshot (Stigmergy + Etch) against the ledger.
 * Currently focuses on Etch since the hosted ledger is etch-oriented.
 */
export async function reconcileFullSnapshotWithLedger(
  snapshot: { etch?: EtchSnapshot; stigmergy?: StigmergySnapshot },
  ledgerClient: LedgerClient,
  tenantId: string,
  options: { onlyOrganelle?: boolean } = {}
): Promise<{
  etchReport?: ReconciliationReport;
  note?: string;
}> {
  const results: Record<string, unknown> = {};

  if (snapshot.etch) {
    results.etchReport = await reconcileEtchSnapshotWithLedger(
      snapshot.etch,
      ledgerClient,
      tenantId,
      { onlyOrganelle: options.onlyOrganelle }
    );
  }

  if (snapshot.stigmergy) {
    results.note = "Stigmergy reconciliation against the hosted ledger is not yet implemented (ledger is primarily etch-oriented). Use snapshot Merkle verification for local durability.";
  }

  return results;
}

/**
 * Helper to reconcile a FileEtchBackend's current state directly against the ledger.
 */
export async function reconcileFileEtchBackendWithLedger(
  backend: { createSnapshot?: (opts?: { source?: string }) => EtchSnapshot }, // FileEtchBackend
  ledgerClient: LedgerClient,
  tenantId: string,
  options: { onlyOrganelle?: boolean; includeAudit?: boolean } = {}
) {
  if (typeof backend.createSnapshot !== 'function') {
    throw new Error('Backend does not support snapshots');
  }

  const snapshot = backend.createSnapshot({ source: 'mixed' });
  return reconcileEtchSnapshotWithLedger(snapshot, ledgerClient, tenantId, options);
}

/**
 * Replays items that are in the local snapshot but missing from the ledger.
 * Useful for recovering from transient ledger outages or initial backfill of organelle work.
 */
export async function replayMissingEtchesToLedger(
  snapshot: EtchSnapshot,
  ledgerClient: LedgerClient,
  tenantId: string,
  options: { onlyOrganelle?: boolean; dryRun?: boolean } = {}
): Promise<{ replayed: number; skipped: number; errors: string[] }> {
  const { onlyOrganelle = false, dryRun = false } = options;

  const report = await reconcileEtchSnapshotWithLedger(snapshot, ledgerClient, tenantId, { onlyOrganelle });

  const missing = report.differences.filter(d => d.type === 'missing_in_ledger');

  let replayed = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const diff of missing) {
    const localEtch = snapshot.etches.find(e => e.hash === diff.localHash);
    if (!localEtch) {
      skipped++;
      continue;
    }

    if (dryRun) {
      replayed++;
      continue;
    }

    const le = localEtch as unknown as Record<string, unknown>;
    try {
      await ledgerClient.etch({
        tenantId,
        context: (le.context as ContextTensor) || [],
        score: (le.deltaWeight as number) ?? (le.score as number) ?? 0,
        note: localEtch.note,
        metadata: {
          ...(localEtch.metadata || {}),
          replayedFromSnapshot: true,
          originalSealedAt: localEtch.timestamp,
        },
      });
      replayed++;
    } catch (err: unknown) {
      errors.push(`Failed to replay ${diff.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return { replayed, skipped, errors };
}
