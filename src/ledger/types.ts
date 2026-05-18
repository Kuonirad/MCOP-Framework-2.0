/**
 * Hosted Provenance Ledger — type surface.
 *
 * The ledger is a *managed or self-hostable* service that teams plug
 * into for `etch / query / verify` operations on the MCOP holographic
 * etch + provenance chain without operating their own persistent
 * store, while retaining the ability to cryptographically audit
 * everything.
 *
 * Two compile-time invariants protect the audit chain:
 *
 *   1. **Tenant-scoped Merkle forests.** Every record lives under a
 *      single `tenantId`. The forest root is the canonical digest of
 *      the sorted leaf-hash list — a pure function of the tenant's
 *      etches, byte-stable across runtimes.
 *   2. **Receipts are self-verifying.** {@link EtchReceipt} bundles
 *      the leaf hash, the parent leaf hash (chain pointer), the
 *      current forest root, and an inclusion proof. Anyone with
 *      `verifyReceipt(receipt, root)` can prove the etch is part of
 *      the forest without trusting the ledger operator.
 */

import type { ContextTensor } from '../core/types';

export type TenantId = string;
export type LeafHash = string;
export type ForestRoot = string;
export type LedgerSignature = string;

export interface EtchRequest {
  readonly tenantId: TenantId;
  readonly context: ContextTensor;
  readonly score: number;
  readonly note?: string;
  readonly metadata?: Record<string, unknown>;
  /**
   * Optional caller signature (e.g. mTLS-bound API key SHA-256). The
   * ledger stores it verbatim so the audit log can re-prove
   * authorship.
   */
  readonly signature?: LedgerSignature;
}

export interface LedgerLeaf {
  readonly id: string;
  readonly tenantId: TenantId;
  readonly leafHash: LeafHash;
  readonly parentHash?: LeafHash;
  readonly context: ContextTensor;
  readonly score: number;
  readonly note?: string;
  readonly metadata?: Record<string, unknown>;
  readonly signature?: LedgerSignature;
  readonly sealedAt: string;
}

export interface EtchReceipt {
  readonly id: string;
  readonly tenantId: TenantId;
  readonly leafHash: LeafHash;
  readonly parentHash?: LeafHash;
  readonly forestRoot: ForestRoot;
  readonly inclusionProof: ReadonlyArray<LeafHash>;
  readonly sealedAt: string;
}

export interface LedgerQueryFilters {
  readonly tenantId: TenantId;
  /** Inclusive lower bound on `sealedAt`. */
  readonly since?: string;
  /** Exclusive upper bound on `sealedAt`. */
  readonly until?: string;
  /** Minimum score. */
  readonly minScore?: number;
  /** Maximum number of results returned. */
  readonly limit?: number;
}

export interface LedgerQueryResult {
  readonly leaves: ReadonlyArray<LedgerLeaf>;
  readonly forestRoot: ForestRoot;
}

export interface LedgerExportBundle {
  readonly version: 'mcop-ledger-export/1.0';
  readonly tenantId: TenantId;
  readonly forestRoot: ForestRoot;
  readonly exportedAt: string;
  readonly leaves: ReadonlyArray<LedgerLeaf>;
}

export interface VerifyResult {
  readonly valid: boolean;
  readonly reason?: string;
}
