"""Cross-Runtime Canonical-Merkle Parity Guardian — Python side.

Mirror of ``src/__tests__/canonicalMerkleParity.test.ts``. Both tests
read the same checked-in fixtures and the same checked-in golden roots
file, so a divergence in either runtime fails CI on the affected side
while leaving the other green — making the source of drift immediately
identifiable.

Re-generate after intentionally adding new fixture cases::

    python3 tests/parity/generate_fixtures.py

The TypeScript and Python tests must always agree after regeneration.
"""

from __future__ import annotations

import json
import re
from pathlib import Path

import pytest

from mcop.canonical_encoding import canonical_digest


REPO_ROOT = Path(__file__).resolve().parents[3]
FIXTURES_PATH = REPO_ROOT / "tests" / "parity" / "canonicalMerkleParity.fixtures.json"
GOLDEN_PATH = REPO_ROOT / "tests" / "parity" / "canonicalMerkleParity.golden.json"

_HEX64 = re.compile(r"^[0-9a-f]{64}$")


def _load_fixtures() -> list:
    return json.loads(FIXTURES_PATH.read_text(encoding="utf-8"))


def _load_golden() -> list:
    return json.loads(GOLDEN_PATH.read_text(encoding="utf-8"))


def test_fixtures_and_golden_have_matching_length() -> None:
    fixtures = _load_fixtures()
    golden = _load_golden()
    assert len(fixtures) == len(golden)
    assert len(fixtures) >= 1000


def test_every_golden_entry_is_a_64_char_hex_sha256() -> None:
    golden = _load_golden()
    for hex_value in golden:
        assert _HEX64.match(hex_value), f"not a 64-char hex SHA-256: {hex_value!r}"


def test_canonical_digest_matches_golden_for_every_fixture() -> None:
    fixtures = _load_fixtures()
    golden = _load_golden()

    mismatches: list[dict] = []
    for i, fixture in enumerate(fixtures):
        got = canonical_digest(fixture)
        if got != golden[i]:
            mismatches.append({"index": i, "got": got, "want": golden[i]})
            if len(mismatches) >= 5:
                break

    assert mismatches == [], (
        "canonical-Merkle parity drift detected — Python "
        "`canonical_digest` no longer matches the checked-in golden "
        f"roots: first mismatches = {mismatches!r}"
    )


@pytest.mark.parametrize(
    "payload",
    [
        # Sanity cases that exercise the documented divergences between
        # ``json.dumps`` and RFC 8785.
        {"x": 1.0, "y": 1},
        {"neg_zero": -0.0, "pos_zero": 0.0},
        {"big": 1e21, "small": 1e-7},
        {"non_ascii": "café 🌌"},
        {"ctrl": "\x00\x01\x02"},
    ],
)
def test_canonical_digest_is_stable_across_calls(payload: dict) -> None:
    """Within a single Python run, ``canonical_digest`` must be a pure
    function of its argument — calling it twice on the same payload
    yields the same hash."""

    first = canonical_digest(payload)
    second = canonical_digest(payload)
    assert first == second
    assert _HEX64.match(first)
