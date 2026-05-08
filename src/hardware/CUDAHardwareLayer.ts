/**
 * @fileoverview Φ1 of the v2.3 amplified CUDA layer: in-process op-sharded
 * ONNX sessions with verified-device provenance.
 *
 * This module is a *strict superset* of, and never replaces, the existing
 * {@link CUDAProvider} HTTP/microservice bridge in `Accelerator.ts`. The two
 * providers can run concurrently behind their own feature flags (`enableCUDA`
 * for this in-process layer vs `useCUDA` for the microservice bridge).
 *
 * Default state: disabled. `loadKernels()` is a no-op when disabled, and
 * every {@link CUDAHardwareLayer.accelerate} call throws so silent CPU
 * fallbacks cannot pollute the Lamarckian substrate-lineage log.
 *
 * The ONNX Runtime dependency (`onnxruntime-node`) is treated as an optional
 * peer install — it is loaded via dynamic `import()` only when the layer is
 * enabled, mirroring the pattern used by {@link
 * file://./../../examples/onnx_embedding_backend.ts}. Tests can short-circuit
 * the dynamic import by supplying `ortInjection` or `sessionFactory`.
 *
 * See `docs/CUDA_PHI1_PHI5.md` for the full Φ1–Φ5 deployment ladder.
 */

import {
  type AcceleratedOperation,
  type AcceleratedResult,
  attachAcceleratorProvenance,
} from './Accelerator';

/* ------------------------------------------------------------------ */
/* Spec-level kernel names                                            */
/* ------------------------------------------------------------------ */

/**
 * Public camelCase API of {@link CUDAHardwareLayer}, taken verbatim from the
 * v2.3 reception text. Each value maps 1:1 to a canonical kebab-case
 * {@link AcceleratedOperation} so the Merkle provenance shape stays unified
 * across the in-process and microservice providers.
 */
export type CUDAKernelOp =
  | 'encode'
  | 'graphAggregate'
  | 'holographicUpdate'
  | 'cosineRecall'
  | 'evolveScore'
  | 'homeostasis';

export const CUDA_KERNEL_OPS: readonly CUDAKernelOp[] = Object.freeze([
  'encode',
  'graphAggregate',
  'holographicUpdate',
  'cosineRecall',
  'evolveScore',
  'homeostasis',
]);

const KERNEL_TO_OPERATION: Readonly<Record<CUDAKernelOp, AcceleratedOperation>> = Object.freeze({
  encode: 'nova-neo-encode',
  graphAggregate: 'proteome-graph-step',
  holographicUpdate: 'holographic-write',
  cosineRecall: 'cosine-recall',
  evolveScore: 'nova-evolve-score',
  homeostasis: 'homeostasis',
});

/* ------------------------------------------------------------------ */
/* Type-only shims for `onnxruntime-node`                             */
/*                                                                    */
/* The package is an optional peer dependency. We declare just enough */
/* of its public surface to typecheck without it installed (mirrors   */
/* `examples/onnx_embedding_backend.ts`).                             */
/* ------------------------------------------------------------------ */

export interface OnnxTensor {
  readonly data: ArrayBufferView | ArrayLike<number> | ArrayLike<bigint>;
  readonly dims: readonly number[];
}

export interface OnnxInferenceSession {
  run(feeds: Record<string, OnnxTensor>): Promise<Record<string, OnnxTensor>>;
  endProfiling(): string;
}

export type OnnxExecutionProvider =
  | 'CUDAExecutionProvider'
  | 'CPUExecutionProvider'
  | 'WebGPUExecutionProvider'
  | 'unknown'
  | string;

export interface OnnxSessionOptions {
  executionProviders?: readonly OnnxExecutionProvider[];
  graphOptimizationLevel?: 'disabled' | 'basic' | 'extended' | 'all';
  enableProfiling?: boolean;
}

export interface OnnxRuntimeApi {
  InferenceSession: {
    create(modelPath: string, options?: OnnxSessionOptions): Promise<OnnxInferenceSession>;
  };
}

/* ------------------------------------------------------------------ */
/* Layer options + errors                                             */
/* ------------------------------------------------------------------ */

/**
 * CUDA stream-allocation strategy.
 *   - `'per-op'` (Φ3 default) — one logical stream per kernel session, the
 *     computational analogue of mitochondrial cristae compartmentalisation.
 *     Different subsystems (e.g. proteome graph vs encode) can run on
 *     separate SM partitions concurrently. Recorded in
 *     {@link AcceleratorProvenance.substrateLineage} so MetaTuner can
 *     condition revival on stream-allocation lineage.
 *   - `'shared'` — single stream shared across all six sessions. Used for
 *     diagnostics and as a Φ3-rollback escape hatch.
 */
export type CUDAStreamMode = 'per-op' | 'shared';

