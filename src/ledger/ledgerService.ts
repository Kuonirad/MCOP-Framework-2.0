/**
 * LedgerService — core implementation of the Hosted Provenance Ledger.
 *
 * Production deployments wrap this class in an HTTP/gRPC surface (see
 * `services/ledger/`); embedded callers can instantiate it directly to
 * keep a fully sovereign in-process ledger.
 *
 * Storage is delegated to a {@link LedgerStorageAdapter} so the same
 * service code runs against:
 *
 *   - {@link InMemoryStorageAdapter} (default, used for tests + CI)
 *   - A future Postgres adapter
 *   - An S3-compatible append-only adapter for cold archival
 *
 * All cryptographic primitives go through `canonicalDigest()` so the
 * forest root is byte-stable across runtimes — a Python verify CLI or
 * a Rust replay node can independently reconstruct the same root.
 */

import { randomUuidV4 } from '../core/uuid';
import { canonicalDigest } from '../core/canonicalEncoding';
import type {
  EtchReceipt,
  EtchRequest,
  ForestRoot,
  LedgerExportBundle,
  LedgerLeaf,
  LedgerQueryFilters,
  LedgerQueryResult,
  TenantId,
  VerifyResult,
} from './types';

export interface LedgerStorageAdapter {
  appendLeaf(leaf: LedgerLeaf): Promise<void> | void;
  listLeaves(tenantId: TenantId): Promise<ReadonlyArray<LedgerLeaf>> | ReadonlyArray<LedgerLeaf>;
  getLastLeaf(tenantId: TenantId): Promise<LedgerLeaf | undefined> | LedgerLeaf | undefined;
}

export class InMemoryStorageAdapter implements LedgerStorageAdapter {
  private readonly tenants = new Map<TenantId, LedgerLeaf[]>();

  appendLeaf(leaf: LedgerLeaf): void {
    const list = this.tenants.get(leaf.tenantId) ?? [];
    list.push(leaf);
    this.tenants.set(leaf.tenantId, list);
  }

  listLeaves(tenantId: TenantId): ReadonlyArray<LedgerLeaf> {
    return Object.freeze([...(this.tenants.get(tenantId) ?? [])]);
  }

  getLastLeaf(tenantId: TenantId): LedgerLeaf | undefined {
    const list = this.tenants.get(tenantId);
    if (!list || list.length === 0) return undefined;
    return list[list.length - 1];
  }
}

export interface LedgerServiceConfig {
  storage?: LedgerStorageAdapter;
  /** Test hook: deterministic `Date.now()` replacement. */
  now?: () => Date;
  /** Test hook: deterministic UUID replacement. */
  uuid?: () => string;
}

export class LedgerService {
  private readonly storage: LedgerStorageAdapter;
  private readonly now: () => Date;
  private readonly uuid: () => string;

  constructor(config: LedgerServiceConfig = {}) {
    this.storage = config.storage ?? new InMemoryStorageAdapter();
    this.now = config.now ?? (() => new Date());
    this.uuid = config.uuid ?? randomUuidV4;
  }

  /**
   * Etch a new leaf into the tenant's Merkle forest and return a
   * self-verifying {@link EtchReceipt}.
   */
  async etch(request: EtchRequest): Promise<EtchReceipt> {
    if (!request.tenantId || typeof request.tenantId !== 'string') {
      throw new TypeError('etch: tenantId must be a non-empty string');
    }
    if (!Array.isArray(request.context)) {
      throw new TypeError('etch: context must be a numeric vector');
    }
    const parent = await this.storage.getLastLeaf(request.tenantId);
    const id = this.uuid();
    const sealedAt = this.now().toISOString();
    const parentHash = parent?.leafHash;
    const leafHashPayload = {
      type: 'MCOP_LEDGER_LEAF',
      tenantId: request.tenantId,
      id,
      context: request.context,
      score: request.score,
      note: request.note ?? null,
      metadata: request.metadata ?? null,
      signature: request.signature ?? null,
      parentHash: parentHash ?? null,
      sealedAt,
    };
    const leafHash = canonicalDigest(leafHashPayload);

    const leaf: LedgerLeaf = Object.freeze({
      id,
      tenantId: request.tenantId,
      leafHash,
      parentHash,
      context: [...request.context],
      score: request.score,
      note: request.note,
      metadata: request.metadata ? { ...request.metadata } : undefined,
      signature: request.signature,
      sealedAt,
    });
    await this.storage.appendLeaf(leaf);

    const allLeaves = await this.storage.listLeaves(request.tenantId);
    const forestRoot = computeForestRoot(request.tenantId, allLeaves);
    const inclusionProof = buildInclusionProof(allLeaves, leafHash);

    return Object.freeze({
      id,
      tenantId: request.tenantId,
      leafHash,
      parentHash,
      forestRoot,
      inclusionProof,
      sealedAt,
    });
  }

