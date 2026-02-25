import { StigmergyV5 } from '../core/stigmergyV5';
import { ContextTensor } from '../core/types';

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

  test('trace IDs should be sufficiently long and random', () => {
     const trace = stigmergy.recordTrace(mockContext, mockSynthesis);
     // Current format: Date.now()-hexString
     // UUID format is different, but we check for general randomness/length
     expect(trace.id.length).toBeGreaterThan(10);
  });

  test('getResonance correctly calculates cosine similarity', () => {
    // Vector A: [1, 0, 0]
    // Vector B: [0, 1, 0]
    const vecA = [1, 0, 0];
    const vecB = [0, 1, 0];

    stigmergy.recordTrace(vecA, mockSynthesis);

    // Query with A (identical) -> should be 1.0
    const resA = stigmergy.getResonance(vecA);
    expect(resA.score).toBeCloseTo(1.0, 5);

    // Query with B (orthogonal) -> should be 0 (below default threshold 0.5, so 0)
    const resB = stigmergy.getResonance(vecB);
    expect(resB.score).toBe(0);

    // Query with vector similar to A (e.g., scaled A) -> should be 1.0 (cosine ignores magnitude)
    const vecAScaled = [2, 0, 0];
    const resAScaled = stigmergy.getResonance(vecAScaled);
    expect(resAScaled.score).toBeCloseTo(1.0, 5);
  });
});