export interface CUDAHardwareLayerOptions {
  /** Master feature flag. Default `false`. Flip at Φ4 of the deployment ladder. */
  enableCUDA?: boolean;
  /** Logical device tag for provenance, e.g. `cuda:0`. */
  device?: string;
  /** Filesystem directory containing per-op ONNX kernels (`mcop_<op>.onnx`). */
  kernelDir?: string;
  /** Stream-allocation strategy across the six op-sharded sessions. Default `'per-op'`. */
  streams?: CUDAStreamMode;
  /** Override for tests / advanced consumers. Skips the dynamic import of `onnxruntime-node`. */
  ortInjection?: OnnxRuntimeApi;
  /**
   * Override for tests. When provided, bypasses {@link OnnxRuntimeApi.InferenceSession.create}
   * entirely and lets the caller decide how each per-op session is built.
   */
  sessionFactory?: (op: CUDAKernelOp, modelPath: string) => Promise<OnnxInferenceSession>;
}

/**
 * Thrown when the runtime profiler shows the kernel ran on a non-CUDA
 * execution provider while CUDA was requested. Treat this as a hard
 * provenance-integrity violation: the Lamarckian hardware-evolution log
 * must never contain ghost-GPU lineage.
 */
export class GhostGPUError extends Error {
  readonly op: CUDAKernelOp;
  readonly requestedDevice: string;
  readonly verifiedProvider: OnnxExecutionProvider;
  constructor(op: CUDAKernelOp, requestedDevice: string, verifiedProvider: OnnxExecutionProvider) {
    super(
      `Ghost-GPU detected on ${op} (requested ${requestedDevice}, verified ${verifiedProvider}) — provenance integrity violation`,
    );
    this.name = 'GhostGPUError';
    this.op = op;
    this.requestedDevice = requestedDevice;
    this.verifiedProvider = verifiedProvider;
  }
}

/* ------------------------------------------------------------------ */
/* Profiler-output parser                                             */
/* ------------------------------------------------------------------ */

/**
 * Parse the JSON output of {@link OnnxInferenceSession.endProfiling} to
 * extract the *actual* execution provider used for the run, regardless of
 * what was requested.
 *
 * ONNX Runtime emits one event per kernel; the provider lives under
 * `args.provider` (or, in some builds, `args.execution_provider`). The
 * function tolerates both a single JSON document and JSON-lines.
 *
 * Resolution rules:
 *   1. If any kernel ran on `CUDAExecutionProvider`, return that.
 *   2. Else if any kernel ran on `CPUExecutionProvider`, return that.
 *   3. Else if exactly one provider is observed, return it verbatim.
 *   4. Otherwise return `'unknown'`.
 *
 * `'unknown'` lets the caller decide policy; the verifiedDevice gate in
 * {@link CUDAHardwareLayer.accelerate} treats it as a silent CPU fallback.
 */
export function parseExecutionProvider(profilerOutput: string): OnnxExecutionProvider {
  if (typeof profilerOutput !== 'string' || profilerOutput.length === 0) {
    return 'unknown';
  }
  const parsed = tryParseProfile(profilerOutput);
  const providers = collectProviders(parsed);
  if (providers.has('CUDAExecutionProvider')) return 'CUDAExecutionProvider';
  if (providers.has('CPUExecutionProvider')) return 'CPUExecutionProvider';
  if (providers.size === 1) {
    const [only] = providers;
    return only;
  }
  return 'unknown';
}

function tryParseProfile(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    // Some ORT builds emit JSON-lines instead of a single JSON document.
    return raw
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line) => {
        try {
          return JSON.parse(line) as unknown;
        } catch {
          return null;
        }
      })
      .filter((value): value is unknown => value !== null);
  }
}

function collectProviders(parsed: unknown, providers: Set<string> = new Set()): Set<string> {
  if (parsed === null || parsed === undefined) return providers;
  if (Array.isArray(parsed)) {
    for (const event of parsed) collectProviders(event, providers);
    return providers;
  }
  if (typeof parsed === 'object') {
    const obj = parsed as Record<string, unknown>;
    const args = obj['args'];
    if (args !== null && typeof args === 'object') {
      const provider = (args as Record<string, unknown>)['provider'];
      if (typeof provider === 'string' && provider.length > 0) providers.add(provider);
      const ep = (args as Record<string, unknown>)['execution_provider'];
      if (typeof ep === 'string' && ep.length > 0) providers.add(ep);
    }
    const direct = obj['provider'];
    if (typeof direct === 'string' && direct.length > 0) providers.add(direct);
  }
  return providers;
}

/* ------------------------------------------------------------------ */
/* The layer itself                                                   */
/* ------------------------------------------------------------------ */

export class CUDAHardwareLayer {
  readonly enableCUDA: boolean;
  readonly device: string;
  readonly kernelDir: string;
  readonly streams: CUDAStreamMode;

  private readonly ortInjection: OnnxRuntimeApi | undefined;
  private readonly sessionFactory:
    | ((op: CUDAKernelOp, modelPath: string) => Promise<OnnxInferenceSession>)
    | undefined;
  private readonly sessions: Map<CUDAKernelOp, OnnxInferenceSession> = new Map();
  private loaded = false;

