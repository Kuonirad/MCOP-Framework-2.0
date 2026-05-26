import * as path from 'node:path';

import { canonicalDigest } from '../core/canonicalEncoding';
import { buildManifest, manifestRoot, type ModelManifest } from '../provenance/modelManifest';
import {
  ANCHOR_ENV_VAR,
  OnChainRootRegistry,
  POUW_RECEIPT_VERSION,
  buildModelPoUWReceipt,
  verifyPoUWReceipt,
  type PoUWReceipt,
} from '../provenance/pouwReceipt';

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const COMMITTED_ROOT = '3e53db14a02c652b8f4d03e3c7a730dba39ba834a1492b2129c53a58c8bb76f0';

function manifest(): ModelManifest {
  return buildManifest(
    {
      encode: Buffer.from('encode-bytes'),
      homeostasis: Buffer.from('homeostasis-bytes'),
      cosineRecall: Buffer.from('cosine-bytes'),
    },
    { backend: 'reference', fpVariant: 'fp16', seed: 1, exportedAt: 'T' },
  );
}

function receipt(m: ModelManifest, kernel = 'encode'): PoUWReceipt {
  return buildModelPoUWReceipt(m, {
    kernel,
    canonicalOp: 'nova-neo-encode',
    workMerkleRoot: 'w'.repeat(64),
    verifiedDevice: 'CUDAExecutionProvider',
    device: 'cuda:0',
    durationMs: 1.5,
    timestamp: '2026-05-25T00:00:00.000Z',
  });
}

/**
 * Re-derive a `receiptId` over forged fields (mirrors the module's
 * canonical body) so we can construct a *self-consistent* receipt whose
 * Merkle proof nonetheless fails to fold to the root.
 */
function forge(base: PoUWReceipt, overrides: Partial<PoUWReceipt>): PoUWReceipt {
  const merged = { ...base, ...overrides };
  const body = {
    type: 'MCOP_POUW_RECEIPT',
    version: POUW_RECEIPT_VERSION,
    kernel: merged.kernel,
    canonicalOp: merged.canonicalOp,
    modelId: merged.modelId,
    manifestRoot: merged.manifestRoot,
    inclusionProof: merged.inclusionProof.map((s) => ({ sibling: s.sibling, side: s.side })),
    workMerkleRoot: merged.workMerkleRoot,
    verifiedDevice: merged.verifiedDevice,
    device: merged.device,
    durationMs: merged.durationMs,
    timestamp: merged.timestamp,
  };
  return { ...merged, receiptId: canonicalDigest(body) };
}

describe('pouwReceipt — buildModelPoUWReceipt', () => {
  it('binds model_id, manifest root, proof and a self-digest', () => {
    const m = manifest();
    const r = receipt(m);
    expect(r.version).toBe(POUW_RECEIPT_VERSION);
    expect(r.modelId).toBe(m.kernels.encode.model_id);
    expect(r.manifestRoot).toBe(manifestRoot(m));
    expect(r.inclusionProof.length).toBeGreaterThan(0);
    expect(r.receiptId).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is deterministic for identical inputs', () => {
    const m = manifest();
    expect(receipt(m).receiptId).toBe(receipt(m).receiptId);
  });
});

