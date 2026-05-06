import { HolographicEtch, HolographicEtchConfig } from './holographicEtch';
import { NovaNeoConfig } from './types';
import { NovaNeoEncoder } from './novaNeoEncoder';
import { StigmergyConfig, StigmergyV5 } from './stigmergyV5';
import { SynthesisProvenanceTracer } from './provenanceTracer';

export interface LowMemoryMCOPModeConfig {
  /** Retained stigmergy traces. Defaults to 256 for low-memory Grok-class routing. */
  maxTraces?: number;
  /** Encoder dimensions. Defaults to 32 for compact resonance. */
  tensorDim?: number;
  /** Produce Float32Array compact views for payload-side low-memory work. */
  useTypedArrays?: boolean;
  /** Enables deterministic prompt pruning helpers. */
  resonanceEarlyExit?: boolean;
  /** Delay tracer allocation until requested. */
  provenanceLazy?: boolean;
  /** Positive Feedback Hysteresis lift. Defaults to StigmergyV5's 0.15. */
  growthBias?: number;
  resonanceThreshold?: number;
  confidenceFloor?: number;
  maxEtches?: number;
  encoderBackend?: NonNullable<NovaNeoConfig['backend']>;
  normalize?: boolean;
  promptTokenBudget?: number;
  preservePromptHeadTokens?: number;
  preservePromptTailTokens?: number;
  growthLedger?: HolographicEtchConfig['growthLedger'];
}

export interface LowMemoryMCOPProfile {
  readonly encoderConfig: NovaNeoConfig;
  readonly stigmergyConfig: StigmergyConfig;
  readonly etchConfig: HolographicEtchConfig;
  readonly settings: Required<Omit<LowMemoryMCOPModeConfig, 'growthLedger'>> & {
    growthLedger: HolographicEtchConfig['growthLedger'];
  };
  readonly estimatedTraceBytes: number;
  readonly estimatedTraceKilobytes: number;
}

export interface LowMemoryTriad {
  encoder: NovaNeoEncoder;
  stigmergy: StigmergyV5;
  etch: HolographicEtch;
  profile: LowMemoryMCOPProfile;
  getTracer(): SynthesisProvenanceTracer;
}

export interface LowMemoryApplyTarget {
  configureLowMemory?: (profile: LowMemoryMCOPProfile) => void;
}

export interface LowMemoryApplyResult extends LowMemoryTriad {
  appliedToTarget: boolean;
}

const DEFAULTS = {
  maxTraces: 256,
  tensorDim: 32,
  useTypedArrays: true,
  resonanceEarlyExit: true,
  provenanceLazy: true,
  growthBias: 0.15,
  resonanceThreshold: 0.3,
  confidenceFloor: 0.65,
  maxEtches: 512,
  encoderBackend: 'novaNeoWeb' as NonNullable<NovaNeoConfig['backend']>,
  normalize: true,
  promptTokenBudget: 4096,
  preservePromptHeadTokens: 768,
  preservePromptTailTokens: 768,
  growthLedger: undefined as HolographicEtchConfig['growthLedger'],
};

/**
 * LowMemoryMCOPMode is an additive factory/pruning layer for high-capability
 * model routing. It preserves canonical MCOP array-based provenance while
 * exposing compact Float32Array views and low-memory component defaults.
 */
export class LowMemoryMCOPMode {
  private readonly baseConfig: LowMemoryMCOPModeConfig;

  constructor(config: LowMemoryMCOPModeConfig = {}) {
    this.baseConfig = config;
  }

  buildProfile(overrides: LowMemoryMCOPModeConfig = {}): LowMemoryMCOPProfile {
    const settings = normalizeConfig({ ...this.baseConfig, ...overrides });
    const encoderConfig: NovaNeoConfig = {
      dimensions: settings.tensorDim,
      normalize: settings.normalize,
      backend: settings.encoderBackend,
      selfHealDimensions: true,
    };
    const stigmergyConfig: StigmergyConfig = {
      maxTraces: settings.maxTraces,
      resonanceThreshold: settings.resonanceThreshold,
      growthBias: settings.growthBias,
    };
    const etchConfig: HolographicEtchConfig = {
      confidenceFloor: settings.confidenceFloor,
      maxEtches: settings.maxEtches,
      growthLedger: settings.growthLedger,
    };
    const bytesPerScalar = settings.useTypedArrays ? Float32Array.BYTES_PER_ELEMENT : 8;
    const estimatedTraceBytes = settings.maxTraces * settings.tensorDim * bytesPerScalar;
    return {
      encoderConfig,
      stigmergyConfig,
      etchConfig,
      settings,
      estimatedTraceBytes,
      estimatedTraceKilobytes: Math.round((estimatedTraceBytes / 1024) * 10) / 10,
    };
  }

  createTriad(overrides: LowMemoryMCOPModeConfig = {}): LowMemoryTriad {
    const profile = this.buildProfile(overrides);
    const encoder = new NovaNeoEncoder(profile.encoderConfig);
    const stigmergy = new StigmergyV5(profile.stigmergyConfig);
    const etch = new HolographicEtch(profile.etchConfig);
    let tracer: SynthesisProvenanceTracer | undefined = profile.settings.provenanceLazy
      ? undefined
      : new SynthesisProvenanceTracer(encoder, stigmergy, etch);
    return {
      encoder,
      stigmergy,
      etch,
      profile,
      getTracer() {
        tracer ??= new SynthesisProvenanceTracer(encoder, stigmergy, etch);
        return tracer;
      },
    };
  }

