"""
Cross-Language Parity Guardian — Python mirror of the MCOP triad primitives.

These implementations are **bit-for-bit equivalent** to the TypeScript versions
in ``src/core``. They exist so the TypeScript ↔ Python parity checker
(``scripts/parity-guardian.mjs``) can diff deterministic outputs across the
two runtimes and fail loudly the moment a port drifts.

Equivalence guarantees (enforced by ``tests/test_triad_parity.py``):

* ``nova_neo_encode(text, dimensions, normalize=False)`` produces the same
  floating-point tensor as ``NovaNeoEncoder.encode`` in TypeScript up to
  IEEE-754 identical ordering of operations.
* ``estimate_entropy`` matches ``NovaNeoEncoder.estimateEntropy``.
* ``cosine`` matches ``cosineWithMagnitudes`` / ``cosine`` in ``vectorMath``.

Any change here MUST land together with the corresponding TS change — the
parity guardian will otherwise refuse to pass CI.
"""

from __future__ import annotations

import hashlib
import math
from dataclasses import dataclass
from typing import Iterable, List, Optional, Sequence


__all__ = [
    "magnitude",
    "dot",
    "cosine",
    "variance",
    "nova_neo_encode",
    "estimate_entropy",
    "TriadParityResult",
    "triad_fingerprint",
]


def magnitude(v: Sequence[float]) -> float:
    """Euclidean L2 norm, matching :func:`vectorMath.magnitude`."""
    acc = 0.0
    for x in v:
        acc += x * x
    return math.sqrt(acc)


def dot(a: Sequence[float], b: Sequence[float]) -> float:
    """Dot product up to the shorter of the two inputs (ragged-safe)."""
    n = min(len(a), len(b))
    acc = 0.0
    for i in range(n):
        acc += a[i] * b[i]
    return acc


def cosine(a: Sequence[float], b: Sequence[float]) -> float:
    """Cosine similarity with a safe zero-vector fallback."""
    ma = magnitude(a)
    mb = magnitude(b)
    if ma == 0 or mb == 0:
        return 0.0
    return dot(a, b) / (ma * mb)


def variance(v: Sequence[float]) -> float:
    """Single-pass variance on absolute values, matching the TS port.

    Uses an explicit Python ``for`` loop (not ``sum()``) so the accumulator
    stays in double precision and stays bit-identical to the TS port.
    """
    n = len(v)
    if n == 0:
        return 0.0
    s = 0.0
    sq = 0.0
    for x in v:
        a = abs(x)
        s += a
        sq += a * a
    mean = s / n
    result = sq / n - mean * mean
    return 0.0 if result < 0 else result


def nova_neo_encode(text: str, dimensions: int, normalize: bool = False) -> List[float]:
    """
    Deterministic hashing pipeline mirroring :class:`NovaNeoEncoder`.

    Uses SHA-256 over UTF-8 encoded text, maps each byte to a signed
    [-1, 1] float, and tiles the 32-byte hash across ``dimensions`` entries.
    When ``normalize`` is true the output is scaled to unit L2 norm.
    """
    if dimensions <= 0:
        raise ValueError("dimensions must be positive")

    digest = hashlib.sha256(text.encode("utf-8")).digest()
    hash_len = len(digest)
    signed = [(b / 255) * 2 - 1 for b in digest]

    values: List[float] = [signed[i % hash_len] for i in range(dimensions)]

    if normalize:
        # Sum over the final tensor values directly in a plain for-loop so the
        # accumulator matches TS / JS bit-for-bit. Python's builtin ``sum()``
        # uses extended precision internally, which introduces a ~1 ULP drift
        # versus Node's standard double accumulator.
        sumsq = 0.0
        for v in values:
            sumsq += v * v
        norm = math.sqrt(sumsq) or 1.0
        values = [v / norm for v in values]

    return values


def estimate_entropy(tensor: Sequence[float], entropy_floor: float = 0.0) -> float:
    """Parity of ``NovaNeoEncoder.estimateEntropy`` — clamped variance."""
    if not tensor:
        return 0.0
    return max(min(1.0, variance(tensor)), entropy_floor)


@dataclass(frozen=True)
class TriadParityResult:
    """Stable fingerprint emitted by the parity guardian."""

    input: str
    dimensions: int
    normalized: bool
    entropy: float
    tensor_sha256: str


def _tensor_sha256(tensor: Iterable[float]) -> str:
    hasher = hashlib.sha256()
    for value in tensor:
        # Match Buffer.from(Float64Array(...)) bytes on the TS side.
        hasher.update(float_to_le_bytes(value))
    return hasher.hexdigest()


def float_to_le_bytes(value: float) -> bytes:
    """Little-endian 8-byte IEEE-754 encoding, matching Float64Array layout."""
    import struct  # local import keeps top-level clean for readers

    return struct.pack("<d", value)


def triad_fingerprint(
    text: str,
    dimensions: int = 32,
    normalize: bool = True,
    entropy_floor: float = 0.0,
) -> TriadParityResult:
    """Deterministic fingerprint for cross-language parity checks."""
    tensor = nova_neo_encode(text, dimensions, normalize=normalize)
    entropy = estimate_entropy(tensor, entropy_floor=entropy_floor)
    return TriadParityResult(
        input=text,
        dimensions=dimensions,
        normalized=normalize,
        entropy=entropy,
        tensor_sha256=_tensor_sha256(tensor),
    )


def _cli(argv: Optional[Sequence[str]] = None) -> int:
    """Command-line entrypoint used by the parity guardian script."""
    import argparse
    import json
    import sys

    parser = argparse.ArgumentParser(description="MCOP triad parity fingerprint")
    parser.add_argument("text", help="Input string to encode")
    parser.add_argument("--dimensions", type=int, default=32)
    parser.add_argument("--normalize", action="store_true")
    args = parser.parse_args(list(argv) if argv is not None else None)

    result = triad_fingerprint(
        args.text, dimensions=args.dimensions, normalize=args.normalize
    )
    json.dump(
        {
            "input": result.input,
            "dimensions": result.dimensions,
            "normalized": result.normalized,
            "entropy": result.entropy,
            "tensor_sha256": result.tensor_sha256,
        },
        sys.stdout,
    )
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    import sys

    sys.exit(_cli())
