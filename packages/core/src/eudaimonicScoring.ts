import { canonicalDigest } from './canonicalEncoding';

export interface ScoreDefinition {
  id: string;
  parentId?: string;
  createdAt: string;
  createdBy: string;
  spec: Record<string, unknown>;
  signature?: string;
  hash: string;
}

export interface EpisodeScore {
  episodeId: string;
  scorerId: string;
  immediateScore: number;
  cumulativeScore: number;
  safetyViolation: boolean;
  humanApproved: boolean;
  timestamp: string;
}

export interface ScoreMetaEvaluation {
  scorerId: string;
  sampleSize: number;
  averageFlourishing: number;
  safetyViolationRate: number;
  humanApprovalRate: number;
  coherenceRate: number;
  timestamp: string;
  hash: string;
}

export interface ScorerSelectionResult {
  scorerId: string;
  score: number;
}

export class EudaimonicScoringLedger {
  private readonly scorers = new Map<string, ScoreDefinition>();
  private readonly episodes = new Map<string, EpisodeScore[]>();

  createScoreDefinition(input: Omit<ScoreDefinition, 'hash'>): ScoreDefinition {
    const hash = canonicalDigest(input);
    const definition: ScoreDefinition = { ...input, hash };
    this.scorers.set(definition.id, definition);
    return definition;
  }

  recordEpisodeScore(record: EpisodeScore): void {
    const batch = this.episodes.get(record.scorerId) ?? [];
    batch.push(record);
    this.episodes.set(record.scorerId, batch);
  }

  evaluateScorer(scorerId: string): ScoreMetaEvaluation | undefined {
    const records = this.episodes.get(scorerId);
    if (!records || records.length === 0) return undefined;

    const sampleSize = records.length;
    const averageFlourishing = mean(records.map((r) => r.cumulativeScore));
    const safetyViolationRate = mean(records.map((r) => (r.safetyViolation ? 1 : 0)));
    const humanApprovalRate = mean(records.map((r) => (r.humanApproved ? 1 : 0)));
    const coherenceRate = clamp01(1 - safetyViolationRate * 0.7 + humanApprovalRate * 0.3);

    const materialized = {
      scorerId,
      sampleSize,
      averageFlourishing,
      safetyViolationRate,
      humanApprovalRate,
      coherenceRate,
      timestamp: new Date().toISOString(),
    };

    return {
      ...materialized,
      hash: canonicalDigest(materialized),
    };
  }

  selectBestScorer(minSamples = 3): ScorerSelectionResult | undefined {
    const candidates = Array.from(this.scorers.keys())
      .map((scorerId) => this.evaluateScorer(scorerId))
      .filter((evaluation): evaluation is ScoreMetaEvaluation => Boolean(evaluation))
      .filter((evaluation) => evaluation.sampleSize >= minSamples)
      .map((evaluation) => ({
        scorerId: evaluation.scorerId,
        score: evaluation.averageFlourishing * 0.6 +
          evaluation.humanApprovalRate * 0.25 +
          evaluation.coherenceRate * 0.15,
      }))
      .sort((a, b) => b.score - a.score);

    return candidates[0];
  }

  getScoreDefinition(scorerId: string): ScoreDefinition | undefined {
    return this.scorers.get(scorerId);
  }
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((acc, value) => acc + value, 0) / values.length;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
