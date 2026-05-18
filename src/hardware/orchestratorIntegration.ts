/**
 * @fileoverview Orchestrator integration helpers for the MCOP hardware
 * acceleration layer.
 *
 * This module implements **Phase 2** of the CUDA productionization plan:
 *
 *   - Dual-path unification: the in-process op-sharded layer
 *     ({@link CUDAHardwareLayer}) and the HTTP microservice provider
 *     ({@link CUDAProvider}) ship side-by-side under independent flags. The
 *     factory below resolves the right runtime topology from the
 *     declarative {@link MCOPHardwareAccelerationConfig} block —
 *     `enableCUDA: 'auto' | true | false` × `provider: 'onnx' |
 *     'microservice'` — without forcing callers to plumb the matrix
 *     manually.
 *
 *   - Substrate-conditional provenance: every layer produced here
 *     carries an `resolvedFrom` audit tag plus the provider kind so
 *     downstream MetaTuner / cluster replay can condition revival on
 *     the *exact* hardware lineage that produced a successful trajectory.
 *
 *   - Zero blast radius when CUDA is off: an `enableCUDA: false` or
 *     CPU-only host produces a `CPUFallback` accelerator and a
 *     disabled `CUDAHardwareLayer` — both honour every existing
 *     consumer interface byte-identically, so the Φ5 leaf shape is
 *     preserved without any caller changes.
 *
 * See `docs/CUDA_PRODUCTION.md` for the full operator-facing runbook
 * and the "Enable CUDA in 3 lines" recipe.
 */

import {
  type Accelerator,
  type CUDAProviderOptions,
  CPUFallback,
  CUDAProvider,
  createDefaultAccelerator,
} from './Accelerator';
import {
  CUDAHardwareLayer,
  type CUDAHardwareLayerOptions,
  detectCUDACapability,
} from './CUDAHardwareLayer';
import {
  MCOP_DEFAULT_ORCHESTRATOR,
  type MCOPHardwareAccelerationConfig,
} from '../config/mcop.config';

/* ------------------------------------------------------------------ */
/* Public types                                                        */
/* ------------------------------------------------------------------ */

/**
 * Resolved runtime triple returned by {@link resolveHardwareLayer}.
 *
 *   - `accelerator` — the {@link Accelerator} used by hot paths that
 *     dispatch via the unified `accelerate(op, input)` contract
 *     ({@link CUDAProvider} when the microservice provider is
 *     selected, {@link CPUFallback} otherwise).
 *   - `cudaLayer` — the in-process op-sharded layer (`enableCUDA`
 *     determined by the Φ5 probe + override env). Always populated; an
 *     `enableCUDA=false` instance carries a `resolvedFrom` audit tag
 *     so disabled-state lineage survives into the cluster log.
 *   - `resolved` — the canonical config block with environment +
 *     probe overrides folded in, suitable for sealing into the
 *     orchestrator's Merkle leaf.
 */
export interface ResolvedHardwareLayer {
  readonly accelerator: Accelerator;
  readonly cudaLayer: CUDAHardwareLayer;
  readonly resolved: ResolvedHardwareConfig;
}

/**
 * Sealed view of {@link MCOPHardwareAccelerationConfig} with the
 * probe outcome + resolution provenance attached. Byte-stable across
 * reruns given the same host + env, so it can be safely included in
 * canonical encodings.
 */
export interface ResolvedHardwareConfig {
  readonly useCUDA: boolean;
  readonly provider: MCOPHardwareAccelerationConfig['provider'];
  readonly enableCUDA: boolean;
  readonly kernelDir: string;
  readonly resolvedFrom: ResolvedFromTag;
}

export type ResolvedFromTag =
  | 'explicit-on'
  | 'explicit-off'
  | 'default-off'
  | 'auto-capable'
  | 'auto-not-capable';

/* ------------------------------------------------------------------ */
/* Options                                                             */
/* ------------------------------------------------------------------ */

/**
 * Options accepted by {@link resolveHardwareLayer}. Every field is
 * optional; the default reads from
 * {@link MCOP_DEFAULT_ORCHESTRATOR}`.hardware` so the typical caller is
 * `await resolveHardwareLayer()`.
 */
export interface ResolveHardwareLayerOptions {
  /** Override the declarative config block. */
  config?: Partial<MCOPHardwareAccelerationConfig>;
  /** Forwarded to {@link CUDAProvider} when the microservice provider is selected. */
  microservice?: Omit<CUDAProviderOptions, 'fallback'>;
  /** Forwarded to {@link CUDAHardwareLayer.create}. */
  layer?: Omit<CUDAHardwareLayerOptions, 'enableCUDA' | 'kernelDir'>;
  /**
   * Test hook: deterministic probe override. When supplied, replaces
   * {@link detectCUDACapability} for the in-process layer's `'auto'`
   * resolution.
   */
  probe?: () => Promise<{ capable: boolean }>;
  /**
   * Test hook: replaces {@link createDefaultAccelerator} for the
   * microservice path. Used by unit tests to avoid touching the
   * network.
   */
  createAccelerator?: (options: CUDAProviderOptions) => Promise<Accelerator>;
}

/* ------------------------------------------------------------------ */
/* Factory                                                             */
/* ------------------------------------------------------------------ */

