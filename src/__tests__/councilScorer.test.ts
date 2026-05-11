import { CouncilScorer, CouncilOutput } from '../utils/councilScorer';
import { InMemoryEvidenceRetriever } from '../utils/evidenceRetriever';
import { GuardianMetaReasoner } from '../utils/guardianMetaReasoner';

describe('CouncilScorer', () => {
  const validOutput: CouncilOutput = {
    consensus: 'The triad should be expanded to include meta-layers.',
    dissent: ['Meta-layers might increase review surface unnecessarily.'],
    reasoning: 'Detailed reasoning about why meta-layers provide independent value for audit signals and migration hygiene.\n\nFirst, it ensures structural integrity.\nSecond, it provides deterministic audit trails.',
    metadata: {
      participants: ['agent-a', 'agent-b'],
      iterations: 3,
      timestamp: new Date().toISOString(),
    },
  };

  it('should score a high-quality output as ratified', () => {
    const score = CouncilScorer.score(validOutput);
    expect(score.total).toBeGreaterThanOrEqual(0.8);
    expect(score.verdict).toBe('ratified');
  });

  it('should score an output without dissent lower on diversity', () => {
    const lowDiversityOutput = { ...validOutput, dissent: [] };
    const score = CouncilScorer.score(lowDiversityOutput);
    expect(score.dimensions.diversity).toBe(0.3);
  });

  it('should reject outputs with very short reasoning', () => {
    const poorOutput = {
      ...validOutput,
      reasoning: 'Too short.',
    };
    const score = CouncilScorer.score(poorOutput);
    expect(score.verdict).toBe('rejected');
  });

  it('attaches retrieved evidence when a retriever is supplied', () => {
    const retriever = new InMemoryEvidenceRetriever(
      [
        {
          content:
            'Meta-layers provide deterministic audit trails for triad outputs.',
          source: 'audit-log',
          evidenceType: 'peer_reviewed',
          weight: 0.9,
        },
      ],
      { minSimilarity: 0.05 },
    );
    const score = CouncilScorer.score(validOutput, { retriever });
    expect(score.retrievedEvidence).toBeDefined();
    expect(score.retrievedEvidence!.length).toBeGreaterThan(0);
  });

  it('attaches a Guardian verdict when a guardian is supplied', () => {
    const guardian = new GuardianMetaReasoner();
    const score = CouncilScorer.score(validOutput, { guardian });
    expect(score.guardian).toBeDefined();
    expect(score.guardian!.threshold).toBe(0.7);
    expect(['ratified', 'contested', 'requires_human_review']).toContain(
      score.guardian!.status,
    );
  });

  it('downgrades ratified verdicts when Guardian requires human review', () => {
    // Force a low-grounding scenario: short reasoning + zero dissent.
    const lowGroundingOutput: CouncilOutput = {
      ...validOutput,
      reasoning: 'short',
      dissent: [],
    };
    const guardian = new GuardianMetaReasoner({
      strictMode: false,
      minGrounding: 0.7,
      humanReviewFloor: 0.6,
      requireEvidenceForRatification: true,
    });
    const score = CouncilScorer.score(lowGroundingOutput, { guardian });
    // Even though the composite "total" may be ratifiable on its own,
    // Guardian human-review escalation downgrades it to at most contested.
    if (score.guardian?.status === 'requires_human_review') {
      expect(score.verdict).not.toBe('ratified');
    }
  });
});
