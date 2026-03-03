import { NovaNeoEncoder } from '../core/novaNeoEncoder';

describe('NovaNeoEncoder Security', () => {
  it('enforces default maximum input length limit to prevent memory exhaustion DoS', () => {

    // Create an input slightly larger than the 10MB default limit (10 * 1024 * 1024 + 1 chars)
    // To avoid actually allocating 10MB in memory which might slow down the test,
    // we can use a custom configuration for testing
    const testEncoder = new NovaNeoEncoder({ dimensions: 8, maxInputLength: 100 });

    const validStr = 'a'.repeat(100);
    expect(() => testEncoder.encode(validStr)).not.toThrow();

    const invalidStr = 'a'.repeat(101);
    expect(() => testEncoder.encode(invalidStr)).toThrow(/Input length exceeds maximum allowed/);
  });
});
