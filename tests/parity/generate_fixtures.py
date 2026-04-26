"""Generate the cross-runtime canonical-Merkle parity fixtures + golden roots.

This script is deterministic — running it twice produces byte-identical
``canonicalMerkleParity.fixtures.json`` and
``canonicalMerkleParity.golden.json`` files. CI verifies parity by having
both the TypeScript (Jest) and Python (pytest) parity tests hash the
fixtures and assert each computed hash matches the corresponding entry
in the golden file. If either runtime drifts (e.g. a future Node version
changes how ``Number.prototype.toString`` rounds, or Python's
``rfc8785`` package has a regression), the affected runtime's test will
fail.

Re-generate after adding new fixture cases::

    python3 tests/parity/generate_fixtures.py

The two tests must always be kept in sync with the checked-in fixtures
and golden file. Do **not** edit the JSON files by hand — re-run this
script.
"""

from __future__ import annotations

import json
import math
import random
import string
from pathlib import Path
from typing import Any, Dict, List

from mcop.canonical_encoding import canonical_digest


HERE = Path(__file__).resolve().parent
FIXTURES_PATH = HERE / "canonicalMerkleParity.fixtures.json"
GOLDEN_PATH = HERE / "canonicalMerkleParity.golden.json"

# Deterministic PRNG seed. Bumping it invalidates the golden file and
# forces every parity test to be regenerated.
SEED = 0x4D434F50  # b"MCOP"


def _curated_edge_cases() -> List[Dict[str, Any]]:
    """Hand-curated payloads exercising the differences between
    ``JSON.stringify`` and RFC 8785."""

    return [
        # Empty containers.
        {"payload": {}, "parentHash": None},
        {"payload": [], "parentHash": None},
        # Integer vs float representation. ``json.dumps`` emits ``1.0``;
        # RFC 8785 emits ``1``. ``canonicalize`` matches RFC 8785.
        {"payload": {"x": 1.0, "y": 1}, "parentHash": None},
        # Signed zero. ``json.dumps`` preserves ``-0.0``; RFC 8785
        # normalises to ``0``.
        {"payload": {"neg_zero": -0.0, "pos_zero": 0.0}, "parentHash": None},
        # Scientific-notation cutover. ``json.dumps`` emits
        # ``1e+21`` for ``1e21``; ``Number.prototype.toString`` matches.
        # Both should agree under RFC 8785.
        {"payload": {"big": 1e21, "small": 1e-7, "tiny": 5e-324}, "parentHash": None},
        # Mixed integer / float / negative / fractional.
        {
            "payload": {"a": -0.5, "b": 0.1, "c": 0.2, "sum": 0.30000000000000004},
            "parentHash": None,
        },
        # Key ordering. Insertion order varies; canonical order is
        # lexicographic UTF-8 code points.
        {"payload": {"z": 1, "a": 2, "m": 3, "_": 4, "0": 5}, "parentHash": None},
        # Non-ASCII strings (BMP).
        {"payload": {"greeting": "café 🌌", "ja": "東京"}, "parentHash": None},
        # Non-BMP (surrogate pair on UTF-16 runtimes).
        {"payload": {"emoji": "𝕏 𓂀 🤖"}, "parentHash": None},
        # Control characters (must be \uXXXX-escaped).
        {"payload": {"ctrl": "\x00\x01\x02\x1f"}, "parentHash": None},
        # Short-form escapes.
        {"payload": {"esc": "tab\there\nnewline\rcr\bbs\ffff"}, "parentHash": None},
        # Backslash + quote escapes.
        {"payload": {"esc2": 'quote: " backslash: \\'}, "parentHash": None},
        # Booleans + null.
        {"payload": {"t": True, "f": False, "n": None}, "parentHash": None},
        # Nested object.
        {
            "payload": {
                "outer": {"inner": {"deep": [1, 2, 3, {"k": "v"}]}, "alt": True}
            },
            "parentHash": None,
        },
        # Realistic MCOP-shaped payloads.
        {
            "payload": {
                "context": [round(i * 0.01 - 0.32, 6) for i in range(64)],
                "synthesisVector": [round(i * 0.013 + 0.05, 6) for i in range(64)],
                "normalizedDelta": 0.8423,
                "note": "synthesis-step-1",
            },
            "parentHash": None,
        },
        {
            "payload": {
                "context": [round(i * 0.01 - 0.32, 6) for i in range(64)],
                "synthesisVector": [round(i * 0.013 + 0.05, 6) for i in range(64)],
                "normalizedDelta": 0.8423,
                "note": "synthesis-step-1",
            },
            "parentHash": "0" * 64,
        },
        {
            "payload": {
                "id": "00000000-0000-4000-8000-000000000001",
                "action": None,
                "parentHash": None,
                "tensorHash": "a" * 64,
            },
            "parentHash": None,
        },
        {
            "payload": {
                "stage": "trace",
                "timestamp": "2026-04-26T19:00:00.000Z",
                "details": {
                    "traceId": "11111111-1111-4111-8111-111111111111",
                    "resonance": 0.0,
                    "merkleRoot": None,
                },
            },
            "parentHash": "f" * 64,
        },
    ]


