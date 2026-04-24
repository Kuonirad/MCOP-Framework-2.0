/**
 * TensorGuard — strict validation, sanitization, and normalization for
 * `ContextTensor` values crossing trust boundaries (API inputs, cross-language
 * data, replay logs).
 *
 * Philosophy: fail loud on structural problems, fix silently only for
 * well-specified coercions (e.g. strings that are clearly numbers, typed
 * array inputs). Never return a tensor that contains NaN or Infinity.
 */

import type { ContextTensor } from './types';

export interface TensorGuardOptions {
  /** Required dimension count. When omitted any length >= 1 is accepted. */
  dimensions?: number;
  /** Maximum permitted absolute value per element. Defaults to 1e6. */
  maxAbs?: number;
  /** When true, replace non-finite values with 0 instead of throwing. */
  coerceNonFinite?: boolean;
}

export class TensorValidationError extends Error {
  readonly code: string;
  readonly index?: number;
  constructor(code: string, message: string, index?: number) {
    super(message);
    this.name = 'TensorValidationError';
    this.code = code;
    this.index = index;
  }
}

function isArrayLikeNumeric(
  value: unknown,
): value is ArrayLike<number | string> {
  if (!value || typeof value !== 'object') return false;
  const maybe = value as { length?: unknown };
  return typeof maybe.length === 'number';
}

/**
 * Validate and coerce an unknown value into a trusted `ContextTensor`.
 * Strings that cleanly parse as finite numbers are accepted; anything else
 * throws a `TensorValidationError` with a stable error code.
 */
export function validateTensor(
  value: unknown,
  options: TensorGuardOptions = {},
): ContextTensor {
  const { dimensions, maxAbs = 1e6, coerceNonFinite = false } = options;

  if (!isArrayLikeNumeric(value)) {
    throw new TensorValidationError(
      'TENSOR_NOT_ARRAY',
      'Expected an array-like tensor input',
    );
  }

  const len = value.length;
  if (len === 0) {
    throw new TensorValidationError('TENSOR_EMPTY', 'Tensor must be non-empty');
  }
  if (dimensions !== undefined && len !== dimensions) {
    throw new TensorValidationError(
      'TENSOR_DIM_MISMATCH',
      `Expected ${dimensions} dimensions, received ${len}`,
    );
  }

  const out = new Array<number>(len);
  for (let i = 0; i < len; i++) {
    const raw = value[i];
    let num: number;

    if (typeof raw === 'number') {
      num = raw;
    } else if (typeof raw === 'string' && raw.trim() !== '') {
      num = Number(raw);
    } else {
      throw new TensorValidationError(
        'TENSOR_BAD_ELEMENT',
        `Tensor element at index ${i} is not numeric`,
        i,
      );
    }

    if (!Number.isFinite(num)) {
      if (coerceNonFinite) {
        num = 0;
      } else {
        throw new TensorValidationError(
          'TENSOR_NON_FINITE',
          `Tensor element at index ${i} is not finite (${raw})`,
          i,
        );
      }
    }

    if (Math.abs(num) > maxAbs) {
      throw new TensorValidationError(
        'TENSOR_OUT_OF_RANGE',
        `Tensor element at index ${i} exceeds maxAbs (${maxAbs})`,
        i,
      );
    }

    out[i] = num;
  }

  return out;
}

/**
 * Sanitize an already-numeric tensor by clamping non-finite values to 0.
 * Useful for hot paths that can't tolerate throws.
 */
export function sanitizeTensor(tensor: readonly number[]): ContextTensor {
  const len = tensor.length;
  const out = new Array<number>(len);
  for (let i = 0; i < len; i++) {
    const v = tensor[i];
    out[i] = Number.isFinite(v) ? v : 0;
  }
  return out;
}

/** Predicate form of validateTensor; never throws. */
export function isValidTensor(
  value: unknown,
  options: TensorGuardOptions = {},
): boolean {
  try {
    validateTensor(value, options);
    return true;
  } catch {
    return false;
  }
}
