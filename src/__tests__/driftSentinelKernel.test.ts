import { DriftSentinelKernel } from '../core/driftSentinelKernel';

describe('DriftSentinelKernel', () => {
  it('returns a nominal event when T_d and B_e are aligned', () => {
    const kernel = new DriftSentinelKernel();
    const event = kernel.observe({
      declaredTask: [1, 0, 0, 0],
      ensembleBehavior: [[1, 0, 0, 0], [0.95, 0.05, 0, 0]],
    });
    expect(event.delta).toBeLessThan(0.1);
    expect(event.severity).toBe('nominal');
    expect(event.escalation.kind).toBe('none');
  });

  it('flags large divergence as critical and escalates to human review', () => {
    const kernel = new DriftSentinelKernel({ criticalCeiling: 0.4 });
    const event = kernel.observe({
      declaredTask: [1, 0, 0, 0],
      ensembleBehavior: [[-1, 0, 0, 0]],
    });
    expect(event.delta).toBeGreaterThanOrEqual(0.4);
    expect(event.severity).toBe('critical');
    expect(event.escalation.kind).toBe('human-review');
  });

  it('chains events with parentHash → hash Merkle linkage', () => {
    const kernel = new DriftSentinelKernel();
    const a = kernel.observe({
      declaredTask: [1, 0, 0, 0],
      ensembleBehavior: [[1, 0, 0, 0]],
    });
    const b = kernel.observe({
      declaredTask: [1, 0, 0, 0],
      ensembleBehavior: [[0.9, 0.1, 0, 0]],
    });
    const c = kernel.observe({
      declaredTask: [1, 0, 0, 0],
      ensembleBehavior: [[-1, 0, 0, 0]],
    });
    expect(a.parentHash).toBeUndefined();
    expect(b.parentHash).toBe(a.hash);
    expect(c.parentHash).toBe(b.hash);
    expect(kernel.verifyChain()).toEqual({ valid: true });
  });

  it('queues stigmergic signals for elevated+ severity and drains them', () => {
    const kernel = new DriftSentinelKernel({
      baseSensitivity: 0.05,
      sigmaMultiplier: 0,
      criticalCeiling: 0.9,
      stigmergicSignalFloor: 'elevated',
    });
    // Seed baseline with low-drift events.
    for (let i = 0; i < 5; i++) {
      kernel.observe({
        declaredTask: [1, 0, 0, 0],
        ensembleBehavior: [[1, 0, 0, 0]],
      });
    }
    kernel.observe({
      declaredTask: [1, 0, 0, 0],
      ensembleBehavior: [[0, 1, 0, 0]],
    });
    const drained = kernel.consumeStigmergicEvents();
    expect(drained.length).toBeGreaterThan(0);
    expect(drained[drained.length - 1].severity).not.toBe('nominal');
    // Second drain returns empty.
    expect(kernel.consumeStigmergicEvents()).toEqual([]);
  });

  it('rewinds flagged events back to their reasoning step', () => {
    const kernel = new DriftSentinelKernel({ criticalCeiling: 0.4 });
    kernel.observe({
      declaredTask: [1, 0, 0, 0],
      ensembleBehavior: [[1, 0, 0, 0]],
      reasoningStepId: 'step-ok',
    });
    kernel.observe({
      declaredTask: [1, 0, 0, 0],
      ensembleBehavior: [[-1, 0, 0, 0]],
      reasoningStepId: 'step-bad',
    });
    const flagged = kernel.rewindFlagged('elevated');
    expect(flagged).toHaveLength(1);
    expect(flagged[0].reasoningStepId).toBe('step-bad');
  });

  it('exposes a divergence telemetry snapshot with histogram and chain head', () => {
    const kernel = new DriftSentinelKernel();
    kernel.observe({
      declaredTask: [1, 0, 0, 0],
      ensembleBehavior: [[1, 0, 0, 0]],
    });
    kernel.observe({
      declaredTask: [1, 0, 0, 0],
      ensembleBehavior: [[-1, 0, 0, 0]],
    });
    const telemetry = kernel.getTelemetry();
    expect(telemetry.observedCount).toBe(2);
    expect(telemetry.histogram.reduce((s, b) => s + b.count, 0)).toBe(2);
    expect(telemetry.chainHead).toBeDefined();
    expect(telemetry.baselineStd).toBeGreaterThan(0);
  });

  it('treats zero-magnitude tensors as maximally divergent without NaN', () => {
    const kernel = new DriftSentinelKernel();
    const event = kernel.observe({
      declaredTask: [0, 0, 0, 0],
      ensembleBehavior: [[1, 0, 0, 0]],
    });
    expect(Number.isFinite(event.delta)).toBe(true);
    expect(event.delta).toBe(1);
  });

  it('throws when observe is called without ensemble behavior', () => {
    const kernel = new DriftSentinelKernel();
    expect(() =>
      kernel.observe({ declaredTask: [1, 0, 0, 0], ensembleBehavior: [] }),
    ).toThrow(/at least one B_e/);
  });
});