  apply(
    overrides: LowMemoryMCOPModeConfig = {},
    target?: LowMemoryApplyTarget,
  ): LowMemoryApplyResult {
    const triad = this.createTriad(overrides);
    target?.configureLowMemory?.(triad.profile);
    return { ...triad, appliedToTarget: typeof target?.configureLowMemory === 'function' };
  }

  encodeCompact(text: string, overrides: LowMemoryMCOPModeConfig = {}): Float32Array | number[] {
    const profile = this.buildProfile(overrides);
    const encoded = new NovaNeoEncoder(profile.encoderConfig).encode(text);
    return profile.settings.useTypedArrays ? Float32Array.from(encoded) : encoded;
  }

  toCanonicalTensor(tensor: ArrayLike<number>): number[] {
    return Array.from(tensor);
  }

  prunePrompt(prompt: string, overrides: LowMemoryMCOPModeConfig = {}): string {
    const profile = this.buildProfile(overrides);
    if (!profile.settings.resonanceEarlyExit) return prompt;
    return pruneToTokenBudget(
      prompt,
      profile.settings.promptTokenBudget,
      profile.settings.preservePromptHeadTokens,
      profile.settings.preservePromptTailTokens,
    );
  }
}

export const GROK_4_3_LOW_MEMORY_MCOP_PRESET: Required<
  Omit<LowMemoryMCOPModeConfig, 'growthLedger'>
> = {
  maxTraces: DEFAULTS.maxTraces,
  tensorDim: DEFAULTS.tensorDim,
  useTypedArrays: DEFAULTS.useTypedArrays,
  resonanceEarlyExit: DEFAULTS.resonanceEarlyExit,
  provenanceLazy: DEFAULTS.provenanceLazy,
  growthBias: DEFAULTS.growthBias,
  resonanceThreshold: DEFAULTS.resonanceThreshold,
  confidenceFloor: DEFAULTS.confidenceFloor,
  maxEtches: DEFAULTS.maxEtches,
  encoderBackend: DEFAULTS.encoderBackend,
  normalize: DEFAULTS.normalize,
  promptTokenBudget: DEFAULTS.promptTokenBudget,
  preservePromptHeadTokens: DEFAULTS.preservePromptHeadTokens,
  preservePromptTailTokens: DEFAULTS.preservePromptTailTokens,
};

function normalizeConfig(config: LowMemoryMCOPModeConfig): LowMemoryMCOPProfile['settings'] {
  const merged = { ...DEFAULTS, ...config };
  const promptTokenBudget = positiveInt(merged.promptTokenBudget, DEFAULTS.promptTokenBudget);
  const head = Math.min(
    positiveInt(merged.preservePromptHeadTokens, DEFAULTS.preservePromptHeadTokens),
    promptTokenBudget,
  );
  const tail = Math.min(
    positiveInt(merged.preservePromptTailTokens, DEFAULTS.preservePromptTailTokens),
    Math.max(0, promptTokenBudget - head),
  );
  return {
    maxTraces: positiveInt(merged.maxTraces, DEFAULTS.maxTraces),
    tensorDim: positiveInt(merged.tensorDim, DEFAULTS.tensorDim),
    useTypedArrays: merged.useTypedArrays ?? DEFAULTS.useTypedArrays,
    resonanceEarlyExit: merged.resonanceEarlyExit ?? DEFAULTS.resonanceEarlyExit,
    provenanceLazy: merged.provenanceLazy ?? DEFAULTS.provenanceLazy,
    growthBias: clamp01(merged.growthBias ?? DEFAULTS.growthBias),
    resonanceThreshold: clamp01(merged.resonanceThreshold ?? DEFAULTS.resonanceThreshold),
    confidenceFloor: clamp01(merged.confidenceFloor ?? DEFAULTS.confidenceFloor),
    maxEtches: positiveInt(merged.maxEtches, DEFAULTS.maxEtches),
    encoderBackend: merged.encoderBackend ?? DEFAULTS.encoderBackend,
    normalize: merged.normalize ?? DEFAULTS.normalize,
    promptTokenBudget,
    preservePromptHeadTokens: head,
    preservePromptTailTokens: tail,
    growthLedger: merged.growthLedger,
  };
}

function pruneToTokenBudget(
  prompt: string,
  budget: number,
  preserveHead: number,
  preserveTail: number,
): string {
  const tokens = prompt.trim().split(/\s+/u).filter(Boolean);
  if (tokens.length <= budget) return prompt;
  const head = tokens.slice(0, preserveHead);
  const tail = tokens.slice(tokens.length - preserveTail);
  const omitted = tokens.length - head.length - tail.length;
  return [
    ...head,
    `[mcop-low-memory-pruned:${omitted}-tokens]`,
    ...tail,
  ].join(' ');
}

function positiveInt(value: number | undefined, fallback: number): number {
  return Number.isInteger(value) && value !== undefined && value > 0 ? value : fallback;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}
