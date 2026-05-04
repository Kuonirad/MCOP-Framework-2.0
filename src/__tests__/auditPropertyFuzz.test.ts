import { canonicalDigest } from '../core/canonicalEncoding';
import { NovaNeoEncoder } from '../core/novaNeoEncoder';
import { validateTensor } from '../core/tensorGuard';
import { randomJsonValue, randomText, randomVector, seeded } from './propertyTesting';

describe('Audit property fuzz — NovaNeoEncoder', () => {
  it('keeps hash encoding deterministic, finite, bounded, and dimension-stable', () => {
    const rand = seeded(0x5eedf00d);
    for (let i = 0; i < 200; i++) {
      const dimensions = 1 + Math.floor(rand() * 256);
      const normalize = rand() > 0.5;
      const entropyFloor = Math.round(rand() * 20) / 100;
      const encoder = new NovaNeoEncoder({
        dimensions,
        normalize,
        entropyFloor,
        backend: 'hash',
      });
      const text = randomText(rand, 256);

      const first = encoder.encode(text);
      const second = encoder.encode(text);

      expect(first).toEqual(second);
      expect(first).toHaveLength(dimensions);
      expect(first.every(Number.isFinite)).toBe(true);
      expect(encoder.estimateEntropy(first)).toBeGreaterThanOrEqual(entropyFloor);
      expect(encoder.estimateEntropy(first)).toBeLessThanOrEqual(1);

      if (normalize) {
        const mag = Math.sqrt(first.reduce((sum, value) => sum + value * value, 0));
        expect(mag).toBeCloseTo(1, 10);
      }
    }
  });
});

describe('Audit property fuzz — TensorGuard', () => {
  it('validates generated numeric tensors without mutating caller arrays', () => {
    const rand = seeded(0x71ad2026);
    for (let i = 0; i < 200; i++) {
      const dimensions = 1 + Math.floor(rand() * 96);
      const input = randomVector(rand, dimensions, 1000);
      const before = [...input];

      const validated = validateTensor(input, { dimensions, maxAbs: 1000 });

      expect(validated).toEqual(input);
      expect(input).toEqual(before);
      expect(validated).not.toBe(input);
    }
  });
});

describe('Audit property fuzz — canonicalDigest', () => {
  it('is deterministic and insensitive to object insertion order', () => {
    const rand = seeded(0xc0decafe);
    for (let i = 0; i < 200; i++) {
      const payload = randomJsonValue(rand);
      expect(canonicalDigest(payload)).toBe(canonicalDigest(payload));

      const a = {
        z: payload,
        a: randomJsonValue(rand),
        m: [payload, randomJsonValue(rand)],
      };
      const b = {
        m: a.m,
        z: a.z,
        a: a.a,
      };

      expect(canonicalDigest(a)).toBe(canonicalDigest(b));
    }
  });
});
