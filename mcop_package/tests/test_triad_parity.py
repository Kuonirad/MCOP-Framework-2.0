"""Unit tests for :mod:`mcop.triad` — the Cross-Language Parity Guardian.

These tests lock in the deterministic outputs of the Python mirror so that
accidental drift from the TypeScript reference implementation is caught
before the TS↔Python parity-guardian script even runs.

Any change here must be accompanied by a matching TS change AND a
successful run of ``node scripts/parity-guardian.mjs``.
"""

from __future__ import annotations

import math

import pytest

from mcop.triad import (
    cosine,
    dot,
    estimate_entropy,
    magnitude,
    nova_neo_encode,
    triad_fingerprint,
    variance,
)


def test_magnitude_and_dot_are_stable():
    assert magnitude([3, 4]) == pytest.approx(5.0)
    assert dot([1, 2, 3, 4], [1, 1]) == 3


def test_cosine_zero_guards():
    assert cosine([0, 0, 0], [1, 2, 3]) == 0.0
    assert cosine([1, 0, 0], [1, 0, 0]) == pytest.approx(1.0)


def test_variance_is_non_negative():
    for payload in [[1] * 8, [0, 1, 2, 3], []]:
        assert variance(payload) >= 0


def test_nova_neo_encode_is_deterministic():
    a = nova_neo_encode("mcop", 32, normalize=True)
    b = nova_neo_encode("mcop", 32, normalize=True)
    assert a == b
    assert len(a) == 32
    assert math.isclose(math.sqrt(sum(v * v for v in a)), 1.0, rel_tol=1e-12)


def test_nova_neo_encode_rejects_bad_dimensions():
    with pytest.raises(ValueError):
        nova_neo_encode("x", 0)


def test_estimate_entropy_clamped():
    vec = nova_neo_encode("entropy", 64, normalize=True)
    e = estimate_entropy(vec)
    assert 0.0 <= e <= 1.0


def test_triad_fingerprint_shapes():
    result = triad_fingerprint("hello triad", dimensions=16, normalize=True)
    assert result.input == "hello triad"
    assert result.dimensions == 16
    assert result.normalized is True
    assert len(result.tensor_sha256) == 64
    # Locked-in reference: must stay identical to the TS CLI output. If this
    # ever changes the TS mirror has to update in lockstep.
    assert (
        result.tensor_sha256
        == "5b5443c7cfae197f7b7eb1cafa8b078f215fdc093676feab672271f7a9850c2d"
    )


def test_cli_reference_non_normalized():
    result = triad_fingerprint("hello triad", dimensions=16, normalize=False)
    assert (
        result.tensor_sha256
        == "13a79080e74dc24c83abbbd68a3749d1a455d47db0436e8eb309b9ddb20aadc7"
    )