describe('pouwReceipt — verifyPoUWReceipt', () => {
  it('accepts a valid receipt against the matching on-chain root', () => {
    const m = manifest();
    const r = receipt(m);
    expect(verifyPoUWReceipt(r, manifestRoot(m))).toEqual({ valid: true });
  });

  it('verifies for every kernel in the manifest', () => {
    const m = manifest();
    for (const kernel of Object.keys(m.kernels)) {
      const r = buildModelPoUWReceipt(m, {
        kernel,
        canonicalOp: kernel,
        workMerkleRoot: 'a'.repeat(64),
        verifiedDevice: 'CUDAExecutionProvider',
        device: 'cuda:0',
        durationMs: 0,
      });
      expect(verifyPoUWReceipt(r, manifestRoot(m)).valid).toBe(true);
    }
  });

  it('rejects when no on-chain root is available', () => {
    const r = receipt(manifest());
    expect(verifyPoUWReceipt(r, null).valid).toBe(false);
    expect(verifyPoUWReceipt(r, undefined).reason).toMatch(/no on-chain anchored root/);
  });

  it('rejects an unanchored root (root mismatch)', () => {
    const r = receipt(manifest());
    const res = verifyPoUWReceipt(r, 'b'.repeat(64));
    expect(res.valid).toBe(false);
    expect(res.reason).toMatch(/not anchored on-chain/);
  });

  it('rejects a tampered field (receiptId mismatch)', () => {
    const m = manifest();
    const r = receipt(m);
    const tampered: PoUWReceipt = { ...r, modelId: 'c'.repeat(64) };
    const res = verifyPoUWReceipt(tampered, manifestRoot(m));
    expect(res.valid).toBe(false);
    expect(res.reason).toMatch(/receiptId mismatch/);
  });

  it('rejects a self-consistent receipt whose proof does not fold to the root', () => {
    const m = manifest();
    const base = receipt(m, 'encode');
    const other = receipt(m, 'homeostasis');
    // Swap in another kernel's proof but keep encode's model_id + root,
    // then re-seal the receiptId so the tamper check passes.
    const forged = forge(base, { inclusionProof: other.inclusionProof });
    const res = verifyPoUWReceipt(forged, manifestRoot(m));
    expect(res.valid).toBe(false);
    expect(res.reason).toMatch(/inclusion proof does not reproduce/);
  });

  it('rejects a non-hex manifestRoot even if receiptId is self-consistent', () => {
    const base = receipt(manifest());
    const forged = forge(base, { manifestRoot: 'not-hex' });
    const res = verifyPoUWReceipt(forged, 'not-hex');
    expect(res.valid).toBe(false);
    expect(res.reason).toMatch(/manifestRoot is not a valid SHA-256/);
  });
});

describe('pouwReceipt — OnChainRootRegistry', () => {
  it('resolves an explicit override (lowercased)', () => {
    const reg = new OnChainRootRegistry({ override: 'A'.repeat(64), env: {} });
    expect(reg.resolve()).toBe('a'.repeat(64));
  });

  it('resolves from the environment variable', () => {
    const reg = new OnChainRootRegistry({ env: { [ANCHOR_ENV_VAR]: COMMITTED_ROOT } });
    expect(reg.resolve()).toBe(COMMITTED_ROOT);
  });

  it('resolves from an anchor file via injected reader', () => {
    const reg = new OnChainRootRegistry({
      anchorPath: '/anchor.json',
      env: {},
      readFile: () => JSON.stringify({ root: COMMITTED_ROOT }),
    });
    expect(reg.resolve()).toBe(COMMITTED_ROOT);
  });

  it('honours precedence override > env > anchor', () => {
    const reg = new OnChainRootRegistry({
      override: 'a'.repeat(64),
      env: { [ANCHOR_ENV_VAR]: 'b'.repeat(64) },
      anchorPath: '/anchor.json',
      readFile: () => JSON.stringify({ root: 'c'.repeat(64) }),
    });
    expect(reg.resolve()).toBe('a'.repeat(64));
  });

  it('returns null when nothing resolves', () => {
    expect(new OnChainRootRegistry({ env: {} }).resolve()).toBeNull();
    const badFile = new OnChainRootRegistry({ env: {}, anchorPath: '/x', readFile: () => 'not json' });
    expect(badFile.resolve()).toBeNull();
    const noRoot = new OnChainRootRegistry({ env: {}, anchorPath: '/x', readFile: () => JSON.stringify({}) });
    expect(noRoot.resolve()).toBeNull();
  });

  it('resolves the committed anchor file from disk to the committed root', () => {
    const reg = new OnChainRootRegistry({ env: {}, anchorPath: path.join(REPO_ROOT, 'models', 'anchored_root.json') });
    expect(reg.resolve()).toBe(COMMITTED_ROOT);
  });

  it('end-to-end: a receipt verifies against the registry-resolved root', () => {
    const m = manifest();
    const r = buildModelPoUWReceipt(m, {
      kernel: 'encode',
      canonicalOp: 'nova-neo-encode',
      workMerkleRoot: 'a'.repeat(64),
      verifiedDevice: 'CUDAExecutionProvider',
      device: 'cuda:0',
      durationMs: 2,
    });
    const reg = new OnChainRootRegistry({ override: manifestRoot(m), env: {} });
    expect(verifyPoUWReceipt(r, reg.resolve()).valid).toBe(true);
  });
});
