import {
  GuardianMetaReasoner,
  MIN_GROUNDING_FLOOR,
} from '../utils/guardianMetaReasoner';

describe('GuardianMetaReasoner — configuration', () => {
  it('exposes the framework-wide minimum grounding floor', () => {
    expect(MIN_GROUNDING_FLOOR).toBe(0.7);
  });

  it('rejects sub-floor thresholds in strict mode', () => {
    expect(
      () => new GuardianMetaReasoner({ minGrounding: 0.5, strictMode: true }),
    ).toThrow(/strict-mode floor/);
  });

  it('accepts threshold exactly at the floor in strict mode', () => {
    expect(
      () =>
        new GuardianMetaReasoner({
          minGrounding: MIN_GROUNDING_FLOOR,
          strictMode: true,
        }),
    ).not.toThrow();
  });

  it('accepts sub-floor thresholds when strictMode is false', () => {
    expect(
      () =>
        new GuardianMetaReasoner({
          minGrounding: 0.4,
          humanReviewFloor: 0.2,
          strictMode: false,
        }),
    ).not.toThrow();
  });

  it('rejects humanReviewFloor > minGrounding', () => {
    expect(
      () =>
        new GuardianMetaReasoner({
          minGrounding: 0.7,
          humanReviewFloor: 0.8,
        }),
    ).toThrow();
  });
});

describe('GuardianMetaReasoner — verdicts', () => {
  it('ratifies subjects at or above the threshold', () => {
    const g = new GuardianMetaReasoner();
    const verdict = g.check({ id: 'x', groundingIndex: 0.85, evidenceCount: 3 });
    expect(verdict.status).toBe('ratified');
    expect(verdict.passed).toBe(true);
    expect(verdict.deficit).toBe(0);
    expect(verdict.requiresHumanReview).toBe(false);
  });

  it('marks subjects between humanReviewFloor and threshold as contested', () => {
    const g = new GuardianMetaReasoner();
    const verdict = g.check({ id: 'x', groundingIndex: 0.55, evidenceCount: 2 });
    expect(verdict.status).toBe('contested');
    expect(verdict.passed).toBe(false);
    expect(verdict.recommendations.length).toBeGreaterThan(0);
  });

  it('escalates subjects below humanReviewFloor', () => {
    const g = new GuardianMetaReasoner();
    const verdict = g.check({ id: 'x', groundingIndex: 0.1, evidenceCount: 1 });
    expect(verdict.status).toBe('requires_human_review');
    expect(verdict.requiresHumanReview).toBe(true);
  });

  it('escalates zero-evidence subjects even at very high grounding', () => {
    const g = new GuardianMetaReasoner();
    const verdict = g.check({ id: 'x', groundingIndex: 0.99, evidenceCount: 0 });
    expect(verdict.requiresHumanReview).toBe(true);
    expect(verdict.status).toBe('requires_human_review');
  });

  it('counts the number of checks performed', () => {
    const g = new GuardianMetaReasoner();
    expect(g.checksPerformed).toBe(0);
    g.check({ id: 'a', groundingIndex: 0.9, evidenceCount: 2 });
    g.check({ id: 'b', groundingIndex: 0.4, evidenceCount: 2 });
    expect(g.checksPerformed).toBe(2);
  });
});
