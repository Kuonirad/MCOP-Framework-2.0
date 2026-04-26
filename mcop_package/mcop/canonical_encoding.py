"""RFC 8785 (JSON Canonicalization Scheme) SHA-256 digest helper.

Mirrors :func:`src/core/canonicalEncoding.ts::canonicalDigest`. Use this
anywhere a hash must be byte-identical with the TypeScript runtime —
Stigmergy traces, Holographic Etch records, planner nodes, provenance
events.

Why not ``json.dumps(..., sort_keys=True, separators=(",", ":"))``? That
gets key order right but does NOT match the TypeScript output on:

- Number formatting. Python ``repr`` emits ``1.0`` for an integer-valued
  float; RFC 8785 / ECMAScript ``Number.prototype.toString`` emits ``1``.
  Scientific-notation cutover differs between Python's ``repr`` and
  ECMAScript (``1e+21`` vs ``1e21``). Signed zero is preserved by Python
  but normalised to ``0`` by RFC 8785.
- Unicode escaping. ``json.dumps`` defaults to ``ensure_ascii=True`` and
  escapes non-ASCII as ``\\uXXXX``; RFC 8785 emits raw UTF-8 except for
  control characters and the explicit short-form escapes.
- Key ordering for non-BMP characters. Python sorts surrogate-encoded
  strings differently from RFC 8785's UTF-8 code-point ordering for
  characters above U+FFFF.

RFC 8785 fully specifies all three. The reference implementation lives
in the ``rfc8785`` package on PyPI; the TypeScript counterpart is the
``canonicalize`` package on npm.

The cross-runtime parity test
``tests/parity/test_canonical_merkle_parity.py`` (Python) and
``src/__tests__/canonicalMerkleParity.test.ts`` (TypeScript) hash a
shared fixture set on both runtimes and assert byte-identical roots
against the checked-in golden file.
"""

from __future__ import annotations

import hashlib

import rfc8785

__all__ = ["canonical_digest"]


def canonical_digest(payload: object) -> str:
    """Return the SHA-256 hex digest of the RFC 8785 canonical JSON
    encoding of ``payload``.

    Byte-identical to ``canonicalDigest(payload)`` in the TypeScript core
    for any payload expressible in both runtimes (objects, arrays,
    strings, numbers, booleans, ``None``).
    """
    return hashlib.sha256(rfc8785.dumps(payload)).hexdigest()
