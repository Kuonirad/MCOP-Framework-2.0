import { mkdtempSync, writeFileSync, rmSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';

import { merkleRoot } from '../provenance/merkleTree';
import {
  MANIFEST_VERSION,
  ManifestError,
  buildManifest,
  inclusionProofForKernel,
  leafIndexOf,
  loadManifest,
  manifestRoot,
  modelIdForBytes,
  modelIdOf,
  orderedKernelNames,
  verifyManifest,
  type ModelManifest,
} from '../provenance/modelManifest';

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const MODELS_DIR = path.join(REPO_ROOT, 'models');
const COMMITTED_ROOT = '3e53db14a02c652b8f4d03e3c7a730dba39ba834a1492b2129c53a58c8bb76f0';

function synthFiles(): Record<string, Uint8Array> {
  return {
    encode: Buffer.from('MCOP-ONNX encode bytes'),
    homeostasis: Buffer.from('MCOP-ONNX homeostasis bytes'),
    cosineRecall: Buffer.from('MCOP-ONNX cosineRecall bytes'),
  };
}

function writeModels(dir: string, files: Record<string, Uint8Array>): void {
  for (const [name, bytes] of Object.entries(files)) {
    writeFileSync(path.join(dir, `mcop_${name}.onnx`), bytes);
  }
}

/** Deep-mutable view so we can mutate a manifest for negative tests. */
type Mutable<T> = { -readonly [P in keyof T]: Mutable<T[P]> };
function clone(m: ModelManifest): Mutable<ModelManifest> {
  return JSON.parse(JSON.stringify(m));
}

describe('modelManifest — model_id', () => {
  it('model_id is SHA-256 of the bytes', () => {
    const id = modelIdForBytes(Buffer.from('hello'));
    expect(id).toBe('2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824');
  });
});

describe('modelManifest — buildManifest', () => {
  it('produces a v2.0 manifest with a Merkle root over sorted leaves', () => {
    const files = synthFiles();
    const m = buildManifest(files, { backend: 'reference', fpVariant: 'fp16', seed: 1, exportedAt: 'T' });
    expect(m.version).toBe(MANIFEST_VERSION);
    // Leaves are ordered lexicographically by kernel name.
    expect(orderedKernelNames(Object.keys(files))).toEqual(['cosineRecall', 'encode', 'homeostasis']);
    expect(Object.keys(m.kernels).every((k) => m.kernels[k].leaf_index >= 0)).toBe(true);
    // model_id and bytes_sha256 agree and equal SHA-256 of bytes.
    expect(m.kernels.encode.model_id).toBe(modelIdForBytes(files.encode));
    expect(m.kernels.encode.bytes_sha256).toBe(m.kernels.encode.model_id);
    // Root matches an independent recomputation over the ordered leaves.
    const leaves = m.merkle.leaves.map((h) => Buffer.from(h, 'hex'));
    expect(m.merkle.root).toBe(merkleRoot(leaves).toString('hex'));
  });

  it('leaf_index follows kernel-name-asc order', () => {
    const m = buildManifest(synthFiles(), { backend: 'reference', fpVariant: 'fp16', seed: 1, exportedAt: 'T' });
    expect(m.kernels.cosineRecall.leaf_index).toBe(0);
    expect(m.kernels.encode.leaf_index).toBe(1);
    expect(m.kernels.homeostasis.leaf_index).toBe(2);
  });
});

describe('modelManifest — verifyManifest (synthetic round trip)', () => {
  let dir: string;
  let m: ModelManifest;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'mcop-manifest-'));
    const files = synthFiles();
    writeModels(dir, files);
    m = buildManifest(files, { backend: 'reference', fpVariant: 'fp16', seed: 1, exportedAt: 'T' });
  });

  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('verifies a freshly built manifest against its files', () => {
    expect(verifyManifest(m, dir)).toEqual({ valid: true });
  });

  it('detects a byte-level tamper (model_id drift)', () => {
    writeFileSync(path.join(dir, 'mcop_encode.onnx'), Buffer.from('TAMPERED'));
    const res = verifyManifest(m, dir);
    expect(res.valid).toBe(false);
    expect(res.reason).toMatch(/model_id mismatch/);
  });

  it('detects a missing model file', () => {
    unlinkSync(path.join(dir, 'mcop_encode.onnx'));
    const res = verifyManifest(m, dir);
    expect(res.valid).toBe(false);
    expect(res.reason).toMatch(/model file missing/);
  });

  it('detects a leaf_index reordering', () => {
    const bad = clone(m);
    bad.kernels.encode = { ...bad.kernels.encode, leaf_index: 5 };
    const res = verifyManifest(bad, dir);
    expect(res.valid).toBe(false);
    expect(res.reason).toMatch(/leaf_index/);
  });

  it('detects a leaves[] mismatch', () => {
    const bad = clone(m);
    bad.merkle = { ...bad.merkle, leaves: [...bad.merkle.leaves].reverse() };
    const res = verifyManifest(bad, dir);
    expect(res.valid).toBe(false);
    expect(res.reason).toMatch(/merkle\.leaves|leaf_index/);
  });

  it('detects a forged root', () => {
    const bad = clone(m);
    bad.merkle = { ...bad.merkle, root: 'a'.repeat(64) };
    const res = verifyManifest(bad, dir);
    expect(res.valid).toBe(false);
    expect(res.reason).toMatch(/root mismatch/);
  });

  it('rejects a manifest with no kernels', () => {
    const bad = clone(m);
    bad.kernels = {};
    expect(verifyManifest(bad, dir).valid).toBe(false);
  });

  it('rejects a kernel entry missing its path', () => {
    const bad = clone(m);
    delete (bad.kernels.encode as { path?: string }).path;
    const res = verifyManifest(bad, dir);
    expect(res.valid).toBe(false);
    expect(res.reason).toMatch(/has no path/);
  });
});

