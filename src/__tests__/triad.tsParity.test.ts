/**
 * TS↔TS Triad Parity Guardian.
 *
 * The triad has two TypeScript implementations:
 *   - `src/core/*`            — the in-app version (uses pino logger,
 *                               delegates math to the shared vectorMath
 *                               module).
 *   - `packages/core/src/*`   — the publishable, zero-dependency version
 *                               (opt-in debug hook, inline math).
 *
 * The divergence is deliberate: the published library cannot ship a
 * transitive pino dependency, but it must still produce byte-identical
 * tensors for the same input as the in-app version — otherwise a
 * downstream consumer of `@kullailabs/mcop-core` cannot reproduce or
 * audit a hash recorded by an instance of the running app.
 *
 * `scripts/parity-guardian.mjs` covers cross-language parity (npm↔Python)
 * through the built package entry point. This suite independently keeps the
 * in-app source tree aligned with the publishable package source.
 *
 * The fixture matrix is intentionally aligned with the matrix in
 * `scripts/parity-guardian.mjs` so the same inputs are exercised at
 * three layers: TS-app, TS-package, and Python.
 */

import { NovaNeoEncoder as AppEncoder } from '@/core/novaNeoEncoder';
import { NovaNeoEncoder as PkgEncoder } from '../../packages/core/src/novaNeoEncoder';
import { StigmergyV5 as AppStigmergy } from '@/core/stigmergyV5';
import { StigmergyV5 as PkgStigmergy } from '../../packages/core/src/stigmergyV5';
import { canonicalDigest as appCanonicalDigest } from '@/core/canonicalEncoding';
import { canonicalDigest as pkgCanonicalDigest } from '../../packages/core/src/canonicalEncoding';

interface Fixture {
  text: string;
  dimensions: number;
  normalize: boolean;
}

const ENCODER_FIXTURES: ReadonlyArray<Fixture> = [
  { text: 'hello triad', dimensions: 16, normalize: false },
  { text: 'hello triad', dimensions: 16, normalize: true },
  { text: 'crystalline entropy', dimensions: 64, normalize: true },
  { text: 'Merkle pheromone', dimensions: 128, normalize: true },
  { text: '', dimensions: 8, normalize: false },
];