  /** Query the tenant's forest, optionally filtered. */
  async query(filters: LedgerQueryFilters): Promise<LedgerQueryResult> {
    const all = await this.storage.listLeaves(filters.tenantId);
    const filtered = all.filter((leaf) => {
      if (filters.since !== undefined && leaf.sealedAt < filters.since) return false;
      if (filters.until !== undefined && leaf.sealedAt >= filters.until) return false;
      if (filters.minScore !== undefined && leaf.score < filters.minScore) return false;
      return true;
    });
    const limited = filters.limit !== undefined ? filtered.slice(0, filters.limit) : filtered;
    return Object.freeze({
      leaves: Object.freeze([...limited]),
      forestRoot: computeForestRoot(filters.tenantId, all),
    });
  }

  /** Verify a self-contained receipt against the tenant's current forest. */
  async verifyReceipt(receipt: EtchReceipt): Promise<VerifyResult> {
    const all = await this.storage.listLeaves(receipt.tenantId);
    const found = all.find((l) => l.leafHash === receipt.leafHash);
    if (!found) return { valid: false, reason: 'leaf not in tenant forest' };
    const root = computeForestRoot(receipt.tenantId, all);
    if (root !== receipt.forestRoot) {
      return { valid: false, reason: 'forest root mismatch — tenant forest has advanced' };
    }
    const recomputed = buildInclusionProof(all, receipt.leafHash);
    if (
      recomputed.length !== receipt.inclusionProof.length ||
      recomputed.some((h, i) => h !== receipt.inclusionProof[i])
    ) {
      return { valid: false, reason: 'inclusion proof mismatch' };
    }
    return { valid: true };
  }

  /** Stateless verification: works against any caller-supplied bundle. */
  static verifyBundle(bundle: LedgerExportBundle): VerifyResult {
    if (bundle.version !== 'mcop-ledger-export/1.0') {
      return { valid: false, reason: `unsupported bundle version: ${bundle.version}` };
    }
    const recomputed = computeForestRoot(bundle.tenantId, bundle.leaves);
    if (recomputed !== bundle.forestRoot) {
      return { valid: false, reason: 'forest root does not match bundle leaves' };
    }
    // Re-verify each leaf's pointer chain.
    let prev: string | undefined;
    for (const leaf of bundle.leaves) {
      if (leaf.parentHash !== prev) {
        return { valid: false, reason: `parent-hash chain broken at leaf ${leaf.id}` };
      }
      prev = leaf.leafHash;
    }
    return { valid: true };
  }

  /** Export the complete forest for offline verification. */
  async exportFullLedger(tenantId: TenantId): Promise<LedgerExportBundle> {
    const all = await this.storage.listLeaves(tenantId);
    return Object.freeze({
      version: 'mcop-ledger-export/1.0' as const,
      tenantId,
      forestRoot: computeForestRoot(tenantId, all),
      exportedAt: this.now().toISOString(),
      leaves: Object.freeze([...all]),
    });
  }

  /** Operator helper: produce a fresh forest root without writing. */
  async currentForestRoot(tenantId: TenantId): Promise<ForestRoot> {
    const all = await this.storage.listLeaves(tenantId);
    return computeForestRoot(tenantId, all);
  }
}

// ----------------------------------------------------------------
// Cryptographic helpers
// ----------------------------------------------------------------

/**
 * RFC 8785 canonical digest of `{tenantId, leafHashes}`.
 *
 * Two tenants produce different roots even when their leaf hashes
 * collide by chance — the `tenantId` is part of the digested
 * payload. The hash list is taken **in insertion order** so callers
 * that replay the export bundle deterministically reproduce the
 * root.
 */
function computeForestRoot(tenantId: TenantId, leaves: ReadonlyArray<LedgerLeaf>): ForestRoot {
  return canonicalDigest({
    type: 'MCOP_LEDGER_FOREST',
    tenantId,
    leafHashes: leaves.map((l) => l.leafHash),
  });
}

/**
 * Inclusion proof = the list of leaf hashes preceding the target.
 *
 * For an append-only chain, "preceding hashes + target hash + the
 * recomputed forest root" is sufficient to prove inclusion. A
 * Merkle-tree variant is a future optimisation; the current chain
 * shape is byte-stable and easy to verify in any language.
 */
function buildInclusionProof(
  leaves: ReadonlyArray<LedgerLeaf>,
  targetHash: string,
): ReadonlyArray<string> {
  const proof: string[] = [];
  for (const leaf of leaves) {
    if (leaf.leafHash === targetHash) break;
    proof.push(leaf.leafHash);
  }
  return Object.freeze(proof);
}