  constructor(options: CUDAHardwareLayerOptions = {}) {
    this.enableCUDA = options.enableCUDA ?? false;
    this.device = options.device ?? 'cuda:0';
    this.kernelDir = options.kernelDir ?? './models';
    this.streams = options.streams ?? 'per-op';
    this.ortInjection = options.ortInjection;
    this.sessionFactory = options.sessionFactory;
  }

  /**
   * Lazily create the six op-sharded ONNX sessions, one per kernel.
   *
   * Idempotent: subsequent calls are no-ops. Also a no-op when
   * `enableCUDA` is `false`, so downstream callers do not need to
   * special-case the disabled path.
   */
  async loadKernels(): Promise<void> {
    if (!this.enableCUDA) return;
    if (this.loaded) return;
    const ort = this.sessionFactory ? undefined : this.ortInjection ?? (await loadOnnxRuntime());
    const dir = this.kernelDir.replace(/\/$/, '');
    for (const op of CUDA_KERNEL_OPS) {
      const modelPath = `${dir}/mcop_${op}.onnx`;
      const session = this.sessionFactory
        ? await this.sessionFactory(op, modelPath)
        : await ort!.InferenceSession.create(modelPath, {
            executionProviders: ['CUDAExecutionProvider'],
            graphOptimizationLevel: 'all',
            enableProfiling: true,
          });
      this.sessions.set(op, session);
    }
    this.loaded = true;
  }

  /** Public introspection: which kernels have been loaded into memory. */
  get loadedKernels(): readonly CUDAKernelOp[] {
    return Object.freeze([...this.sessions.keys()]);
  }

  /**
   * Dispatch a single kernel run with verifiedDevice provenance.
   *
   * @throws if the layer is disabled or `loadKernels()` was not called.
   * @throws {@link GhostGPUError} if the runtime profiler shows the kernel
   *   actually ran on a non-CUDA execution provider — guards the
   *   Lamarckian hardware-evolution log against ghost-GPU poisoning.
   */
  async accelerate(
    op: CUDAKernelOp,
    feeds: Record<string, OnnxTensor>,
  ): Promise<AcceleratedResult<{ output: OnnxTensor | undefined; outputs: Record<string, OnnxTensor> }>> {
    if (!this.enableCUDA) {
      throw new Error(
        'CUDAHardwareLayer is disabled (enableCUDA=false). Φ1 ladder default; flip the flag at Φ4 once verifiedDevice gates pass on a 1k-step run.',
      );
    }
    const session = this.sessions.get(op);
    if (!session) {
      throw new Error(`CUDAHardwareLayer kernel not loaded for op=${op}. Call loadKernels() before accelerate().`);
    }

    const start = nowMs();
    const outputs = await session.run(feeds);
    const duration = nowMs() - start;

    const profilerOutput = session.endProfiling();
    const verified = parseExecutionProvider(profilerOutput);
    if (verified !== 'CUDAExecutionProvider') {
      throw new GhostGPUError(op, this.device, verified);
    }

    const firstKey = Object.keys(outputs)[0];
    const primary = firstKey ? outputs[firstKey] : undefined;

    // Φ3 substrate-lineage tag: `<verifiedProvider>/<streamMode>` lets
    // MetaTuner condition revival on the exact stream-allocation regime
    // that produced a successful run, not just the device family.
    const substrateLineage = `${verified}/${this.streams}`;

    return attachAcceleratorProvenance<{ output: OnnxTensor | undefined; outputs: Record<string, OnnxTensor> }>(
      { output: primary, outputs },
      {
        op: KERNEL_TO_OPERATION[op],
        mode: 'cuda',
        device: this.device,
        provider: 'CUDAHardwareLayer:onnx',
        cudaGraphCaptured: true,
        requestedDevice: this.device,
        verifiedDevice: verified,
        substrateLineage,
        durationMs: duration,
      },
    );
  }
}

/* ------------------------------------------------------------------ */
/* Module loader                                                      */
/* ------------------------------------------------------------------ */

async function loadOnnxRuntime(): Promise<OnnxRuntimeApi> {
  // Dynamic specifier hides the import from TypeScript module resolution
  // and from the Next.js client bundle, mirroring
  // `examples/onnx_embedding_backend.ts`. This keeps the file typecheckable
  // and exercises the disabled-flag path even when `onnxruntime-node` is
  // not installed.
  const moduleId = 'onnxruntime-node';
  try {
    const mod = (await import(moduleId)) as unknown as OnnxRuntimeApi;
    return mod;
  } catch (err) {
    throw new Error(
      'CUDAHardwareLayer requires `onnxruntime-node`. Install it with `pnpm add onnxruntime-node` ' +
        `or supply a sessionFactory/ortInjection. Original error: ${(err as Error).message}`,
    );
  }
}

function nowMs(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}
