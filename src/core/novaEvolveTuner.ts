import { HolographicEtch } from './holographicEtch';
import { StigmergyV5 } from './stigmergyV5';
import { ContextTensor, EtchRecord, PheromoneTrace } from './types';
import { canonicalDigest } from './canonicalEncoding';
import { attachAcceleratorProvenance, CPUFallback, type Accelerator } from '../hardware';

export type ExplorationSchedule = 'linear' | 'exponential' | 'adaptive';

export interface NovaEvolveConfig {
  mutationTemperature: number;
  noveltyPressure: number;
  maxVariants: number;
  recallTopK: number;
  entropyThreshold: number;
  confidenceDecay: number;
  explorationSchedule: ExplorationSchedule;
}

export interface NovaEvolveTaskResult {
  accuracy?: number;
  novelty?: number;
  noveltyScore?: number;
  latencyMs?: number;
  entropy?: number;
  confidence?: number;
  merkleRoot?: string;
}

export type NumericNovaEvolveKnob = Exclude<keyof NovaEvolveConfig, 'explorationSchedule'>;

export interface NovaEvolveMetaProposal {
  knob: keyof NovaEvolveConfig;
  delta?: number;
  value?: NovaEvolveConfig[keyof NovaEvolveConfig];
  rationale: string;
}

export interface NovaEvolveMetaTuneContext {
  currentConfig: NovaEvolveConfig;
  recentResults: NovaEvolveTaskResult[];
  recentTraces: PheromoneTrace[];
  recentEtches: EtchRecord[];
  currentMetaDepth: number;
}

export interface NovaEvolveMetaDecision {
  accepted: boolean;
  oldConfig: NovaEvolveConfig;
  newConfig: NovaEvolveConfig;
  proposal: NovaEvolveMetaProposal;
  projectedGain: number;
  metaMerkleRoot: string;
  rationale: string;
  depth: number;
  traceHash?: string;
  etchHash?: string;
  timestamp: string;
  device: string;
  accelerator?: import('../hardware').AcceleratorProvenance;
}

export interface NovaEvolveTunerOptions {
  metaTuneInterval?: number;
  projectedGainThreshold?: number;
  maxMetaDepth?: number;
  dryRunHorizon?: number;
  metaMutationTemperature?: number;
  maxDelta?: number;
  proposalGenerator?: (
    context: NovaEvolveMetaTuneContext,
  ) => Promise<NovaEvolveMetaProposal | string> | NovaEvolveMetaProposal | string;
  now?: () => Date;
}

export interface NovaEvolveTunerDeps {
  stigmergy: StigmergyV5;
  etch: HolographicEtch;
  accelerator?: Accelerator;
}

export const DEFAULT_NOVA_EVOLVE_CONFIG: NovaEvolveConfig = Object.freeze({
  mutationTemperature: 0.85,
  noveltyPressure: 0.45,
  maxVariants: 5,
  recallTopK: 6,
  entropyThreshold: 0.68,
  confidenceDecay: 0.92,
  explorationSchedule: 'linear',
});

const NUMERIC_KNOBS: ReadonlySet<keyof NovaEvolveConfig> = new Set([
  'mutationTemperature',
  'noveltyPressure',
  'maxVariants',
  'recallTopK',
  'entropyThreshold',
  'confidenceDecay',
]);
const SCHEDULES: ReadonlySet<ExplorationSchedule> = new Set(['linear', 'exponential', 'adaptive']);

/**
 * NOVA-EVOLVE self-tuner.
 *
 * The tuner treats a NOVA-EVOLVE hyperparameter vector as an auditable genome:
 * every interval it proposes exactly one mutation, projects the gain against
 * recent Stigmergy/Holographic context, and records the meta-decision as a
 * Merkle-linked trace before optionally adopting the candidate config.
 */
export class NovaEvolveTuner {
  private config: NovaEvolveConfig;
  private taskCount = 0;
  private metaDepth = 0;
  private metaRoot: string | undefined;
  private readonly decisions: NovaEvolveMetaDecision[] = [];
  private readonly metaTuneInterval: number;
  private readonly projectedGainThreshold: number;
  private readonly maxMetaDepth: number;
  private readonly dryRunHorizon: number;
  private readonly metaMutationTemperature: number;
  private readonly maxDelta: number;
  private readonly proposalGenerator?: NovaEvolveTunerOptions['proposalGenerator'];
  private readonly now: () => Date;
  private readonly accelerator: Accelerator;

