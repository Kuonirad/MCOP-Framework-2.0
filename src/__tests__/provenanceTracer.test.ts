import {
  HolographicEtch,
  NovaNeoEncoder,
  StigmergyV5,
  SynthesisProvenanceTracer,
} from '../core';

function freshTracer() {
  const encoder = new NovaNeoEncoder({ dimensions: 16, normalize: true });
  const stigmergy = new StigmergyV5({ resonanceThreshold: 0 });
  const etch = new HolographicEtch({ confidenceFloor: -1 });
  return new SynthesisProvenanceTracer(encoder, stigmergy, etch);
}

describe('SynthesisProvenanceTracer', () => {
  it('produces a Merkle-chained event log with four stages per synthesis', () => {
    const tracer = freshTracer();
    const result = tracer.synthesize('hello triad');
    const stages = result.events.map((e) => e.stage);
    expect(stages).toEqual(['encode', 'trace', 'etch', 'synthesize']);
    for (let i = 1; i < result.events.length; i++) {
      expect(result.events[i].parentHash).toBe(result.events[i - 1].hash);
    }
  });

  it('verify() returns ok for untampered chains', () => {
    const tracer = freshTracer();
    tracer.synthesize('alpha');
    tracer.synthesize('beta');
    expect(tracer.verify()).toEqual({ ok: true });
  });

  it('verify() detects tampering', () => {
    const tracer = freshTracer();
    tracer.synthesize('alpha');
    const events = tracer.getEvents();
    events[1].details.tampered = true;
    expect(tracer.verify().ok).toBe(false);
  });

  it('root advances after every synthesize call', () => {
    const tracer = freshTracer();
    const a = tracer.synthesize('one').root;
    const b = tracer.synthesize('two').root;
    expect(a).not.toBe(b);
    expect(tracer.getRoot()).toBe(b);
  });
});
