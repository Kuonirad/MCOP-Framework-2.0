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