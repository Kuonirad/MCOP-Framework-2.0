import { NovaNeoEncoder } from '../core/novaNeoEncoder';

describe('NovaNeoEncoder Security', () => {
  it('should process inputs within the default maxInputLength safely', () => {
    const encoder = new NovaNeoEncoder({ dimensions: 128 });
    const input = 'a'.repeat(10 * 1024); // 10KB
    expect(() => encoder.encode(input)).not.toThrow();
  });

  it('should enforce the default maxInputLength (10MB)', () => {
    const encoder = new NovaNeoEncoder({ dimensions: 128 });
    // Attempting to encode 10MB + 1 byte
    const inputLength = 10 * 1024 * 1024 + 1;
    // We don't want to actually allocate 10MB in memory if we can just mock the length property for the test,
    // but a string of length 10MB is feasible in modern Node.js environments for testing.
    // However, to be fast and safe, we can use an object that fakes the length,
    // though the encoder expects a string. We'll allocate the string.
    const input = Buffer.alloc(inputLength, 'a').toString();
    expect(() => encoder.encode(input)).toThrow(
      /Input length \(\d+\) exceeds maximum allowed length/
    );
  });

  it('should respect a custom maxInputLength', () => {
    const maxInputLength = 100;
    const encoder = new NovaNeoEncoder({ dimensions: 128, maxInputLength });

    // Within limit
    expect(() => encoder.encode('a'.repeat(100))).not.toThrow();

    // Exceeds limit
    expect(() => encoder.encode('a'.repeat(101))).toThrow(
      /Input length \(101\) exceeds maximum allowed length \(100\)/
    );
  });
});
