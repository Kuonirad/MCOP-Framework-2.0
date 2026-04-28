import { CouncilScorer, CouncilOutput } from '../utils/councilScorer';

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
});
