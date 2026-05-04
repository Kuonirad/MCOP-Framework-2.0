import {
  configureTriadTelemetry,
  HolographicEtch,
  NovaNeoEncoder,
  StigmergyV5,
  SynthesisProvenanceTracer,
  TriadSpanSnapshot,
} from '../core';

afterEach(() => {
  configureTriadTelemetry();
});

describe('Triad observability', () => {
  it('emits deterministic span metadata for the core synthesis path', () => {
    const spans: TriadSpanSnapshot[] = [];
    configureTriadTelemetry((span) => spans.push(span));

    const tracer = new SynthesisProvenanceTracer(
      new NovaNeoEncoder({ dimensions: 8, normalize: true }),
      new StigmergyV5({ resonanceThreshold: 0 }),
      new HolographicEtch({ confidenceFloor: -1 }),
    );

    const result = tracer.synthesize('observability audit', { note: 'otel' });

    expect(result.root).toBeTruthy();
    expect(spans.map((span) => span.name)).toEqual([
      'mcop.triad.encode',
      'mcop.triad.trace.record',
      'mcop.triad.resonance.query',
      'mcop.triad.etch.apply',
      'mcop.triad.synthesize',
    ]);

    for (const span of spans) {
      expect(span.status).toBe('ok');
      expect(span.startedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(span.durationMs).toBeGreaterThanOrEqual(0);
    }

    expect(spans[0].attributes['mcop.encoder.backend']).toBe('hash');
    expect(spans[0].attributes['mcop.tensor.dimensions']).toBe(8);
    expect(spans[1].attributes['mcop.trace.has_metadata']).toBe(true);
    expect(spans[2].attributes['mcop.resonance.matched']).toBe(true);
    expect(spans[3].attributes['mcop.etch.accepted']).toBe(true);
    expect(spans[4].attributes['mcop.etch.delta_weight']).toBe(result.etchDelta);
  });

  it('keeps triad execution isolated from telemetry observer failures', () => {
    configureTriadTelemetry(() => {
      throw new Error('collector unavailable');
    });

    const encoder = new NovaNeoEncoder({ dimensions: 4, normalize: true });

    expect(() => encoder.encode('collector outage')).not.toThrow();
    expect(encoder.encode('collector outage')).toHaveLength(4);
  });

  it('emits skipped-etch attributes without committing rejected records', () => {
    const spans: TriadSpanSnapshot[] = [];
    configureTriadTelemetry((span) => spans.push(span));

    const etch = new HolographicEtch({ confidenceFloor: 1, auditLog: true });
    const record = etch.applyEtch([1, 0], [0, 1], 'reject');

    expect(record.hash).toBe('');
    expect(etch.recent()).toEqual([]);
    expect(etch.recentAudit(1)[0].note).toBe('skipped-low-confidence');
    expect(spans).toHaveLength(1);
    expect(spans[0].name).toBe('mcop.triad.etch.apply');
    expect(spans[0].attributes['mcop.etch.accepted']).toBe(false);
  });
});
