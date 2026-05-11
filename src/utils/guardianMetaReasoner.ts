/**
 * Guardian Meta-Reasoner — TypeScript surface.
 *
 * Extends the Guardian v0.1 calibration language into a real-time
 * grounding-index checker. Mirrors `mcop.guardian` (Python) so
 * front-end and Node-side consumers can audit
 * CouncilOutput / Hypothesis-shaped artefacts against a configurable
 * grounding threshold (minimum 0.70 in strict mode).
 *
 * Human primacy: the Guardian only flags. It never silently rewrites
 * an artefact. Below-floor artefacts surface as
 * `REQUIRES_HUMAN_REVIEW` so reviewers see them prominently.
 */

import type { CouncilOutput, CouncilScore } from './councilScorer';

/** The framework-wide minimum grounding threshold. Configurable above
 * this value, but going below requires `strictMode: false`. */
export const MIN_GROUNDING_FLOOR = 0.7 as const;

export type GuardianStatus =
  | 'ratified'
  | 'contested'
  | 'requires_human_review';

export interface GuardianConfig {
  minGrounding: number;
  humanReviewFloor: number;
  strictMode: boolean;
  requireEvidenceForRatification: boolean;
}

export const DEFAULT_GUARDIAN_CONFIG: GuardianConfig = {
  minGrounding: 0.7,
  humanReviewFloor: 0.5,
  strictMode: true,
  requireEvidenceForRatification: true,
};

export interface GuardianVerdict {
  status: GuardianStatus;
  groundingIndex: number;
  threshold: number;
  subjectId: string;
  subjectKind: 'hypothesis' | 'chain' | 'solution' | 'council';
  deficit: number;
  evidenceCount: number;
  requiresHumanReview: boolean;
  recommendations: string[];
  notes: string[];
  passed: boolean;
}

export interface GuardianSubject {
  id: string;
  groundingIndex: number;
  evidenceCount: number;
  kind?: GuardianVerdict['subjectKind'];
}

function validateConfig(config: GuardianConfig): void {
  if (config.strictMode && config.minGrounding < MIN_GROUNDING_FLOOR) {
    throw new Error(
      `GuardianConfig.minGrounding=${config.minGrounding} is below the ` +
        `strict-mode floor of ${MIN_GROUNDING_FLOOR}. Either raise the ` +
        `threshold or set strictMode: false explicitly.`,
    );
  }
  if (config.minGrounding < 0 || config.minGrounding > 1) {
    throw new Error('minGrounding must be in [0, 1]');
  }
  if (config.humanReviewFloor < 0 || config.humanReviewFloor > 1) {
    throw new Error('humanReviewFloor must be in [0, 1]');
  }
  if (config.humanReviewFloor > config.minGrounding) {
    throw new Error('humanReviewFloor cannot exceed minGrounding');
  }
}

export class GuardianMetaReasoner {
  readonly config: GuardianConfig;
  private _checks = 0;

  constructor(config: Partial<GuardianConfig> = {}) {
    this.config = { ...DEFAULT_GUARDIAN_CONFIG, ...config };
    validateConfig(this.config);
  }

  get checksPerformed(): number {
    return this._checks;
  }

  /**
   * Score one artefact against the configured grounding bar. Use the
   * `kind` discriminator to label the verdict for downstream UIs.
   */
  check(subject: GuardianSubject): GuardianVerdict {
    this._checks += 1;

    const grounding = clamp01(subject.groundingIndex);
    const evidenceCount = Math.max(0, subject.evidenceCount | 0);
    const threshold = this.config.minGrounding;
    const deficit = Math.max(0, threshold - grounding);

    let status: GuardianStatus;
    if (grounding >= threshold) {
      status = 'ratified';
    } else if (grounding >= this.config.humanReviewFloor) {
      status = 'contested';
    } else {
      status = 'requires_human_review';
    }

    const recommendations: string[] = [];
    const notes: string[] = [];

    if (status !== 'ratified') {
      recommendations.push(
        `Gather additional high-quality evidence to lift grounding above ${threshold.toFixed(2)}.`,
      );
    }
    if (evidenceCount < 2) {
      recommendations.push(
        'Diversify evidence sources — fewer than 2 items attached.',
      );
    }

    let requiresHumanReview = status === 'requires_human_review';
    if (this.config.requireEvidenceForRatification && evidenceCount === 0) {
      requiresHumanReview = true;
      status = 'requires_human_review';
      notes.push(
        'Subject carries no evidence — automated ratification declined.',
      );
      recommendations.push(
        'Attach at least one evidence item or invoke the evidence retriever.',
      );
    }

    return {
      status,
      groundingIndex: grounding,
      threshold,
      subjectId: subject.id,
      subjectKind: subject.kind ?? 'hypothesis',
      deficit,
      evidenceCount,
      requiresHumanReview,
      recommendations,
      notes,
      passed: status === 'ratified',
    };
  }

  /**
   * Adapter for CouncilOutput / CouncilScore artefacts: synthesises a
   * GuardianSubject from the scorer dimensions and runs the same
   * grounding check.
   */
  checkCouncil(
    output: CouncilOutput,
    score: CouncilScore,
    options: { id?: string; evidenceCount?: number } = {},
  ): GuardianVerdict {
    const id =
      options.id ??
      `council:${output.metadata.timestamp || 'unknown'}`;
    const evidenceCount =
      options.evidenceCount ?? (output.dissent?.length ?? 0) + 1;
    return this.check({
      id,
      groundingIndex: score.dimensions.grounding,
      evidenceCount,
      kind: 'council',
    });
  }
}

function clamp01(v: number): number {
  if (Number.isNaN(v)) return 0;
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}
