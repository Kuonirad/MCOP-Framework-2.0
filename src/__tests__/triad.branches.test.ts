import { HolographicEtch } from '../core/holographicEtch';
import { NovaNeoEncoder } from '../core/novaNeoEncoder';
import { StigmergyV5 } from '../core/stigmergyV5';
import logger from '../utils/logger';

describe('Triad branch coverage', () => {
  it('HolographicEtch skips etch when confidence below floor', () => {
    const etch = new HolographicEtch({ confidenceFloor: 0.9 });
    const context = [0.01, 0.01, 0.01, 0.01];
    const synthesis = [0.01, 0.01, 0.01, 0.01];

    const record = etch.applyEtch(context, synthesis, 'low-confidence');

    expect(record.hash).toBe('');
    expect(record.deltaWeight).toBe(0);
    expect(record.note).toBe('skipped-low-confidence');
    expect(etch.recent()).toHaveLength(0);
  });

  it('NovaNeoEncoder throws when constructed with non-positive dimensions', () => {
    expect(() => new NovaNeoEncoder({ dimensions: 0 })).toThrow(/dimensions/);
    expect(() => new NovaNeoEncoder({ dimensions: -1 })).toThrow(/dimensions/);
  });

  it('NovaNeoEncoder emits debug provenance when debug level is enabled', () => {
    const originalLevel = logger.level;
    logger.level = 'debug';
    const debugSpy = jest.spyOn(logger, 'debug').mockImplementation(() => {});

    try {
      const encoder = new NovaNeoEncoder({ dimensions: 8 });
      encoder.encode('debug-provenance');

      expect(debugSpy).toHaveBeenCalled();
      const firstCall = debugSpy.mock.calls[0][0] as { msg: string; provenance: { dimensions: number } };
      expect(firstCall.msg).toMatch(/NOVA-NEO/);
      expect(firstCall.provenance.dimensions).toBe(8);
    } finally {
      debugSpy.mockRestore();
      logger.level = originalLevel;
    }
  });

  it('StigmergyV5 evicts the oldest trace when maxTraces is exceeded', () => {
    const stigmergy = new StigmergyV5({ maxTraces: 2 });
    const a = stigmergy.recordTrace([1, 0, 0], [1, 0, 0]);
    const b = stigmergy.recordTrace([0, 1, 0], [0, 1, 0]);
    const c = stigmergy.recordTrace([0, 0, 1], [0, 0, 1]);

    const recent = stigmergy.getRecent(10);
    const ids = recent.map((t) => t.id);

    expect(recent).toHaveLength(2);
    expect(ids).toEqual([c.id, b.id]);
    expect(ids).not.toContain(a.id);
  });

  it('StigmergyV5 returns a zero-score fallback when no trace clears the resonance threshold', () => {
    const stigmergy = new StigmergyV5({ resonanceThreshold: 0.99 });
    stigmergy.recordTrace([1, 0, 0], [1, 0, 0]);

    const resonance = stigmergy.getResonance([0, 1, 0]);

    expect(resonance.score).toBe(0);
    expect(resonance.trace).toBeUndefined();
  });
});