  constructor(
    private readonly deps: NovaEvolveTunerDeps,
    initialConfig: Partial<NovaEvolveConfig> = {},
    options: NovaEvolveTunerOptions = {},
  ) {
    this.config = normalizeConfig({ ...DEFAULT_NOVA_EVOLVE_CONFIG, ...initialConfig });
    this.metaTuneInterval = Math.max(1, Math.floor(options.metaTuneInterval ?? 5));
    this.projectedGainThreshold = clamp01(options.projectedGainThreshold ?? 0.04);
    this.maxMetaDepth = Math.max(0, Math.floor(options.maxMetaDepth ?? 2));
    this.dryRunHorizon = Math.max(1, Math.floor(options.dryRunHorizon ?? 4));
    this.metaMutationTemperature = clamp01(options.metaMutationTemperature ?? 0.65);
    this.maxDelta = clamp(options.maxDelta ?? 0.08, 0.001, 1);
    this.proposalGenerator = options.proposalGenerator;
    this.now = options.now ?? (() => new Date());
    this.accelerator = deps.accelerator ?? new CPUFallback();
  }

  async maybeMetaTune(recentResults: NovaEvolveTaskResult[] = []): Promise<NovaEvolveMetaDecision | null> {
    this.taskCount += 1;
    if (this.taskCount % this.metaTuneInterval !== 0) return null;

    const recentTraces = this.deps.stigmergy.getRecent(12);
    const recentEtches = this.deps.etch.recent(8);
    const context: NovaEvolveMetaTuneContext = {
      currentConfig: this.getCurrentConfig(),
      recentResults: recentResults.slice(-8),
      recentTraces,
      recentEtches,
      currentMetaDepth: this.metaDepth,
    };

    const rawProposal = this.metaDepth >= this.maxMetaDepth
      ? {
        knob: 'noveltyPressure' as const,
        delta: 0,
        rationale: 'Max meta-depth reached; preserving current NOVA-EVOLVE genome.',
      }
      : await this.generateProposal(context);
    const proposal = this.sanitizeProposal(rawProposal);
    const candidate = this.metaDepth >= this.maxMetaDepth
      ? this.getCurrentConfig()
      : this.applyProposal(this.config, proposal);
    const projectedGain = this.metaDepth >= this.maxMetaDepth
      ? 0
      : await this.dryRunProjection(candidate, context);
    const accepted = this.metaDepth < this.maxMetaDepth && projectedGain >= this.projectedGainThreshold;
    const depth = accepted ? this.metaDepth + 1 : this.metaDepth;

    const decision = this.commitDecision({
      accepted,
      oldConfig: this.getCurrentConfig(),
      newConfig: accepted ? candidate : this.getCurrentConfig(),
      proposal,
      projectedGain,
      rationale: proposal.rationale,
      depth,
    });

    if (accepted) {
      this.config = candidate;
      this.metaDepth = depth;
    }

    return decision;
  }

  getCurrentConfig(): NovaEvolveConfig {
    return { ...this.config };
  }

  getMetaDepth(): number {
    return this.metaDepth;
  }

  getMetaMerkleRoot(): string | undefined {
    return this.metaRoot;
  }

  getMetaDecisions(limit = this.decisions.length): NovaEvolveMetaDecision[] {
    const safeLimit = Math.max(0, Math.floor(limit));
    if (safeLimit === 0) return [];
    return this.decisions.slice(-safeLimit).reverse();
  }

  private async generateProposal(context: NovaEvolveMetaTuneContext): Promise<NovaEvolveMetaProposal | string> {
    if (this.proposalGenerator) return this.proposalGenerator(context);

    const averages = summarizeResults(context.recentResults);
    if (averages.entropy > 0.75 || averages.novelty < 0.35) {
      return {
        knob: 'mutationTemperature',
        delta: this.maxDelta * this.metaMutationTemperature,
        rationale: 'Raise mutation temperature for high-entropy or low-novelty task drift.',
      };
    }
    if (averages.confidence < 0.55 || averages.accuracy < 0.45) {
      return {
        knob: 'noveltyPressure',
        delta: -this.maxDelta * 0.5,
        rationale: 'Reduce novelty pressure while recent confidence/accuracy is weak.',
      };
    }
    return {
      knob: 'noveltyPressure',
      delta: this.maxDelta * 0.5,
      rationale: 'Nudge curiosity upward after stable recent outcomes.',
    };
  }

  private sanitizeProposal(raw: NovaEvolveMetaProposal | string): NovaEvolveMetaProposal {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) as NovaEvolveMetaProposal : raw;
    const knob = parsed.knob;
    if (!NUMERIC_KNOBS.has(knob) && knob !== 'explorationSchedule') {
      throw new Error(`Unsupported NOVA-EVOLVE knob: ${String(knob)}`);
    }
    const rationale = typeof parsed.rationale === 'string' && parsed.rationale.trim().length > 0
      ? parsed.rationale.trim()
      : 'No rationale supplied.';

