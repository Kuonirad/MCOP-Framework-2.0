import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';

import {
  CUDA_KERNEL_OPS,
  CUDAHardwareLayer,
  type OnnxInferenceSession,
  type OnnxTensor,
} from '../hardware/CUDAHardwareLayer';
import { InMemoryProvenanceSink } from '../hardware/provenanceSink';
import { buildManifest, manifestRoot, type ModelManifest } from '../provenance/modelManifest';
import { verifyPoUWReceipt } from '../provenance/pouwReceipt';

function cudaSession(): OnnxInferenceSession {
  return {
    async run() {
      return { output: { data: new Float32Array([0.5]), dims: [1] } };
    },
    endProfiling() {
      return JSON.stringify([{ args: { provider: 'CUDAExecutionProvider' } }]);
    },
  };
}

function sixKernelManifest(): ModelManifest {
  const files: Record<string, Uint8Array> = {};
  for (const op of CUDA_KERNEL_OPS) files[op] = Buffer.from(`onnx-bytes-${op}`);
  return buildManifest(files, { backend: 'reference', fpVariant: 'fp16', seed: 1, exportedAt: 'T' });
}

const feed: Record<string, OnnxTensor> = { input: { data: new Float32Array([1]), dims: [1] } };

describe('CUDAHardwareLayer — PoUW receipt emission', () => {
  it('mints a verifiable receipt and etches it to the sink when a manifest is configured', async () => {
    const manifest = sixKernelManifest();
    const sink = new InMemoryProvenanceSink();
    const layer = new CUDAHardwareLayer({
      enableCUDA: true,
      device: 'cuda:0',
      sessionFactory: async () => cudaSession(),
      modelManifest: manifest,
      provenanceSink: sink,
    });
    await layer.loadKernels();

    const result = await layer.accelerate('encode', feed);

    expect(result._pouwReceipt).toBeDefined();
    const receipt = result._pouwReceipt!;
    expect(receipt.kernel).toBe('encode');
    expect(receipt.canonicalOp).toBe('nova-neo-encode');
    expect(receipt.verifiedDevice).toBe('CUDAExecutionProvider');
    expect(receipt.modelId).toBe(manifest.kernels.encode.model_id);
    // The work digest is the provenance merkleRoot of this very run.
    expect(receipt.workMerkleRoot).toBe(result._provenance.merkleRoot);
    // The receipt verifies against the manifest root (the anchored root).
    expect(verifyPoUWReceipt(receipt, manifestRoot(manifest))).toEqual({ valid: true });

    expect(sink.size).toBe(1);
    expect(sink.entries[0].op).toBe('nova-neo-encode');
    expect(sink.entries[0].pouwReceipt?.receiptId).toBe(receipt.receiptId);
  });

  it('emits a verifiable receipt for every kernel op', async () => {
    const manifest = sixKernelManifest();
    const root = manifestRoot(manifest);
    const layer = new CUDAHardwareLayer({
      enableCUDA: true,
      sessionFactory: async () => cudaSession(),
      modelManifest: manifest,
    });
    await layer.loadKernels();
    for (const op of CUDA_KERNEL_OPS) {
      const result = await layer.accelerate(op, feed);
      expect(verifyPoUWReceipt(result._pouwReceipt!, root).valid).toBe(true);
    }
  });

  it('omits the receipt when no manifest is configured (Φ1–Φ5 behaviour preserved)', async () => {
    const layer = new CUDAHardwareLayer({
      enableCUDA: true,
      sessionFactory: async () => cudaSession(),
    });
    await layer.loadKernels();
    const result = await layer.accelerate('encode', feed);
    expect(result._pouwReceipt).toBeUndefined();
    expect(result._provenance.merkleRoot).toMatch(/^[0-9a-f]{64}$/);
  });

  it('etches work provenance even without a manifest (receipt absent)', async () => {
    const sink = new InMemoryProvenanceSink();
    const layer = new CUDAHardwareLayer({
      enableCUDA: true,
      sessionFactory: async () => cudaSession(),
      provenanceSink: sink,
    });
    await layer.loadKernels();
    await layer.accelerate('homeostasis', feed);
    expect(sink.size).toBe(1);
    expect(sink.entries[0].op).toBe('homeostasis');
    expect(sink.entries[0].pouwReceipt).toBeUndefined();
  });
});

describe('CUDAHardwareLayer — verifyModelsOnLoad integrity gate', () => {
  let dir: string;
  let manifest: ModelManifest;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'mcop-cuda-models-'));
    const files: Record<string, Uint8Array> = {};
    for (const op of CUDA_KERNEL_OPS) {
      const bytes = Buffer.from(`onnx-bytes-${op}`);
      writeFileSync(path.join(dir, `mcop_${op}.onnx`), bytes);
      files[op] = bytes;
    }
    manifest = buildManifest(files, { backend: 'reference', fpVariant: 'fp16', seed: 1, exportedAt: 'T' });
  });

  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('loads when on-disk bytes match the manifest', async () => {
    const layer = new CUDAHardwareLayer({
      enableCUDA: true,
      kernelDir: dir,
      sessionFactory: async () => cudaSession(),
      modelManifest: manifest,
      verifyModelsOnLoad: true,
    });
    await expect(layer.loadKernels()).resolves.toBeUndefined();
  });

  it('fails closed when a model file is tampered', async () => {
    writeFileSync(path.join(dir, 'mcop_encode.onnx'), Buffer.from('TAMPERED'));
    const layer = new CUDAHardwareLayer({
      enableCUDA: true,
      kernelDir: dir,
      sessionFactory: async () => cudaSession(),
      modelManifest: manifest,
      verifyModelsOnLoad: true,
    });
    await expect(layer.loadKernels()).rejects.toThrow(/integrity check failed/);
  });

  it('skips the gate when verifyModelsOnLoad is off (default)', async () => {
    writeFileSync(path.join(dir, 'mcop_encode.onnx'), Buffer.from('TAMPERED'));
    const layer = new CUDAHardwareLayer({
      enableCUDA: true,
      kernelDir: dir,
      sessionFactory: async () => cudaSession(),
      modelManifest: manifest,
    });
    await expect(layer.loadKernels()).resolves.toBeUndefined();
  });
});