describe('modelManifest — loadManifest + accessors against committed models/', () => {
  const m = loadManifest(path.join(MODELS_DIR, 'manifest.json'));

  it('loads the committed v2.0 manifest', () => {
    expect(m.version).toBe(MANIFEST_VERSION);
    expect(manifestRoot(m)).toBe(COMMITTED_ROOT);
  });

  it('verifies the committed manifest against the committed ONNX files', () => {
    expect(verifyManifest(m, MODELS_DIR)).toEqual({ valid: true });
  });

  it('builds a verifiable inclusion proof for every kernel', () => {
    for (const kernel of Object.keys(m.kernels)) {
      const proof = inclusionProofForKernel(m, kernel);
      expect(Array.isArray(proof)).toBe(true);
      expect(leafIndexOf(m, kernel)).toBeGreaterThanOrEqual(0);
      expect(modelIdOf(m, kernel)).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it('throws on unknown kernel', () => {
    expect(() => modelIdOf(m, 'nope')).toThrow(ManifestError);
    expect(() => inclusionProofForKernel(m, 'nope')).toThrow(ManifestError);
  });
});

describe('modelManifest — loadManifest errors', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'mcop-bad-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('rejects invalid JSON', () => {
    const p = path.join(dir, 'm.json');
    writeFileSync(p, '{not json');
    expect(() => loadManifest(p)).toThrow(ManifestError);
  });

  it('rejects an unsupported version', () => {
    const p = path.join(dir, 'm.json');
    writeFileSync(p, JSON.stringify({ version: 'mcop-cuda-kernel-manifest/1.0' }));
    expect(() => loadManifest(p)).toThrow(/unsupported manifest version/);
  });

  it('rejects a non-object manifest', () => {
    const p = path.join(dir, 'm.json');
    writeFileSync(p, '42');
    expect(() => loadManifest(p)).toThrow(ManifestError);
  });
});