    if (knob === 'explorationSchedule') {
      if (!SCHEDULES.has(parsed.value as ExplorationSchedule)) {
        throw new Error('explorationSchedule proposals must provide a supported schedule value.');
      }
      return { knob, value: parsed.value as ExplorationSchedule, rationale };
    }

    const delta = clamp(Number(parsed.delta ?? 0), -this.maxDelta, this.maxDelta);
    return { knob, delta, rationale };
  }

  private applyProposal(config: NovaEvolveConfig, proposal: NovaEvolveMetaProposal): NovaEvolveConfig {
    const next = { ...config };
    if (proposal.knob === 'explorationSchedule') {
      next.explorationSchedule = proposal.value as ExplorationSchedule;
      return normalizeConfig(next);
    }
    const knob = proposal.knob as NumericNovaEvolveKnob;
    next[knob] = Number(next[knob]) + Number(proposal.delta ?? 0);
    return normalizeConfig(next);
  }

  private async dryRunProjection(candidate: NovaEvolveConfig, context: NovaEvolveMetaTuneContext): Promise<number> {
    const baseline = scoreConfig(this.config, context);
    const candidateScore = scoreConfig(candidate, context);
    const localProjection = () => {
      let horizonWeightedGain = 0;
      for (let step = 0; step < this.dryRunHorizon; step += 1) {
        horizonWeightedGain += (candidateScore - baseline) * (1 - step * 0.08);
      }
      return Math.max(0, horizonWeightedGain / this.dryRunHorizon);
    };

    if (this.accelerator.mode === 'cpu') return localProjection();

    const accelerated = await this.accelerator.accelerate<{ projectedGain?: number }>('meta-dry-run', {
      currentConfig: this.config,
      candidate,
      context,
      baseline,
      candidateScore,
      dryRunHorizon: this.dryRunHorizon,
    });
    return typeof accelerated.projectedGain === 'number'
      ? Math.max(0, accelerated.projectedGain)
      : localProjection();
  }

  private commitDecision(input: Omit<NovaEvolveMetaDecision, 'metaMerkleRoot' | 'timestamp' | 'traceHash' | 'etchHash' | 'device' | 'accelerator'>): NovaEvolveMetaDecision {
    const timestamp = this.now().toISOString();
    const metaMerkleRoot = canonicalDigest({
      parentHash: this.metaRoot ?? null,
      type: 'NOVA_EVOLVE_META_TUNE',
      timestamp,
      input,
    });
    const contextVector = genomeVector(input.oldConfig);
    const synthesisVector = genomeVector(input.newConfig);
    const trace = this.deps.stigmergy.recordTrace(contextVector, synthesisVector, {
      type: 'NOVA_EVOLVE_META_TUNE',
      accepted: input.accepted,
      projectedGain: input.projectedGain,
      metaMerkleRoot,
      proposal: input.proposal,
      depth: input.depth,
      device: this.accelerator.device,
      acceleratorMode: this.accelerator.mode,
    });
    const decisionConfidence = clamp01(input.projectedGain / Math.max(this.projectedGainThreshold, 0.001));
    const etch = this.deps.etch.applyEtch(
      [decisionConfidence, decisionConfidence, decisionConfidence],
      [decisionConfidence, decisionConfidence, decisionConfidence],
      input.accepted ? 'nova-evolve-meta-tune-accepted' : 'nova-evolve-meta-tune-rejected',
    );
    const acceleratorSeal = attachAcceleratorProvenance(
      { metaMerkleRoot, projectedGain: input.projectedGain, traceHash: trace.hash, etchHash: etch.hash },
      {
        op: 'meta-dry-run',
        mode: this.accelerator.mode,
        device: this.accelerator.device,
        provider: 'NovaEvolveTuner',
        fallback: this.accelerator.mode === 'cpu',
        fallbackReason: this.accelerator.mode === 'cpu' ? 'local projection path' : undefined,
      },
    );
    this.metaRoot = metaMerkleRoot;
    const decision: NovaEvolveMetaDecision = {
      ...input,
      metaMerkleRoot,
      timestamp,
      device: this.accelerator.device,
      accelerator: acceleratorSeal._provenance,
      traceHash: trace.hash,
      etchHash: etch.hash,
    };
    this.decisions.push(decision);
    return decision;
  }
}

