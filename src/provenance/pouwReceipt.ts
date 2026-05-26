/**
 * Proof-of-Useful-Work (PoUW) receipts for accelerated kernel runs.
 *
 * Byte-compatible with `mcop_package/mcop/pouw.py`. A PoUW receipt proves
 * that useful work was performed with an authentic, on-chain-anchored
 * model. It binds three commitments:
 *
 *   1. **The work** — `workMerkleRoot` is the
 *      `AcceleratorProvenance.merkleRoot` already produced for every
 *      accelerated dispatch.
 *   2. **The model identity** — `modelId = SHA-256(model bytes)`.
 *   3. **Model authenticity** — a compact RFC 6962 `inclusionProof` that
 *      `modelId` is a leaf of the manifest whose head is `manifestRoot`.
 *
 * {@link verifyPoUWReceipt} checks the proof reproduces `manifestRoot`
 * *and* that `manifestRoot` equals the on-chain anchored root resolved by
 * an {@link OnChainRootRegistry}. The receipt is itself tamper-evident:
 * `receiptId` is the RFC 8785 canonical digest of every other field.
 */

import { readFileSync } from 'node:fs';

import { canonicalDigest } from '../core/canonicalEncoding';
import { verifyProof, isHexSha256, type ProofStep } from './merkleTree';
import {
  inclusionProofForKernel,
  manifestRoot,
  modelIdOf,
  type ModelManifest,
  type VerifyResult,
} from './modelManifest';

export const POUW_RECEIPT_VERSION = 'mcop-pouw-receipt/1.0';
export const ANCHOR_ENV_VAR = 'MCOP_MODEL_MANIFEST_ROOT';

export interface PoUWReceipt {
  readonly version: string;
  readonly kernel: string;
  readonly canonicalOp: string;
  readonly modelId: string;
  readonly manifestRoot: string;
  readonly inclusionProof: ReadonlyArray<ProofStep>;
  readonly workMerkleRoot: string;
  readonly verifiedDevice: string;
  readonly device: string;
  readonly durationMs: number;
  readonly timestamp: string;
  readonly receiptId: string;
}

export interface BuildPoUWReceiptOptions {
  readonly kernel: string;
  readonly canonicalOp: string;
  readonly workMerkleRoot: string;
  readonly verifiedDevice: string;
  readonly device: string;
  readonly durationMs: number;
  /** ISO 8601 timestamp; defaults to `new Date().toISOString()`. */
  readonly timestamp?: string;
}

/**
 * Canonical body whose digest is the `receiptId`. Keys mirror the Python
 * `_receipt_body` exactly so `receiptId` is byte-identical across runtimes.
 */
function receiptBody(fields: {
  kernel: string;
  canonicalOp: string;
  modelId: string;
  manifestRoot: string;
  inclusionProof: ReadonlyArray<ProofStep>;
  workMerkleRoot: string;
  verifiedDevice: string;
  device: string;
  durationMs: number;
  timestamp: string;
}): Record<string, unknown> {
  return {
    type: 'MCOP_POUW_RECEIPT',
    version: POUW_RECEIPT_VERSION,
    kernel: fields.kernel,
    canonicalOp: fields.canonicalOp,
    modelId: fields.modelId,
    manifestRoot: fields.manifestRoot,
    inclusionProof: fields.inclusionProof.map((s) => ({ sibling: s.sibling, side: s.side })),
    workMerkleRoot: fields.workMerkleRoot,
    verifiedDevice: fields.verifiedDevice,
    device: fields.device,
    durationMs: fields.durationMs,
    timestamp: fields.timestamp,
  };
}

/** Mint a PoUW receipt for a kernel run against `manifest`. */
export function buildModelPoUWReceipt(
  manifest: ModelManifest,
  options: BuildPoUWReceiptOptions,
): PoUWReceipt {
  const modelId = modelIdOf(manifest, options.kernel);
  const root = manifestRoot(manifest);
  const proof = inclusionProofForKernel(manifest, options.kernel);
  const timestamp = options.timestamp ?? new Date().toISOString();

  const body = receiptBody({
    kernel: options.kernel,
    canonicalOp: options.canonicalOp,
    modelId,
    manifestRoot: root,
    inclusionProof: proof,
    workMerkleRoot: options.workMerkleRoot,
    verifiedDevice: options.verifiedDevice,
    device: options.device,
    durationMs: options.durationMs,
    timestamp,
  });
  const receiptId = canonicalDigest(body);

  return Object.freeze({
    version: POUW_RECEIPT_VERSION,
    kernel: options.kernel,
    canonicalOp: options.canonicalOp,
    modelId,
    manifestRoot: root,
    inclusionProof: Object.freeze(proof),
    workMerkleRoot: options.workMerkleRoot,
    verifiedDevice: options.verifiedDevice,
    device: options.device,
    durationMs: options.durationMs,
    timestamp,
    receiptId,
  });
}

