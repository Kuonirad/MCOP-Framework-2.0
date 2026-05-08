/**
 * @fileoverview MCOP Framework performance configuration.
 * @description Centralised, immutable thresholds and tunables for
 * Core Web Vitals, VSI, and performance coaching. Teams can override
 * values at build time by importing and spreading their own config,
 * but the defaults follow the official web.dev rubrics (Nov 2024).
 *
 * All values are `Object.freeze`d so accidental mutation at runtime
 * is impossible.
 */

export interface MetricThreshold {
  readonly good: number;
  readonly poor: number;
}

export interface VSIOptions {
  readonly windowMs: number;
  readonly recentMs: number;
  readonly pollMs: number;
  readonly sparklineCap: number;
}

export interface MCOPPerformanceConfig {
  readonly LCP: MetricThreshold;
  readonly INP: MetricThreshold;
  readonly CLS: MetricThreshold;
  readonly FCP: MetricThreshold;
  readonly TTFB: MetricThreshold;
  readonly VSI: MetricThreshold & VSIOptions;
}

export interface MCOPOrchestratorProfile {
  readonly id: string;
  readonly adapter: 'xai-grok' | 'local' | 'generic';
  readonly model: string;
  readonly fallbackModel: string;
  readonly entropyTarget: number;
  readonly stigmergyHistoryLimit: number;
  readonly rateLimitMaxRetries: number;
}

/**
 * Φ5 tri-state for the in-process CUDA layer flag. `'auto'` opts into
 * runtime probing via `detectCUDACapability()` so the same MCOP build
 * adapts to every ARC-AGI-3 environment (CPU-only CI, dev laptop,
 * GPU prod node) without code changes.
 */
export type MCOPCUDAEnableMode = boolean | 'auto';

export interface MCOPHardwareAccelerationConfig {
  /** Creator-controlled CUDA switch for the existing microservice/HTTP bridge: true = prefer CUDA bridge, false = force CPU. */
  readonly useCUDA: boolean;
  /** Bridge deployment flavor used when {@link useCUDA} is enabled. */
  readonly provider: 'microservice' | 'onnx' | 'native';
  /**
   * Independent feature flag for the in-process op-sharded CUDA layer
   * (`src/hardware/CUDAHardwareLayer.ts`). Φ5 default `'auto'` —
   * `resolveEnableCUDA()` runs the runtime probe and folds the result
   * into a sealed `resolvedFrom` provenance field. See
   * `docs/CUDA_PHI1_PHI5.md`.
   *
   * Set via `MCOP_ENABLE_CUDA=1` (force-on), `MCOP_ENABLE_CUDA=0`
   * (force-off), or `MCOP_ENABLE_CUDA=auto` (default — probe-driven).
   */
  readonly enableCUDA: MCOPCUDAEnableMode;
  /**
   * Filesystem directory that contains the per-op ONNX kernels expected by
   * `CUDAHardwareLayer.loadKernels()` (one file per kernel, e.g.
   * `mcop_graphAggregate.onnx`). Resolved relative to the process CWD.
   */
  readonly kernelDir: string;
}

/**
 * Parse the `MCOP_ENABLE_CUDA` env var into the tri-state. Unknown
 * values fall back to `false` for safety.
 *
 * Recognised inputs (case-insensitive, trimmed):
 *   - `'1'`, `'true'`, `'on'` → `true`
 *   - `'0'`, `'false'`, `'off'` → `false`
 *   - `'auto'`, `'detect'`, undefined, empty string → `'auto'`
 *   - anything else → `false` (conservative)
 */
export function parseEnableCUDAEnv(raw: string | undefined): MCOPCUDAEnableMode {
  if (raw === undefined) return 'auto';
  const value = raw.trim().toLowerCase();
  if (value === '' || value === 'auto' || value === 'detect') return 'auto';
  if (value === '1' || value === 'true' || value === 'on') return true;
  if (value === '0' || value === 'false' || value === 'off') return false;
  return false;
}

export interface MCOPNovaEvolveTunerConfig {
  readonly enabled: boolean;
  readonly metaTuneInterval: number;
  readonly projectedGainThreshold: number;
  readonly maxMetaDepth: number;
  readonly validationSplitSize: number;
}

export interface MCOPDefaultOrchestratorConfig {
  readonly productionProfile: MCOPOrchestratorProfile;
  readonly novaEvolveTuner: MCOPNovaEvolveTunerConfig;
  readonly hardware: MCOPHardwareAccelerationConfig;
}

export const MCOP_DEFAULT_ORCHESTRATOR: MCOPDefaultOrchestratorConfig = Object.freeze({
  productionProfile: Object.freeze({
    id: 'mapping_grok',
    adapter: 'xai-grok',
    model: 'grok-4-mini',
    fallbackModel: 'grok-3-mini',
    entropyTarget: 0.18,
    stigmergyHistoryLimit: 10,
    rateLimitMaxRetries: 3,
  }),
  novaEvolveTuner: Object.freeze({
    enabled: true,
    metaTuneInterval: 5,
    projectedGainThreshold: 0.04,
    maxMetaDepth: 2,
    validationSplitSize: 25,
  }),
  hardware: Object.freeze({
    useCUDA: process.env.MCOP_USE_CUDA === '1',
    provider: 'microservice',
    enableCUDA: parseEnableCUDAEnv(process.env.MCOP_ENABLE_CUDA),
    kernelDir: process.env.MCOP_CUDA_KERNEL_DIR ?? './models',
  }),
});

export const MCOP_CONFIG: MCOPPerformanceConfig = Object.freeze({
  LCP: Object.freeze({ good: 2500, poor: 4000 }),
  INP: Object.freeze({ good: 200, poor: 500 }),
  CLS: Object.freeze({ good: 0.1, poor: 0.25 }),
  FCP: Object.freeze({ good: 1800, poor: 3000 }),
  TTFB: Object.freeze({ good: 800, poor: 1800 }),
  VSI: Object.freeze({
    good: 0.1,
    poor: 0.25,
    windowMs: 10_000,
    recentMs: 2_000,
    pollMs: 250,
    sparklineCap: 32,
  }),
});

export function classifyMetric(
  name: keyof Omit<MCOPPerformanceConfig, "VSI">,
  value: number,
): "good" | "ni" | "poor" {
  const t = MCOP_CONFIG[name];
  if (value <= t.good) return "good";
  if (value <= t.poor) return "ni";
  return "poor";
}

export function classifyVSI(value: number, count: number): "good" | "ni" | "poor" | "idle" {
  if (count === 0) return "idle";
  if (value <= MCOP_CONFIG.VSI.good) return "good";
  if (value <= MCOP_CONFIG.VSI.poor) return "ni";
  return "poor";
}