function normalizeConfig(config: NovaEvolveConfig): NovaEvolveConfig {
  return {
    mutationTemperature: clamp(config.mutationTemperature, 0.1, 0.98),
    noveltyPressure: clamp(config.noveltyPressure, 0.1, 0.98),
    maxVariants: Math.round(clamp(config.maxVariants, 1, 15)),
    recallTopK: Math.round(clamp(config.recallTopK, 1, 16)),
    entropyThreshold: clamp(config.entropyThreshold, 0.1, 0.98),
    confidenceDecay: clamp(config.confidenceDecay, 0.5, 0.99),
    explorationSchedule: SCHEDULES.has(config.explorationSchedule)
      ? config.explorationSchedule
      : DEFAULT_NOVA_EVOLVE_CONFIG.explorationSchedule,
  };
}

function summarizeResults(results: NovaEvolveTaskResult[]) {
  if (results.length === 0) {
    return { accuracy: 0.5, novelty: 0.5, latency: 10, entropy: 0.5, confidence: 0.7 };
  }
  return {
    accuracy: average(results.map((r) => r.accuracy ?? 0.5)),
    novelty: average(results.map((r) => r.noveltyScore ?? r.novelty ?? 0.5)),
    latency: average(results.map((r) => r.latencyMs ?? 10)),
    entropy: average(results.map((r) => r.entropy ?? 0.5)),
    confidence: average(results.map((r) => r.confidence ?? 0.7)),
  };
}

function scoreConfig(config: NovaEvolveConfig, context: NovaEvolveMetaTuneContext): number {
  const averages = summarizeResults(context.recentResults);
  const historicalCorrelation = inferNoveltyAccuracyCorrelation(context.recentTraces, context.recentEtches);
  const explorationFit = 1 - Math.abs(config.mutationTemperature - targetMutation(averages.entropy));
  const noveltyFit = 1 - Math.abs(config.noveltyPressure - targetNoveltyPressure(averages));
  const breadthFit = 1 - Math.abs(config.maxVariants - targetVariantCount(averages.latency)) / 15;
  const recallFit = 1 - Math.abs(config.recallTopK - 6) / 16;
  const entropyFit = 1 - Math.abs(config.entropyThreshold - 0.68);
  const decayFit = 1 - Math.abs(config.confidenceDecay - 0.92);
  const scheduleFit = config.explorationSchedule === (averages.entropy > 0.7 ? 'adaptive' : 'linear') ? 1 : 0.85;

  return clamp01((
    0.22 * clamp01(explorationFit) +
    0.24 * clamp01(noveltyFit) +
    0.16 * clamp01(breadthFit) +
    0.12 * clamp01(recallFit) +
    0.1 * clamp01(entropyFit) +
    0.08 * clamp01(decayFit) +
    0.08 * scheduleFit
  ) * historicalCorrelation);
}

function inferNoveltyAccuracyCorrelation(traces: PheromoneTrace[], etches: EtchRecord[]): number {
  const traceMean = traces.length === 0 ? 0.71 : average(traces.map((trace) => Math.max(0, trace.weight)));
  const etchMean = etches.length === 0 ? 0.71 : average(etches.map((etch) => Math.max(0, etch.deltaWeight)));
  return clamp(traceMean * 0.55 + etchMean * 0.45, 0.35, 0.95);
}

function genomeVector(config: NovaEvolveConfig): ContextTensor {
  return [
    config.mutationTemperature,
    config.noveltyPressure,
    config.maxVariants / 15,
    config.recallTopK / 16,
    config.entropyThreshold,
    config.confidenceDecay,
    config.explorationSchedule === 'linear' ? 0.33 : config.explorationSchedule === 'exponential' ? 0.66 : 1,
  ];
}

function targetMutation(entropy: number): number {
  if (entropy > 0.75) return 0.9;
  if (entropy < 0.4) return 0.78;
  return 0.85;
}

function targetNoveltyPressure(results: ReturnType<typeof summarizeResults>): number {
  if (results.entropy > 0.75) return 0.55;
  if (results.confidence < 0.55 || results.accuracy < 0.45) return 0.35;
  return 0.45;
}

function targetVariantCount(latencyMs: number): number {
  if (latencyMs > 12) return 4;
  if (latencyMs < 6) return 7;
  return 5;
}

function average(values: number[]): number {
  let sum = 0;
  let count = 0;
  for (const value of values) {
    if (!Number.isFinite(value)) continue;
    sum += value;
    count += 1;
  }
  return count === 0 ? 0 : sum / count;
}

function clamp01(x: number): number {
  return clamp(x, 0, 1);
}

function clamp(x: number, min: number, max: number): number {
  if (!Number.isFinite(x)) return min;
  if (x < min) return min;
  if (x > max) return max;
  return x;
}
