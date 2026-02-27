import { NovaNeoEncoder } from '../core/novaNeoEncoder';

describe('NovaNeoEncoder Security', () => {
  it('rejects input exceeding the default limit (10MB)', () => {
    // 10MB + 1 byte
    const largeInput = 'a'.repeat(10 * 1024 * 1024 + 1);
    const encoder = new NovaNeoEncoder({ dimensions: 16 });

    expect(() => {
      encoder.encode(largeInput);
    }).toThrow(/Input text length \d+ exceeds maximum allowed length of \d+/);
  });

  it('rejects input exceeding a custom limit', () => {
    const encoder = new NovaNeoEncoder({ dimensions: 16, maxInputLength: 100 });
    const largeInput = 'a'.repeat(101);

    expect(() => {
      encoder.encode(largeInput);
    }).toThrow(/Input text length 101 exceeds maximum allowed length of 100/);
  });

  it('accepts valid input within limits', () => {
    const encoder = new NovaNeoEncoder({ dimensions: 16, maxInputLength: 100 });
    const validInput = 'a'.repeat(100);

    expect(() => {
      encoder.encode(validInput);
    }).not.toThrow();
  });
});
