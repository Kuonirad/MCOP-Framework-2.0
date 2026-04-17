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

  it('HolographicEtch.recent returns the correct number of recent etches in reverse order', () => {
    const etch = new HolographicEtch({ confidenceFloor: 0 });
    const context = [1, 1];
    const synthesis = [1, 1];

    // Generate 7 etches
    for (let i = 0; i < 7; i++) {
      etch.applyEtch(context, synthesis, `note-${i}`);
    }

    // Default limit is 5
    const recentDefault = etch.recent();
    expect(recentDefault).toHaveLength(5);
    expect(recentDefault[0].note).toBe('note-6');
    expect(recentDefault[4].note).toBe('note-2');

    // Specific limit
    const recentThree = etch.recent(3);
    expect(recentThree).toHaveLength(3);
    expect(recentThree[0].note).toBe('note-6');
    expect(recentThree[2].note).toBe('note-4');

    // Limit larger than array size
    const recentAll = etch.recent(10);
    expect(recentAll).toHaveLength(7);
    expect(recentAll[0].note).toBe('note-6');
    expect(recentAll[6].note).toBe('note-0');

    // Zero limit
    const recentZero = etch.recent(0);
    expect(recentZero).toHaveLength(0);
  });

  it('HolographicEtch skips low confidence etches and returns unhashed record', () => {
    const etch = new HolographicEtch({ confidenceFloor: 0.8 });
    const context = [0.1, 0.1];
    const synthesis = [0.1, 0.1];

    const record = etch.applyEtch(context, synthesis, 'low-confidence-test');
    expect(record.hash).toBe('');
    expect(record.deltaWeight).toBe(0);
    expect(record.note).toBe('skipped-low-confidence');

    // Make sure it wasn't added to the etches array
    const recent = etch.recent();
    expect(recent).toHaveLength(0);
  });

  it('HolographicEtch config handles empty object edge case', () => {
    const etch = new HolographicEtch();
    const context = [1, 1];
    const synthesis = [1, 1];

    const record = etch.applyEtch(context, synthesis, 'default-config-test');
    expect(record.hash).toBeTruthy();
  });

  it('HolographicEtch handles empty arrays appropriately', () => {
    const etch = new HolographicEtch({ confidenceFloor: 0 });
    const context: number[] = [];
    const synthesis: number[] = [];

    const record = etch.applyEtch(context, synthesis, 'empty-array-test');
    expect(record.hash).toBeTruthy();
  });
});
