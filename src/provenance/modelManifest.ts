/**
 * Merkle-rooted model manifest for `models/mcop_*.onnx`.
 *
 * Byte-compatible with `mcop_package/mcop/model_manifest.py`. A manifest
 * pins the exact bytes of every shipped ONNX kernel:
 *
 *   - `model_id = SHA-256(model bytes)` is the identity of one ONNX file.
 *   - The `model_id` values are the leaves of an RFC 6962 Merkle tree
 *     ({@link ./merkleTree}); the tree head is `merkle.root`.
 *   - Leaves are ordered lexicographically by kernel name, so the root is
 *     a deterministic function of the model set alone.
 *
 * `merkle.root` is the value anchored on-chain (see {@link ./pouwReceipt}):
 * a single 32-byte commitment to every model the framework will execute.
 *
 * Schema `mcop-cuda-kernel-manifest/2.0`.
 */

import { createHash } from 'node:crypto';
import { readFileSync, statSync, existsSync } from 'node:fs';
import * as path from 'node:path';

import {
  inclusionProof,
  isHexSha256,
  merkleRoot,
  type ProofStep,
} from './merkleTree';

export const MANIFEST_VERSION = 'mcop-cuda-kernel-manifest/2.0';
export const MERKLE_ALGORITHM = 'rfc6962-sha256';
export const LEAF_ORDER = 'kernel-name-asc';

export interface KernelEntry {
  readonly path: string;
  readonly model_id: string;
  readonly bytes_sha256: string;
  readonly fp_variant: string;
  readonly bytes: number;
  readonly leaf_index: number;
}

export interface MerkleBlock {
  readonly algorithm: string;
  readonly leaf: string;
  readonly leaf_order: string;
  readonly root: string;
  readonly leaves: ReadonlyArray<string>;
}

export interface ModelManifest {
  readonly version: string;
  readonly exported_at: string;
  readonly backend: string;
  readonly fp_variant: string;
  readonly seed: number;
  readonly merkle: MerkleBlock;
  readonly kernels: Readonly<Record<string, KernelEntry>>;
}

export interface VerifyResult {
  readonly valid: boolean;
  readonly reason?: string;
}

export class ManifestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ManifestError';
  }
}

/** `model_id = SHA-256(model bytes)` as a lowercase hex string. */
export function modelIdForBytes(data: Uint8Array): string {
  return createHash('sha256').update(data).digest('hex');
}

/** Compute the `model_id` of an ONNX file from its bytes on disk. */
export function modelIdForFile(filePath: string): string {
  return modelIdForBytes(readFileSync(filePath));
}

/** Canonical leaf ordering: lexicographic by kernel name. */
export function orderedKernelNames(names: ReadonlyArray<string>): string[] {
  return [...names].sort();
}

function leavesFromModelIds(modelIds: ReadonlyArray<string>): Buffer[] {
  return modelIds.map((mid) => {
    if (!isHexSha256(mid)) {
      throw new ManifestError(`model_id is not a 64-char hex SHA-256: ${JSON.stringify(mid)}`);
    }
    return Buffer.from(mid, 'hex');
  });
}

/** The manifest's declared Merkle root (hex). */
export function manifestRoot(manifest: ModelManifest): string {
  const root = manifest?.merkle?.root;
  if (!isHexSha256(root)) throw new ManifestError("manifest 'merkle.root' is not a 64-char hex SHA-256");
  return root;
}

/**
 * Build a v2.0 manifest from `{ kernelName: bytes }`. Mirrors the Python
 * `build_manifest`; primarily used by tests and parity fixtures (the
 * shipped manifest is produced by `scripts/export_cuda_kernels/export.py`).
 */
export function buildManifest(
  files: Record<string, Uint8Array>,
  options: {
    backend: string;
    fpVariant: string;
    seed: number;
    exportedAt: string;
    pathFor?: (name: string) => string;
  },
): ModelManifest {
  const names = orderedKernelNames(Object.keys(files));
  const modelIds: Record<string, string> = {};
  for (const name of names) modelIds[name] = modelIdForBytes(files[name]);
  const orderedIds = names.map((n) => modelIds[n]);
  const root = merkleRoot(leavesFromModelIds(orderedIds)).toString('hex');

  const kernels: Record<string, KernelEntry> = {};
  names.forEach((name, index) => {
    kernels[name] = {
      path: options.pathFor ? options.pathFor(name) : `mcop_${name}.onnx`,
      model_id: modelIds[name],
      bytes_sha256: modelIds[name],
      fp_variant: options.fpVariant,
      bytes: files[name].length,
      leaf_index: index,
    };
  });

  return {
    version: MANIFEST_VERSION,
    exported_at: options.exportedAt,
    backend: options.backend,
    fp_variant: options.fpVariant,
    seed: options.seed,
    merkle: {
      algorithm: MERKLE_ALGORITHM,
      leaf: 'model_id',
      leaf_order: LEAF_ORDER,
      root,
      leaves: orderedIds,
    },
    kernels,
  };
}

