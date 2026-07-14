import {
  ensureTriad,
  recallFromTriad,
  recordIntoTriad,
} from '../integrations/triadHarness';
import {
  HolographicEtch,
  NovaNeoEncoder,
  StigmergyV5,
} from '../core';

describe('triadHarness', () => {
  it('ensureTriad lazily builds a default triad when none supplied', () => {
    const triad = ensureTriad();
    expect(triad.encoder).toBeInstanceOf(NovaNeoEncoder);
    expect(triad.stigmergy).toBeInstanceOf(StigmergyV5);
    expect(triad.etch).toBeInstanceOf(HolographicEtch);
  });

  it('ensureTriad threads through caller-supplied dimensions and threshold', () => {
    const triad = ensureTriad({
      encoderDimensions: 32,
      resonanceThreshold: 0.4,
      maxTraces: 64,
    });
    const tensor = triad.encoder.encode('alpha');
    expect(tensor.length).toBe(32);
  });

  it('ensureTriad returns the supplied triad verbatim when one is provided', () => {
    const supplied = ensureTriad();
    const triad = ensureTriad({ triad: supplied });
    expect(triad).toBe(supplied);
  });

  it('recordIntoTriad emits provenance with etchHash and merkleRoot populated', () => {
    const triad = ensureTriad();
    const result = recordIntoTriad(triad, 'positive resonance memory', { tag: 'demo' });
    expect(result.provenance.etchHash.length).toBeGreaterThan(0);
    expect(result.provenance.merkleRoot).toBeDefined();
    expect(result.provenance.auditable).toBe(true);
    expect(result.provenance.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(result.provenance.traceId).toBe(result.trace.id);
  });

  it('preserves an explicitly empty note instead of replacing it with the default', () => {
    const result = recordIntoTriad(ensureTriad(), 'empty note', undefined, '');
    expect(result.etch.note).toBe('');
  });

  it('recallFromTriad returns score=0 with no traces recorded', () => {
    const triad = ensureTriad();
    const { resonance } = recallFromTriad(triad, 'nothing recorded');
    expect(resonance.score).toBe(0);
    expect(resonance.trace).toBeUndefined();
  });

  it('recallFromTriad returns the matching trace once recorded above the threshold', () => {
    const triad = ensureTriad({ resonanceThreshold: 0.05 });
    recordIntoTriad(triad, 'the holographic etch is rank-1 and replayable');
    const { resonance } = recallFromTriad(triad, 'the holographic etch is rank-1 and replayable');
    expect(resonance.score).toBeGreaterThan(0);
    expect(resonance.trace).toBeDefined();
  });
});
