/**
 * Council Scorer — Scores VirtualCouncil outputs against quality dimensions.
 *
 * This utility evaluates the output of the VirtualCouncil (the collective
 * reasoning layer) based on multiple dimensions: coherence, grounding,
 * and diversity of thought.
 */

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
}

export class CouncilScorer {
  /**
   * Scores a VirtualCouncil output.
   * Grounding is currently a placeholder for future semantic similarity checks.
   * Coherence is estimated based on reasoning depth.
   * Diversity is scored based on the presence and variety of dissent.
   */
  static score(output: CouncilOutput): CouncilScore {
    const grounding = this.calculateGrounding(output);
    const coherence = this.calculateCoherence(output);
    const diversity = this.calculateDiversity(output);

    const total = (grounding * 0.4 + coherence * 0.4 + diversity * 0.2);

    let verdict: CouncilScore['verdict'] = 'rejected';
    if (total >= 0.8) verdict = 'ratified';
    else if (total >= 0.5) verdict = 'contested';

    return {
      total,
      dimensions: { grounding, coherence, diversity },
      verdict,
    };
  }

  private static calculateGrounding(output: CouncilOutput): number {
    // Placeholder: In a real implementation, this would use the NOVA-NEO
    // encoder to check resonance with the input context.
    return output.reasoning.length > 50 ? 0.9 : 0.5;
  }

  private static calculateCoherence(output: CouncilOutput): number {
    // Basic heuristic: check for structured reasoning sections.
    const hasStructure = output.reasoning.includes('\n') && output.reasoning.length > 50;
    return hasStructure ? 0.85 : 0.4;
  }

  private static calculateDiversity(output: CouncilOutput): number {
    if (!output.dissent || output.dissent.length === 0) return 0.3;
    // Score based on number of unique dissenting points.
    return Math.min(1.0, 0.3 + (output.dissent.length * 0.2));
  }
}
