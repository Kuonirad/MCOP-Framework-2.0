import { StigmergyV5 } from '../core/stigmergyV5';
import { ContextTensor } from '../core/types';
import { canonicalDigest } from '../core/canonicalEncoding';

describe('StigmergyV5 Security & Functionality', () => {
  let stigmergy: StigmergyV5;
  const mockContext: ContextTensor = [0.1, 0.2, 0.3];
  const mockSynthesis: number[] = [0.4, 0.5, 0.6];

  beforeEach(() => {
    stigmergy = new StigmergyV5();
  });

  test('generates unique IDs for traces', () => {
    const trace1 = stigmergy.recordTrace(mockContext, mockSynthesis);
    const trace2 = stigmergy.recordTrace(mockContext, mockSynthesis);

    expect(trace1.id).not.toBe(trace2.id);
    expect(typeof trace1.id).toBe('string');
  });

  test('trace IDs should follow UUID v4 format', () => {
     const trace = stigmergy.recordTrace(mockContext, mockSynthesis);
     const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
     expect(trace.id).toMatch(uuidRegex);
     // Current format uses crypto.randomUUID()
     // We check for general randomness/length
     expect(trace.id.length).toBeGreaterThan(10);
  });

  test('calibrates resonance threshold from recent trace distribution', () => {
    const adaptive = new StigmergyV5({
      resonanceThreshold: 0.9,
      hysteresisBand: 0,
      calibrationWindow: 8,
    });

    adaptive.recordTrace([1, 0], [1, 0]);
    adaptive.recordTrace([1, 0], [1, 0]);
    adaptive.recordTrace([0, 1], [1, 0]);

    const threshold = adaptive.getAdaptiveResonanceThreshold();
    expect(threshold).toBeGreaterThan(0);
    expect(threshold).toBeLessThan(0.9);
  });

  test('pads ragged vectors before resonance scoring', () => {
    const adaptive = new StigmergyV5({ resonanceThreshold: 0.1 });
    const trace = adaptive.recordTrace([1, 0], [1, 0, 0]);
    const resonance = adaptive.getResonance([1, 0, 0]);

    expect(trace.weight).toBeCloseTo(1);
    expect(resonance.trace?.id).toBe(trace.id);
  });
});
describe('ResonantRecentQuery', () => {
  it('ranks high-resonance traces while safely expanding low-resonance domains', () => {
    const stig = new StigmergyV5({ resonanceThreshold: 0.5, curiosityBonus: 0.2 });
    const aligned = stig.recordTrace([1, 0], [1, 0], { domain: 'proven' });
    stig.recordTrace([0, 1], [1, 0], { domain: 'curious' });

    const recent = stig.getResonantRecent(2, { context: [1, 0], includeLowResonance: true });

    expect(recent).toHaveLength(2);
    expect(recent[0].id).toBe(aligned.id);
    expect(recent[0].resonanceScore).toBeGreaterThanOrEqual(recent[1].resonanceScore);
    expect(recent[1].curiosityLift).toBeGreaterThan(0);
  });

  it('returns an empty resonant query for negative limits', () => {
    const stig = new StigmergyV5();
    stig.recordTrace([1, 0], [1, 0]);
    expect(stig.getResonantRecent(-5)).toEqual([]);
  });
});

describe('Dual-key traces (hash identity + semantic locality)', () => {
  test('semantic key is bound under the same canonical digest as the hash key', () => {
    const stig = new StigmergyV5();
    const trace = stig.recordTrace([1, 0], [1, 0], { domain: 'dual' }, {
      semanticContext: [0.2, 0.8],
    });

    const dualKeyDigest = canonicalDigest({
      payload: {
        id: trace.id,
        context: trace.context,
        synthesisVector: trace.synthesisVector,
        metadata: trace.metadata,
        weight: trace.weight,
        semanticContext: trace.semanticContext,
      },
      parentHash: null,
    });
    const singleKeyDigest = canonicalDigest({
      payload: {
        id: trace.id,
        context: trace.context,
        synthesisVector: trace.synthesisVector,
        metadata: trace.metadata,
        weight: trace.weight,
      },
      parentHash: null,
    });

    expect(trace.hash).toBe(dualKeyDigest);
    expect(trace.hash).not.toBe(singleKeyDigest);
    expect(trace.semanticMagnitude).toBeCloseTo(Math.hypot(0.2, 0.8), 12);
  });

  test('single-key traces keep their v5 digest byte-identical', () => {
    const stig = new StigmergyV5();
    const trace = stig.recordTrace([1, 0], [1, 0]);
    const v5Digest = canonicalDigest({
      payload: {
        id: trace.id,
        context: trace.context,
        synthesisVector: trace.synthesisVector,
        metadata: undefined,
        weight: trace.weight,
      },
      parentHash: null,
    });
    expect(trace.hash).toBe(v5Digest);
  });

  test('semantic and context keyspaces are orthogonal recall axes', () => {
    const stig = new StigmergyV5({ resonanceThreshold: 0.9, adaptiveThreshold: false });
    const hashKey = [1, 0, 0];
    const semanticKey = [0, 0.6, 0.8];
    const trace = stig.recordTrace(hashKey, hashKey, undefined, {
      semanticContext: semanticKey,
    });

    const semanticHit = stig.getResonance(semanticKey, { keyspace: 'semantic' });
    expect(semanticHit.trace?.id).toBe(trace.id);
    expect(semanticHit.score).toBeCloseTo(1, 9);

    // The semantic key must not resonate in the cryptographic keyspace…
    expect(stig.getResonance(semanticKey).trace).toBeUndefined();
    // …and the hash key still matches in its own keyspace.
    expect(stig.getResonance(hashKey).trace?.id).toBe(trace.id);
  });

  test('semantic queries skip traces sealed without a semantic key', () => {
    const stig = new StigmergyV5({ resonanceThreshold: 0.1, adaptiveThreshold: false });
    stig.recordTrace([1, 0], [1, 0]);
    const result = stig.getResonance([1, 0], { keyspace: 'semantic' });
    expect(result.trace).toBeUndefined();
    expect(result.score).toBe(0);
  });
});