/** Load + structurally validate a manifest JSON file. */
export function loadManifest(manifestPath: string): ModelManifest {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(manifestPath, 'utf-8'));
  } catch (err) {
    throw new ManifestError(`manifest is not valid JSON: ${(err as Error).message}`);
  }
  if (parsed === null || typeof parsed !== 'object') {
    throw new ManifestError('manifest is not a JSON object');
  }
  const manifest = parsed as ModelManifest;
  if (manifest.version !== MANIFEST_VERSION) {
    throw new ManifestError(
      `unsupported manifest version: ${JSON.stringify(manifest.version)} (expected ${JSON.stringify(MANIFEST_VERSION)})`,
    );
  }
  return manifest;
}

export function modelIdOf(manifest: ModelManifest, kernel: string): string {
  const entry = kernelEntry(manifest, kernel);
  if (!isHexSha256(entry.model_id)) throw new ManifestError(`kernel ${JSON.stringify(kernel)} has no valid model_id`);
  return entry.model_id;
}

export function leafIndexOf(manifest: ModelManifest, kernel: string): number {
  const entry = kernelEntry(manifest, kernel);
  if (!Number.isInteger(entry.leaf_index) || entry.leaf_index < 0) {
    throw new ManifestError(`kernel ${JSON.stringify(kernel)} has no valid leaf_index`);
  }
  return entry.leaf_index;
}

/** Build the Merkle inclusion proof for one kernel's `model_id`. */
export function inclusionProofForKernel(manifest: ModelManifest, kernel: string): ProofStep[] {
  const leafIds = manifestLeafIds(manifest);
  const leaves = leavesFromModelIds(leafIds);
  const index = leafIndexOf(manifest, kernel);
  if (index >= leaves.length) {
    throw new ManifestError(
      `kernel ${JSON.stringify(kernel)} leaf_index ${index} out of range for ${leaves.length} leaves`,
    );
  }
  const expected = modelIdOf(manifest, kernel);
  if (leafIds[index] !== expected) {
    throw new ManifestError(
      `kernel ${JSON.stringify(kernel)} model_id does not match leaves[${index}] — manifest is inconsistent`,
    );
  }
  return inclusionProof(leaves, index);
}

/**
 * Recompute every `model_id` from disk and re-derive the Merkle root.
 * Returns `valid: false` with a reason on the first inconsistency.
 */
export function verifyManifest(manifest: ModelManifest, modelsDir: string): VerifyResult {
  const kernels = manifest?.kernels;
  if (kernels === null || typeof kernels !== 'object' || Object.keys(kernels).length === 0) {
    return { valid: false, reason: 'manifest has no kernels' };
  }

  const names = orderedKernelNames(Object.keys(kernels));
  const recomputedIds: string[] = [];
  for (let expectedIndex = 0; expectedIndex < names.length; expectedIndex++) {
    const name = names[expectedIndex];
    const entry = kernels[name];
    if (entry === null || typeof entry !== 'object') {
      return { valid: false, reason: `kernel ${JSON.stringify(name)} entry is not an object` };
    }
    if (entry.leaf_index !== expectedIndex) {
      return {
        valid: false,
        reason: `kernel ${JSON.stringify(name)} leaf_index ${entry.leaf_index} != canonical order index ${expectedIndex}`,
      };
    }
    if (typeof entry.path !== 'string' || entry.path.length === 0) {
      return { valid: false, reason: `kernel ${JSON.stringify(name)} has no path` };
    }
    const filePath = path.join(modelsDir, entry.path);
    if (!existsSync(filePath) || !statSync(filePath).isFile()) {
      return { valid: false, reason: `model file missing: ${filePath}` };
    }
    const actualId = modelIdForFile(filePath);
    if (actualId !== entry.model_id) {
      return {
        valid: false,
        reason: `model_id mismatch for ${JSON.stringify(name)}: file=${actualId} manifest=${entry.model_id} (tampered bytes)`,
      };
    }
    recomputedIds.push(actualId);
  }

  let declaredLeaves: string[];
  try {
    declaredLeaves = manifestLeafIds(manifest);
  } catch (err) {
    return { valid: false, reason: (err as Error).message };
  }
  if (declaredLeaves.length !== recomputedIds.length || declaredLeaves.some((h, i) => h !== recomputedIds[i])) {
    return { valid: false, reason: "manifest 'merkle.leaves' do not match kernel model_ids in canonical order" };
  }

  let recomputedRoot: string;
  let declaredRoot: string;
  try {
    recomputedRoot = merkleRoot(leavesFromModelIds(recomputedIds)).toString('hex');
    declaredRoot = manifestRoot(manifest);
  } catch (err) {
    return { valid: false, reason: (err as Error).message };
  }
  if (recomputedRoot !== declaredRoot) {
    return { valid: false, reason: `merkle root mismatch: recomputed=${recomputedRoot} manifest=${declaredRoot}` };
  }
  return { valid: true };
}

function kernelEntry(manifest: ModelManifest, kernel: string): KernelEntry {
  const kernels = manifest?.kernels;
  if (kernels === null || typeof kernels !== 'object') throw new ManifestError('manifest has no kernels');
  const entry = kernels[kernel];
  if (entry === null || entry === undefined || typeof entry !== 'object') {
    throw new ManifestError(`unknown kernel: ${JSON.stringify(kernel)}`);
  }
  return entry;
}

function manifestLeafIds(manifest: ModelManifest): string[] {
  const leaves = manifest?.merkle?.leaves;
  if (!Array.isArray(leaves) || !leaves.every((x) => typeof x === 'string')) {
    throw new ManifestError("manifest 'merkle.leaves' is not a list of hex strings");
  }
  return [...leaves];
}
