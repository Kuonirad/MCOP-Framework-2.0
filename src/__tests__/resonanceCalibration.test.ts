// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Kevin John Kull (Kuonirad) and KullAILABS MCOP Framework contributors
import {
  analyticThreshold,
  DEFAULT_FALSE_RESONANCE_ALPHA,
  effectiveTensorDimensions,
  falseResonanceRate,
  inverseNormalCdf,
  LEGACY_RESONANCE_THRESHOLD,
  normalCdf,
  SHA256_TENSOR_DIMENSIONS,
} from '../core/resonanceCalibration';
import { StigmergyV5 } from '../core/stigmergyV5';
import { NovaNeoEncoder } from '../core/novaNeoEncoder';

describe('resonanceCalibration — closed-form noise floor', () => {
  test('effective dimensionality saturates at 32 for hash-family backends', () => {
    expect(effectiveTensorDimensions('hash', 256)).toBe(32);
    expect(effectiveTensorDimensions('novaNeoWeb', 1024)).toBe(32);
    expect(effectiveTensorDimensions('hash', 16)).toBe(16);
    expect(effectiveTensorDimensions('embedding', 256)).toBe(256);
  });

  test('calibrated default for the stock configuration is ≈ 0.7816', () => {
    const tau = analyticThreshold(SHA256_TENSOR_DIMENSIONS, {
      alpha: DEFAULT_FALSE_RESONANCE_ALPHA,
      candidates: 2048,
    });
    expect(tau).toBeCloseTo(0.7816, 3);
  });

  test('reproduces the legacy-threshold false-resonance finding (21.5% Gaussian bound)', () => {
    const rate = falseResonanceRate(LEGACY_RESONANCE_THRESHOLD, SHA256_TENSOR_DIMENSIONS, 2048);
    expect(rate).toBeCloseTo(0.215, 2);
  });

  test('the calibrated threshold meets its own budget', () => {
    const tau = analyticThreshold(32, { alpha: 0.01, candidates: 2048 });
    expect(falseResonanceRate(tau, 32, 2048)).toBeCloseTo(0.01, 3);
  });

  test('threshold is monotone in α, M, and n', () => {
    // Tighter budget ⇒ higher floor.
    expect(analyticThreshold(32, { alpha: 0.001, candidates: 2048 }))
      .toBeGreaterThan(analyticThreshold(32, { alpha: 0.05, candidates: 2048 }));
    // More effective dimensions ⇒ thinner noise ⇒ lower floor.
    expect(analyticThreshold(256, { alpha: 0.01, candidates: 2048 }))
      .toBeLessThan(analyticThreshold(32, { alpha: 0.01, candidates: 2048 }));
    // More candidates ⇒ more chances for spurious resonance ⇒ higher floor.
    expect(analyticThreshold(32, { alpha: 0.01, candidates: 4096 }))
      .toBeGreaterThan(analyticThreshold(32, { alpha: 0.01, candidates: 64 }));
  });

  test('threshold clamps to [0, 1] when no threshold can meet the budget', () => {
    expect(analyticThreshold(1, { alpha: 0.001, candidates: 4096 })).toBe(1);
  });

  test('normal CDF and quantile round-trip within approximation error', () => {
    expect(inverseNormalCdf(normalCdf(1.5))).toBeCloseTo(1.5, 4);
    expect(inverseNormalCdf(normalCdf(-2.25))).toBeCloseTo(-2.25, 4);
    expect(normalCdf(0)).toBeCloseTo(0.5, 7);
    expect(inverseNormalCdf(0.5)).toBeCloseTo(0, 9);
  });

  test('quantile rejects probabilities outside the open unit interval', () => {
    expect(() => inverseNormalCdf(0)).toThrow();
    expect(() => inverseNormalCdf(1)).toThrow();
  });
});

describe('StigmergyV5 — calibrated noise floor wiring', () => {
  test('default threshold is the analytic floor, not the legacy constant', () => {
    const stig = new StigmergyV5();
    const expected = analyticThreshold(SHA256_TENSOR_DIMENSIONS, { candidates: 2048 });
    expect(stig.getResonance([1, 0, 0]).thresholdUsed).toBeCloseTo(expected, 10);
  });

  test('floor follows buffer capacity (fewer candidates ⇒ lower floor)', () => {
    const small = new StigmergyV5({ maxTraces: 64 });
    const large = new StigmergyV5({ maxTraces: 4096 });
    expect(small.getResonance([1, 0]).thresholdUsed!)
      .toBeLessThan(large.getResonance([1, 0]).thresholdUsed!);
  });

  test('embedding-backend calibration uses the full dimensionality', () => {
    const stig = new StigmergyV5({
      noiseFloor: { backend: 'embedding', tensorDimensions: 256 },
    });
    const expected = analyticThreshold(256, { candidates: 2048 });
    expect(stig.getResonance([1, 0]).thresholdUsed).toBeCloseTo(expected, 10);
  });

  test('explicit thresholds still take precedence (backward compatible)', () => {
    expect(new StigmergyV5({ resonanceThreshold: 0.4 }).getResonance([1]).thresholdUsed)
      .toBe(0.4);
    expect(new StigmergyV5({ adaptiveThreshold: 0.9 }).getResonance([1]).thresholdUsed)
      .toBe(0.9);
  });

  test('hash backend behaves as exact-match memory at the calibrated floor', () => {
    const encoder = new NovaNeoEncoder({ dimensions: 128, normalize: true });
    const stig = new StigmergyV5({ adaptiveThreshold: false });
    for (let i = 0; i < 64; i++) {
      const tensor = encoder.encode(`stored fact #${i}`);
      stig.recordTrace(tensor, tensor);
    }

    // An unrelated query must not resonate at the calibrated floor…
    const miss = stig.getResonance(encoder.encode('completely unrelated query'));
    expect(miss.trace).toBeUndefined();

    // …while a verbatim re-encoding matches with cosine 1.
    const hit = stig.getResonance(encoder.encode('stored fact #17'));
    expect(hit.score).toBeCloseTo(1, 9);
    expect(hit.trace).toBeDefined();
  });
});
