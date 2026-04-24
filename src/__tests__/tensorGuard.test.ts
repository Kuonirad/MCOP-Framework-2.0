import {
  isValidTensor,
  sanitizeTensor,
  TensorValidationError,
  validateTensor,
} from '../core/tensorGuard';

describe('TensorGuard — validateTensor', () => {
  it('accepts plain number arrays', () => {
    expect(validateTensor([1, 2, 3])).toEqual([1, 2, 3]);
  });

  it('coerces numeric strings', () => {
    expect(validateTensor(['1', '2.5', '-0.25'])).toEqual([1, 2.5, -0.25]);
  });

  it('rejects non-array inputs', () => {
    expect(() => validateTensor(null)).toThrow(TensorValidationError);
    expect(() => validateTensor(undefined)).toThrow(TensorValidationError);
    expect(() => validateTensor(42 as unknown)).toThrow(TensorValidationError);
  });

  it('rejects empty tensors', () => {
    expect(() => validateTensor([])).toThrow(/non-empty/);
  });

  it('enforces dimension when requested', () => {
    expect(() => validateTensor([1, 2, 3], { dimensions: 4 })).toThrow(/dimensions/);
    expect(validateTensor([1, 2, 3, 4], { dimensions: 4 })).toHaveLength(4);
  });

  it('rejects NaN/Infinity unless coerceNonFinite is set', () => {
    expect(() => validateTensor([1, NaN, 3])).toThrow(/finite/);
    expect(validateTensor([1, NaN, 3], { coerceNonFinite: true })).toEqual([1, 0, 3]);
  });

  it('rejects values beyond maxAbs', () => {
    expect(() => validateTensor([1, 1e9, 2], { maxAbs: 1e6 })).toThrow(/maxAbs/);
  });

  it('tags errors with stable codes and indices', () => {
    try {
      validateTensor([1, {} as unknown as number, 3]);
      fail('should have thrown');
    } catch (err) {
      const e = err as TensorValidationError;
      expect(e.code).toBe('TENSOR_BAD_ELEMENT');
      expect(e.index).toBe(1);
    }
  });
});

describe('TensorGuard — sanitizeTensor / isValidTensor', () => {
  it('sanitize clamps non-finite values to 0', () => {
    expect(sanitizeTensor([1, Infinity, NaN, -2])).toEqual([1, 0, 0, -2]);
  });

  it('isValidTensor never throws', () => {
    expect(isValidTensor([1, 2, 3])).toBe(true);
    expect(isValidTensor([])).toBe(false);
    expect(isValidTensor('bad' as unknown)).toBe(false);
  });
});