describe('TS↔TS triad parity (src/core vs packages/core/src)', () => {
  describe('NovaNeoEncoder.encode', () => {
    for (const fixture of ENCODER_FIXTURES) {
      it(`produces byte-identical tensors for ${JSON.stringify(fixture)}`, () => {
        const app = new AppEncoder({
          dimensions: fixture.dimensions,
          normalize: fixture.normalize,
        });
        const pkg = new PkgEncoder({
          dimensions: fixture.dimensions,
          normalize: fixture.normalize,
        });
        const appTensor = app.encode(fixture.text);
        const pkgTensor = pkg.encode(fixture.text);

        expect(appTensor.length).toBe(pkgTensor.length);
        expect(appTensor.length).toBe(fixture.dimensions);
        // Element-wise bit-identical equality. Both implementations run
        // the same SHA-256 + signed-byte expansion in the same order, so
        // any drift here is a real correctness bug.
        for (let i = 0; i < appTensor.length; i++) {
          expect(Object.is(appTensor[i], pkgTensor[i])).toBe(true);
        }
      });
    }

    it('estimateEntropy returns the same value across both implementations', () => {
      // The two `estimateEntropy` implementations differ in shape (the
      // app version delegates to vectorMath.variance, the package version
      // uses an inline single-pass calc) but must be mathematically
      // equivalent: Var(X) = E[X^2] - (E[X])^2.
      const app = new AppEncoder({ dimensions: 64, normalize: true });
      const pkg = new PkgEncoder({ dimensions: 64, normalize: true });
      const text = 'hello triad';
      expect(Object.is(
        app.estimateEntropy(app.encode(text)),
        pkg.estimateEntropy(pkg.encode(text)),
      )).toBe(true);
    });
  });



  describe('StigmergyV5 semantic parity', () => {
    const TRACE_FIXTURES: ReadonlyArray<{ context: number[]; synthesis: number[]; label: string }> = [
      { context: [1, 0], synthesis: [1, 0], label: 'perfect' },
      { context: [1, 0], synthesis: [0.5, Math.sqrt(3) / 2], label: 'partial' },
      { context: [1, 0], synthesis: [0, 1], label: 'orthogonal' },
    ];

    function buildPairedMemories() {
      const config = {
        resonanceThreshold: 0.2,
        maxTraces: 8,
        adaptiveThreshold: true,
        hysteresisBand: 0,
        calibrationWindow: 3,
        curiosityBonus: 0.1,
        growthBias: 0.15,
      } as const;
      const app = new AppStigmergy(config);
      const pkg = new PkgStigmergy(config);

      for (let index = 0; index < TRACE_FIXTURES.length; index++) {
        const fixture = TRACE_FIXTURES[index];
        const traceId = `123e4567-e89b-42d3-a456-42661417400${index}`;
        const appTrace = app.recordTrace(
          fixture.context,
          fixture.synthesis,
          { label: fixture.label },
          { traceId },
        );
        const pkgTrace = pkg.recordTrace(
          fixture.context,
          fixture.synthesis,
          { label: fixture.label },
          { traceId },
        );
        expect(appTrace.weight).toBeCloseTo(pkgTrace.weight, 15);
        expect(appTrace.magnitude).toBeCloseTo(pkgTrace.magnitude ?? 0, 15);
        expect(appTrace.metadata).toEqual(pkgTrace.metadata);
        expect(appTrace.hash).toBe(pkgTrace.hash);
      }

      return { app, pkg };
    }

    it('uses the same adaptive threshold and resonance score after calibration', () => {
      const { app, pkg } = buildPairedMemories();
      const appResult = app.getResonance([1, 0]);
      const pkgResult = pkg.getResonance([1, 0]);

      expect(appResult.score).toBeCloseTo(pkgResult.score, 15);
      expect(appResult.thresholdUsed).toBeDefined();
      expect(pkgResult.thresholdUsed).toBeDefined();
      expect(appResult.thresholdUsed ?? 0).toBeCloseTo(pkgResult.thresholdUsed ?? 0, 15);
      expect(appResult.positiveFeedbackScore).toBeCloseTo(pkgResult.positiveFeedbackScore ?? 0, 15);
      expect(appResult.trace?.metadata).toEqual(pkgResult.trace?.metadata);
      expect(appResult.thresholdUsed ?? 0).toBeGreaterThan(0.2);
      expect(appResult.thresholdUsed ?? 0).toBeLessThan(0.3);
    });

    it('keeps the positive-feedback hysteresis baseline in sync after an accepted match', () => {
      const { app, pkg } = buildPairedMemories();
      app.getResonance([1, 0]);
      pkg.getResonance([1, 0]);

      expect(app.getPositiveFeedbackHysteresisScore(0.4)).toBeCloseTo(
        pkg.getPositiveFeedbackHysteresisScore(0.4),
        15,
      );
      expect(app.getAdaptiveResonanceThreshold()).toBeCloseTo(
        pkg.getAdaptiveResonanceThreshold(),
        15,
      );
    });

    it('ranks resonant recent traces with identical curiosity lifts', () => {
      const { app, pkg } = buildPairedMemories();
      const appRecent = app.getResonantRecent(3, { context: [1, 0], includeLowResonance: true });
      const pkgRecent = pkg.getResonantRecent(3, { context: [1, 0], includeLowResonance: true });

      expect(appRecent.map((trace) => trace.metadata?.label)).toEqual(
        pkgRecent.map((trace) => trace.metadata?.label),
      );
      for (let i = 0; i < appRecent.length; i++) {
        expect(appRecent[i].resonanceScore).toBeCloseTo(pkgRecent[i].resonanceScore, 15);
        expect(appRecent[i].curiosityLift).toBeCloseTo(pkgRecent[i].curiosityLift, 15);
      }
    });

    it('honors adaptiveThreshold=false in both implementations', () => {
      const app = new AppStigmergy({ resonanceThreshold: 0.2, adaptiveThreshold: false });
      const pkg = new PkgStigmergy({ resonanceThreshold: 0.2, adaptiveThreshold: false });
      for (const fixture of TRACE_FIXTURES) {
        app.recordTrace(fixture.context, fixture.synthesis, { label: fixture.label });
        pkg.recordTrace(fixture.context, fixture.synthesis, { label: fixture.label });
      }

      expect(app.getAdaptiveResonanceThreshold()).toBe(0.2);
      expect(pkg.getAdaptiveResonanceThreshold()).toBe(0.2);
      expect(app.getResonance([1, 0]).thresholdUsed).toBe(pkg.getResonance([1, 0]).thresholdUsed);
    });
  });


  describe('canonicalDigest', () => {
    const CANONICAL_FIXTURES: ReadonlyArray<unknown> = [
      null,
      'hello',
      42,
      { b: 2, a: 1 },
      { nested: { z: [3, 2, 1], a: 'A' } },
      [1, 'two', { three: 3 }],
    ];

    for (const fixture of CANONICAL_FIXTURES) {
      it(`agrees on canonicalDigest of ${JSON.stringify(fixture)}`, () => {
        expect(appCanonicalDigest(fixture)).toBe(pkgCanonicalDigest(fixture));
      });
    }
  });
});
