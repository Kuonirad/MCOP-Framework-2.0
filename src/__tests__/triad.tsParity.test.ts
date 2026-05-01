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
 * `scripts/parity-guardian.mjs` covers cross-language parity (TS↔Python)
 * by exercising the canonical algorithm via inline crypto. It does NOT
 * touch the actual `NovaNeoEncoder` classes exported from the two TS
 * trees. This test fills that gap.
 *
 * The fixture matrix is intentionally aligned with the matrix in
 * `scripts/parity-guardian.mjs` so the same inputs are exercised at
 * three layers: TS-app, TS-package, and Python.
 */

import { NovaNeoEncoder as AppEncoder } from '@/core/novaNeoEncoder';
import { NovaNeoEncoder as PkgEncoder } from '../../packages/core/src/novaNeoEncoder';
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
