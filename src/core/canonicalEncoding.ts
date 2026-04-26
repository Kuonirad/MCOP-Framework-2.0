import canonicalize from 'canonicalize';
import { createHash } from 'node:crypto';

/**
 * RFC 8785 (JSON Canonicalization Scheme) SHA-256 digest helper.
 *
 * Use this anywhere a hash must be byte-identical across runtimes — TS ↔
 * Python — and across engine versions. Replaces the previous
 * `crypto.createHash('sha256').update(JSON.stringify(...))` pattern, which
 * relied on V8's implementation-defined key-iteration order, number
 * formatting, and string-escaping rules and therefore did not match the
 * Python `json.dumps(..., sort_keys=True, separators=(",", ":"))` output
 * for floats, signed zero, scientific-notation cutover, or non-BMP
 * characters.
 *
 * RFC 8785 fully specifies all three. The Python parity helper
 * `mcop.canonical_encoding.canonical_digest` produces byte-identical
 * output for the same logical payload.
 *
 * Note: `canonicalize(undefined)` returns `undefined`. We map it to the
 * empty canonical object `{}` so the helper is total — callers should
 * never pass `undefined` deliberately, but defensively mapping prevents a
 * crash if a wrapper accidentally passes a missing field.
 */
export function canonicalDigest(payload: unknown): string {
  const raw = canonicalize(payload) ?? '{}';
  return createHash('sha256').update(raw).digest('hex');
}
