"""Atheris fuzz harness for ``mcop.canonical_encoding``.

This file is a Scorecard-discoverable fuzz target for the RFC 8785
canonicalization surface used to compute Merkle roots for stigmergic
traces. The canonicalizer is the seam where cross-runtime parity must
hold byte-for-byte, so even non-crash divergences are interesting.

Run locally with Google's `atheris` libFuzzer harness:

    pip install atheris
    python mcop_package/fuzz/fuzz_canonical_encoding.py -atheris_runs=100000

Or under OSS-Fuzz / ClusterFuzzLite: this module is the entry point.
"""

from __future__ import annotations

import json
import sys

import atheris

with atheris.instrument_imports():
    import rfc8785

    from mcop.canonical_encoding import canonical_digest


def TestOneInput(data: bytes) -> None:
    fdp = atheris.FuzzedDataProvider(data)
    blob = fdp.ConsumeUnicodeNoSurrogates(fdp.remaining_bytes())
    try:
        obj = json.loads(blob)
    except (ValueError, json.JSONDecodeError):
        return
    try:
        canonical_bytes = rfc8785.dumps(obj)
        digest_a = canonical_digest(obj)
    except (TypeError, ValueError):
        return

    # Round-trip stability: re-parsing the canonical form must produce a
    # value whose digest matches the original. Any divergence here is a
    # Merkle-root corruption bug.
    try:
        roundtrip = json.loads(canonical_bytes.decode("utf-8"))
    except (UnicodeDecodeError, ValueError):
        raise
    digest_b = canonical_digest(roundtrip)
    if digest_a != digest_b:
        raise AssertionError(
            f"canonical_digest divergence: {digest_a!r} vs {digest_b!r}"
        )


def main() -> int:
    atheris.Setup(sys.argv, TestOneInput)
    atheris.Fuzz()
    return 0


if __name__ == "__main__":
    sys.exit(main())