/**
 * Resolve the declarative `hardware` config block into a concrete
 * {@link ResolvedHardwareLayer} triple.
 *
 * Resolution matrix:
 *
 *   - `useCUDA: false` ∨ unset → microservice path disabled, `accelerator =
 *     CPUFallback`.
 *   - `useCUDA: true`, `provider: 'microservice'` → spin up
 *     {@link CUDAProvider} via {@link createDefaultAccelerator}.
 *   - `useCUDA: true`, `provider: 'onnx'` → the in-process layer is the
 *     sole CUDA path; the `accelerator` slot stays on `CPUFallback`
 *     (the in-process layer is dispatched separately via
 *     `cudaLayer.accelerate(op, feeds)`).
 *   - `enableCUDA: 'auto'` → Φ5 probe runs and seals
 *     `'auto-capable'` / `'auto-not-capable'` into the leaf.
 *   - `enableCUDA: true | false` → bypass the probe and seal
 *     `'explicit-on'` / `'explicit-off'`.
 *
 * Never throws; an `onnxruntime-node` import failure during the probe
 * folds into `'auto-not-capable'` with the layer disabled.
 */
export async function resolveHardwareLayer(
  options: ResolveHardwareLayerOptions = {},
): Promise<ResolvedHardwareLayer> {
  const declarative: MCOPHardwareAccelerationConfig = {
    ...MCOP_DEFAULT_ORCHESTRATOR.hardware,
    ...(options.config ?? {}),
  };

  // ------------------------------------------------------------
  // In-process layer (Φ1–Φ5)
  // ------------------------------------------------------------
  const requested = declarative.enableCUDA;
  const layerOptions: CUDAHardwareLayerOptions = {
    ...(options.layer ?? {}),
    enableCUDA: requested,
    kernelDir: declarative.kernelDir,
  };

  let cudaLayer: CUDAHardwareLayer;
  let resolvedFrom: ResolvedFromTag;

  if (requested === true) {
    cudaLayer = new CUDAHardwareLayer(layerOptions);
    resolvedFrom = 'explicit-on';
  } else if (requested === false) {
    cudaLayer = new CUDAHardwareLayer(layerOptions);
    resolvedFrom = 'explicit-off';
  } else if (requested === 'auto') {
    const probe = options.probe
      ? await options.probe()
      : await detectCUDACapability({ ortInjection: options.layer?.ortInjection });
    const capable = probe.capable;
    cudaLayer = new CUDAHardwareLayer({
      ...layerOptions,
      enableCUDA: capable,
      resolvedFrom: capable ? 'auto-capable' : 'auto-not-capable',
    });
    resolvedFrom = capable ? 'auto-capable' : 'auto-not-capable';
  } else {
    cudaLayer = new CUDAHardwareLayer({ ...layerOptions, enableCUDA: false });
    resolvedFrom = 'default-off';
  }

  // ------------------------------------------------------------
  // Microservice / unified Accelerator
  // ------------------------------------------------------------
  let accelerator: Accelerator;
  if (declarative.useCUDA && declarative.provider === 'microservice') {
    const factory = options.createAccelerator ?? createDefaultAccelerator;
    accelerator = await factory({
      ...(options.microservice ?? {}),
      device: options.microservice?.device,
    });
  } else if (declarative.useCUDA && declarative.provider === 'native') {
    // Reserved for future native binding; for now degrade to microservice
    // through createDefaultAccelerator (preserves existing semantics).
    const factory = options.createAccelerator ?? createDefaultAccelerator;
    accelerator = await factory({
      ...(options.microservice ?? {}),
      provider: 'native',
    });
  } else {
    // `provider: 'onnx'` keeps the accelerator on CPU (the in-process
    // layer is dispatched via `cudaLayer.accelerate(...)`); `useCUDA:
    // false` also returns CPU. Either way the canonical Accelerator
    // contract is honoured.
    accelerator = new CPUFallback();
  }

  return Object.freeze({
    accelerator,
    cudaLayer,
    resolved: Object.freeze({
      useCUDA: declarative.useCUDA,
      provider: declarative.provider,
      enableCUDA: cudaLayer.enableCUDA,
      kernelDir: declarative.kernelDir,
      resolvedFrom,
    }),
  });
}

/**
 * Synchronous resolver for callers that have already collapsed the
 * tri-state {@link CUDAEnableMode} into a concrete boolean. Useful in
 * orchestrator constructors that cannot `await`.
 *
 * `'auto'` is treated as `false` in this path (the constructor of
 * {@link CUDAHardwareLayer} mirrors the same conservative default).
 * Production callers should prefer {@link resolveHardwareLayer} so
 * the Φ5 probe runs.
 */
export function resolveHardwareLayerSync(
  options: Omit<ResolveHardwareLayerOptions, 'probe' | 'createAccelerator'> = {},
): ResolvedHardwareLayer {
  const declarative: MCOPHardwareAccelerationConfig = {
    ...MCOP_DEFAULT_ORCHESTRATOR.hardware,
    ...(options.config ?? {}),
  };
  const requested = declarative.enableCUDA;
  const enableCUDA = requested === true;
  const cudaLayer = new CUDAHardwareLayer({
    ...(options.layer ?? {}),
    enableCUDA,
    kernelDir: declarative.kernelDir,
    resolvedFrom:
      requested === true
        ? 'explicit-on'
        : requested === false
          ? 'explicit-off'
          : requested === 'auto'
            ? 'auto-not-capable'
            : 'default-off',
  });
  const accelerator: Accelerator =
    declarative.useCUDA && declarative.provider === 'microservice'
      ? new CUDAProvider({ ...(options.microservice ?? {}) })
      : new CPUFallback();
  return Object.freeze({
    accelerator,
    cudaLayer,
    resolved: Object.freeze({
      useCUDA: declarative.useCUDA,
      provider: declarative.provider,
      enableCUDA: cudaLayer.enableCUDA,
      kernelDir: declarative.kernelDir,
      resolvedFrom: cudaLayer.resolvedFrom as ResolvedFromTag,
    }),
  });
}
