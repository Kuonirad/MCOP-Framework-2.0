import { HolographicEtch, NovaNeoEncoder, StigmergyV5 } from '../core';

describe('Triad seeds', () => {
  it('NOVA-NEO produces deterministic, normalized tensors', () => {
    const encoder = new NovaNeoEncoder({ dimensions: 8, normalize: true, entropyFloor: 0.05 });
    const first = encoder.encode('crystalline entropy');
    const second = encoder.encode('crystalline entropy');

    expect(first).toHaveLength(8);
    expect(second).toEqual(first);

    const magnitude = Math.sqrt(first.reduce((acc, v) => acc + v * v, 0));
    expect(magnitude).toBeCloseTo(1, 5);

    const entropy = encoder.estimateEntropy(first);
    expect(entropy).toBeGreaterThanOrEqual(0.05);
  });

  it('NOVA-NEO produces correct output when normalization is disabled', () => {
    const encoder = new NovaNeoEncoder({ dimensions: 8, normalize: false });
    const encoded = encoder.encode('raw entropy');

    expect(encoded).toHaveLength(8);
    // Magnitude should generally not be 1.0 when not normalized
    const magnitude = Math.sqrt(encoded.reduce((acc, v) => acc + v * v, 0));
    expect(magnitude).toBeGreaterThan(0);
  });

  it('Stigmergy v5 records traces and returns resonance above threshold', () => {
    const encoder = new NovaNeoEncoder({ dimensions: 8 });
    const stigmergy = new StigmergyV5({ resonanceThreshold: 0.2 });

    const context = encoder.encode('stigmergic memory');
    const trace = stigmergy.recordTrace(context, context, { note: 'bootstrap' });
    expect(trace.hash).toBeTruthy();

    const resonance = stigmergy.getResonance(context);
    expect(resonance.score).toBeGreaterThanOrEqual(0.2);
    expect(resonance.trace?.id).toEqual(trace.id);
    expect(stigmergy.getMerkleRoot()).toEqual(trace.hash);
  });

  it('Holographic Etch accumulates rank-1 deltas with auditability', () => {
    const etch = new HolographicEtch({ confidenceFloor: 0, auditLog: true });
    const context = [1, 0.5, -0.5, 0.2];
    const synthesis = [0.5, 0.5, 0.5, 0.5];

    const record = etch.applyEtch(context, synthesis, 'unit-test');
    expect(record.hash).toBeTruthy();
    expect(record.deltaWeight).toBeCloseTo(0.15, 3);
    expect(etch.recent(1)[0].hash).toEqual(record.hash);
  });
});
