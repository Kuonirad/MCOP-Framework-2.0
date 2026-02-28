import { NovaNeoEncoder } from '../core/novaNeoEncoder';

describe('NovaNeoEncoder Security Tests', () => {
  it('throws an error if input exceeds maxInputLength', () => {
    const encoder = new NovaNeoEncoder({ dimensions: 10, maxInputLength: 100 });

    // Valid input
    expect(() => encoder.encode('a'.repeat(100))).not.toThrow();

    // Invalid input (exceeds limit)
    expect(() => encoder.encode('a'.repeat(101))).toThrow('Input length 101 exceeds maximum allowed length of 100');
  });

  it('uses default 10MB limit if not specified', () => {
    const encoder = new NovaNeoEncoder({ dimensions: 10 });

    // Exceeds 10MB
    const limit = 10485760;
    // creating a 10MB string is slow, we can just check the error message
    // but a 10MB string is fine for testing. 10MB in Node is very fast
    // Let's create an object that acts like a string for `.length` to avoid memory issues in test,
    // wait, `encode` takes a string and does `crypto.createHash('sha256').update(text)`.
    // It will actually hash it. Hashing 10MB takes some time but not much.
    // Instead of actually hashing 10MB, we just test length 10MB + 1

    // Let's just create a dummy object that behaves like string for length?
    // No, `encode` accepts `string`.
    const dummyStr = { length: limit + 1 } as unknown as string;

    // We expect it to throw on length check before it reaches crypto.update()
    expect(() => encoder.encode(dummyStr)).toThrow(`Input length ${limit + 1} exceeds maximum allowed length of ${limit}`);
  });
});
