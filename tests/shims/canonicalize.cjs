/**
 * CommonJS shim for the `canonicalize` package (RFC 8785 JCS).
 *
 * The upstream package switched to ESM-only in v3.0.0, but the Jest
 * test runner used by this repo executes through ts-jest in CommonJS
 * mode and cannot consume a pure-ESM dependency synchronously.
 *
 * To keep production code (Next.js / packages/core builds) using the
 * real upstream module while tests resolve a CJS-equivalent, this file
 * is mapped in via `moduleNameMapper` in jest.config.js. The
 * implementation is byte-identical to the upstream
 * `lib/canonicalize.js` from canonicalize@3.0.0; only the `export
 * default` line is rewritten to `module.exports`.
 *
 * Source: https://github.com/erdtman/canonicalize/blob/v3.0.0/lib/canonicalize.js
 * License: Apache-2.0 (Samuel Erdtman, Anders Rundgren). See
 * `node_modules/canonicalize/LICENSE` for the full text.
 */
'use strict';

function canonicalize(object, seen = new Set()) {
  if (typeof object === 'number' && isNaN(object)) {
    throw new Error('NaN is not allowed');
  }

  if (typeof object === 'number' && !isFinite(object)) {
    throw new Error('Infinity is not allowed');
  }

  if (object === null || typeof object !== 'object') {
    return JSON.stringify(object);
  }

  if (typeof object.toJSON === 'function') {
    if (seen.has(object)) {
      throw new Error('Circular reference detected');
    }
    seen.add(object);
    const result = canonicalize(object.toJSON(), seen);
    seen.delete(object);
    return result;
  }

  if (seen.has(object)) {
    throw new Error('Circular reference detected');
  }
  seen.add(object);

  let result;
  if (Array.isArray(object)) {
    const values = object.map((cv) => {
      const value = cv === undefined || typeof cv === 'symbol' ? null : cv;
      return canonicalize(value, seen);
    });
    result = `[${values.join(',')}]`;
  } else {
    const parts = [];
    for (const key of Object.keys(object).sort()) {
      if (object[key] === undefined || typeof object[key] === 'symbol') {
        continue;
      }
      parts.push(`${canonicalize(key)}:${canonicalize(object[key], seen)}`);
    }
    result = `{${parts.join(',')}}`;
  }

  seen.delete(object);
  return result;
}

module.exports = canonicalize;
module.exports.default = canonicalize;
