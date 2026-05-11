/**
 * Council Scorer — Scores VirtualCouncil outputs against quality dimensions.
 *
 * This utility evaluates the output of the VirtualCouncil (the collective
 * reasoning layer) based on multiple dimensions: coherence, grounding,
 * and diversity of thought.
 *
 * Grounding can now be lifted by automated evidence retrieval and
 * audited by the Guardian meta-reasoner against a configurable
 * threshold (minimum 0.70 in strict mode).
 */

import type {
  EvidenceRetriever,
  RetrievalResult,
} from './evidenceRetriever';
import type { GuardianVerdict } from './guardianMetaReasoner';
import { GuardianMetaReasoner } from './guardianMetaReasoner';

export interface CouncilOutput {
  consensus: string;
  dissent?: string[];
  reasoning: string;
  metadata: {
    participants: string[];
    iterations: number;
    timestamp: string;
  };
}

export interface ScoreDimensions {
  /** How well the consensus integrates the provided context. */
  grounding: number;
  /** Logical consistency and clarity of the reasoning. */
  coherence: number;
  /** Representation of diverse perspectives (dissenting views). */
  diversity: number;
}

export interface CouncilScore {
  total: number;
  dimensions: ScoreDimensions;
  verdict: 'ratified' | 'contested' | 'rejected';
  /** Optional Guardian audit verdict — present iff a guardian is supplied. */
  guardian?: GuardianVerdict;
  /** Evidence retrieved while scoring — present iff a retriever is supplied. */
  retrievedEvidence?: RetrievalResult[];
}

export interface CouncilScoreOptions {
  retriever?: EvidenceRetriever;
  guardian?: GuardianMetaReasoner;
  /** Override the ratification threshold for the composite total score. */
  ratifyThreshold?: number;
  /** Override the contested threshold for the composite total score. */
  contestThreshold?: number;
}

const DEFAULT_RATIFY_THRESHOLD = 0.8;
const DEFAULT_CONTEST_THRESHOLD = 0.5;

export class CouncilScorer {
  /**
   * Scores a VirtualCouncil output.
   *
   * When `options.retriever` is supplied, the scorer asks for evidence
   * relevant to the council reasoning and lifts the grounding dimension
   * based on retrieved similarity. When `options.guardian` is supplied,
   * the scorer also returns a Guardian verdict against the configured
   * grounding threshold (minimum 0.70 in strict mode).
   */
  static score(
    output: CouncilOutput,
    options: CouncilScoreOptions = {},
  ): CouncilScore {
    const retrieved = options.retriever
      ? options.retriever.retrieve(
          `${output.consensus}\n${output.reasoning}`,
        )
      : undefined;

    const grounding = this.calculateGrounding(output, retrieved);
    const coherence = this.calculateCoherence(output);
    const diversity = this.calculateDiversity(output);

    const total = grounding * 0.4 + coherence * 0.4 + diversity * 0.2;

    const ratify = options.ratifyThreshold ?? DEFAULT_RATIFY_THRESHOLD;
    const contest = options.contestThreshold ?? DEFAULT_CONTEST_THRESHOLD;

    let verdict: CouncilScore['verdict'] = 'rejected';
    if (total >= ratify) verdict = 'ratified';
    else if (total >= contest) verdict = 'contested';

    const score: CouncilScore = {
      total,
      dimensions: { grounding, coherence, diversity },
      verdict,
    };

    if (retrieved) score.retrievedEvidence = retrieved;

    if (options.guardian) {
      score.guardian = options.guardian.checkCouncil(output, score, {
        evidenceCount:
          (retrieved?.length ?? 0) + (output.dissent?.length ?? 0) + 1,
      });
      // Human primacy: when the Guardian flags REQUIRES_HUMAN_REVIEW we
      // downgrade the verdict regardless of the composite total, so the
      // verdict surface never silently ratifies a below-floor artefact.
      if (score.guardian.status === 'requires_human_review' && verdict === 'ratified') {
        score.verdict = 'contested';
      }
    }

    return score;
  }

  private static calculateGrounding(
    output: CouncilOutput,
    retrieved?: RetrievalResult[],
  ): number {
    // Base heuristic: longer reasoning → more grounded.
    const baseline = output.reasoning.length > 50 ? 0.9 : 0.5;

    if (!retrieved || retrieved.length === 0) {
      return baseline;
    }

    // Lift grounding by the average top-K similarity, capped so noisy
    // retrievals can't push past 1.0 deterministically.
    const avgSim =
      retrieved.reduce((acc, r) => acc + r.similarity, 0) / retrieved.length;
    return Math.min(1, baseline * 0.7 + avgSim * 0.3 + 0.05 * retrieved.length);
  }

  private static calculateCoherence(output: CouncilOutput): number {
    // Basic heuristic: check for structured reasoning sections.
    const hasStructure =
      output.reasoning.includes('\n') && output.reasoning.length > 50;
    return hasStructure ? 0.85 : 0.4;
  }

  private static calculateDiversity(output: CouncilOutput): number {
    if (!output.dissent || output.dissent.length === 0) return 0.3;
    // Score based on number of unique dissenting points.
    return Math.min(1.0, 0.3 + output.dissent.length * 0.2);
  }
}