/**
 * Verify a receipt against the trusted on-chain anchored root. Checks are
 * ordered cheapest-first: tamper check, anchor equality, then the Merkle
 * fold.
 */
export function verifyPoUWReceipt(receipt: PoUWReceipt, onChainRoot: string | null | undefined): VerifyResult {
  const body = receiptBody({
    kernel: receipt.kernel,
    canonicalOp: receipt.canonicalOp,
    modelId: receipt.modelId,
    manifestRoot: receipt.manifestRoot,
    inclusionProof: receipt.inclusionProof,
    workMerkleRoot: receipt.workMerkleRoot,
    verifiedDevice: receipt.verifiedDevice,
    device: receipt.device,
    durationMs: receipt.durationMs,
    timestamp: receipt.timestamp,
  });
  if (canonicalDigest(body) !== receipt.receiptId) {
    return { valid: false, reason: 'receiptId mismatch — receipt has been tampered with' };
  }

  if (onChainRoot === null || onChainRoot === undefined) {
    return { valid: false, reason: 'no on-chain anchored root available to verify against' };
  }
  if (!isHexSha256(receipt.manifestRoot)) {
    return { valid: false, reason: 'receipt manifestRoot is not a valid SHA-256' };
  }
  if (receipt.manifestRoot.toLowerCase() !== onChainRoot.toLowerCase()) {
    return {
      valid: false,
      reason: `manifest root ${receipt.manifestRoot} is not anchored on-chain (anchor=${onChainRoot})`,
    };
  }

  if (!isHexSha256(receipt.modelId)) {
    return { valid: false, reason: 'receipt modelId is not a valid SHA-256' };
  }
  const ok = verifyProof(
    Buffer.from(receipt.modelId, 'hex'),
    receipt.inclusionProof,
    Buffer.from(receipt.manifestRoot, 'hex'),
  );
  if (!ok) {
    return { valid: false, reason: 'inclusion proof does not reproduce the manifest root' };
  }
  return { valid: true };
}

/**
 * Resolve the trusted model-manifest root anchored "on-chain".
 *
 * Resolution order (first hit wins): explicit `override`, then the
 * `MCOP_MODEL_MANIFEST_ROOT` env var, then the `root` field of a committed
 * anchor file (`models/anchored_root.json` by default).
 *
 * The default is a pinned anchor checked into the repo. In production,
 * point `anchorPath` at a file your chain indexer rewrites from the
 * canonical contract storage slot / a transparency-log signed tree head,
 * or subclass and override {@link resolve}. This class performs no network
 * or RPC calls — anchoring policy is the operator's to wire in.
 */
export interface OnChainRootRegistryOptions {
  readonly override?: string;
  readonly anchorPath?: string;
  readonly env?: Record<string, string | undefined>;
  /** Test seam: inject a file reader. Defaults to `node:fs` `readFileSync`. */
  readonly readFile?: (path: string) => string | undefined;
}

export class OnChainRootRegistry {
  private readonly override?: string;
  private readonly anchorPath?: string;
  private readonly env: Record<string, string | undefined>;
  private readonly readFile: (path: string) => string | undefined;

  constructor(options: OnChainRootRegistryOptions = {}) {
    this.override = options.override;
    this.anchorPath = options.anchorPath;
    this.env = options.env ?? process.env;
    this.readFile =
      options.readFile ??
      ((p: string) => {
        try {
          return readFileSync(p, 'utf-8');
        } catch {
          return undefined;
        }
      });
  }

  resolve(): string | null {
    if (this.override && isHexSha256(this.override)) return this.override.toLowerCase();
    const envRoot = (this.env[ANCHOR_ENV_VAR] ?? '').trim();
    if (isHexSha256(envRoot)) return envRoot.toLowerCase();
    if (this.anchorPath) {
      const raw = this.readFile(this.anchorPath);
      if (raw !== undefined) {
        try {
          const data = JSON.parse(raw) as { root?: unknown };
          if (isHexSha256(data.root)) return (data.root as string).toLowerCase();
        } catch {
          return null;
        }
      }
    }
    return null;
  }
}