def _random_payload(rng: random.Random, depth: int = 0) -> Any:
    """Generate a random JSON-safe payload up to a bounded depth."""

    if depth >= 4:
        choice = rng.choice(["int", "float", "str", "bool", "null"])
    else:
        choice = rng.choice(
            ["int", "float", "str", "bool", "null", "list", "obj", "obj", "list"]
        )

    if choice == "int":
        return rng.randint(-(2**31), 2**31 - 1)
    if choice == "float":
        # Avoid NaN / Infinity which are not representable in JSON.
        magnitude = 10 ** rng.randint(-9, 9)
        return rng.uniform(-1, 1) * magnitude
    if choice == "str":
        length = rng.randint(0, 24)
        # Mix of ASCII, BMP, and a few non-BMP code points.
        alphabet = string.ascii_letters + string.digits + " _-./café東" + "𝕏"
        return "".join(rng.choice(alphabet) for _ in range(length))
    if choice == "bool":
        return rng.random() < 0.5
    if choice == "null":
        return None
    if choice == "list":
        n = rng.randint(0, 6)
        return [_random_payload(rng, depth + 1) for _ in range(n)]
    if choice == "obj":
        n = rng.randint(0, 5)
        return {
            "k_" + "".join(rng.choice(string.ascii_lowercase) for _ in range(rng.randint(1, 6))): _random_payload(rng, depth + 1)
            for _ in range(n)
        }
    raise AssertionError("unreachable")


def _maybe_parent(rng: random.Random) -> Any:
    if rng.random() < 0.4:
        return None
    return "".join(rng.choice("0123456789abcdef") for _ in range(64))


def _generate(target_count: int) -> List[Dict[str, Any]]:
    rng = random.Random(SEED)
    cases = _curated_edge_cases()
    while len(cases) < target_count:
        cases.append(
            {"payload": _random_payload(rng), "parentHash": _maybe_parent(rng)}
        )
    return cases[:target_count]


def main() -> None:
    fixtures = _generate(1000)
    golden = [canonical_digest(f) for f in fixtures]

    # Validate that no fixture serialises to a non-finite number — we
    # explicitly avoid NaN / Infinity above, but assert here so a future
    # change can't silently leak one in.
    for i, fixture in enumerate(fixtures):
        for value in _walk_numbers(fixture):
            assert math.isfinite(value), f"non-finite number in fixture #{i}: {value}"

    FIXTURES_PATH.write_text(
        json.dumps(fixtures, ensure_ascii=False, indent=2, sort_keys=False) + "\n",
        encoding="utf-8",
    )
    GOLDEN_PATH.write_text(
        json.dumps(golden, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"wrote {len(fixtures)} fixtures -> {FIXTURES_PATH}")
    print(f"wrote {len(golden)} golden roots -> {GOLDEN_PATH}")


def _walk_numbers(value: Any):
    if isinstance(value, dict):
        for v in value.values():
            yield from _walk_numbers(v)
    elif isinstance(value, list):
        for v in value:
            yield from _walk_numbers(v)
    elif isinstance(value, float):
        yield value


if __name__ == "__main__":
    main()
