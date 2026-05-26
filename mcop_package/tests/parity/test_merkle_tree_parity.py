"""Cross-Runtime RFC 6962 Merkle-Tree Parity Guardian — Python side.

Mirror of ``src/__tests__/merkleTreeParity.test.ts``. Both tests read the
same checked-in fixtures + golden file, so a divergence in either
runtime's byte-level Merkle math fails CI on the affected side.

Re-generate after intentionally adding fixture cases::

    python3 tests/parity/generate_merkle_fixtures.py
"""

from __future__ import annotations

import json
import re
from pathlib import Path

from mcop.merkle import inclusion_proof, merkle_root, verify_proof

REPO_ROOT = Path(__file__).resolve().parents[3]
FIXTURES_PATH = REPO_ROOT / "tests" / "parity" / "merkleTree.fixtures.json"
GOLDEN_PATH = REPO_ROOT / "tests" / "parity" / "merkleTree.golden.json"

_HEX64 = re.compile(r"^[0-9a-f]{64}$")


def _fixtures() -> list:
    return json.loads(FIXTURES_PATH.read_text(encoding="utf-8"))


def _golden() -> list:
    return json.loads(GOLDEN_PATH.read_text(encoding="utf-8"))


def _leaves(hexes: list[str]) -> list[bytes]:
    return [bytes.fromhex(h) for h in hexes]


def test_fixtures_and_golden_have_matching_length() -> None:
    fixtures = _fixtures()
    golden = _golden()
    assert len(fixtures) == len(golden)
    assert len(fixtures) >= 300


def test_every_golden_root_is_a_64_char_hex_sha256() -> None:
    for entry in _golden():
        assert _HEX64.match(entry["root"]), f"not a 64-char hex SHA-256: {entry['root']!r}"


def test_merkle_root_matches_golden_for_every_fixture() -> None:
    fixtures = _fixtures()
    golden = _golden()
    mismatches: list[dict] = []
    for i, fixture in enumerate(fixtures):
        got = merkle_root(_leaves(fixture["leaves"])).hex()
        if got != golden[i]["root"]:
            mismatches.append({"index": i, "got": got, "want": golden[i]["root"]})
            if len(mismatches) >= 5:
                break
    assert mismatches == [], f"merkle-root parity drift: first mismatches = {mismatches!r}"


def test_inclusion_proof_matches_golden_for_every_fixture() -> None:
    fixtures = _fixtures()
    golden = _golden()
    mismatches: list[int] = []
    for i, fixture in enumerate(fixtures):
        proof_index = fixture["proofIndex"]
        if proof_index is None:
            assert golden[i]["proof"] is None
            continue
        got = [step.to_json() for step in inclusion_proof(_leaves(fixture["leaves"]), proof_index)]
        if got != golden[i]["proof"]:
            mismatches.append(i)
            if len(mismatches) >= 5:
                break
    assert mismatches == [], f"inclusion-proof parity drift at indices {mismatches!r}"


def test_every_generated_proof_verifies_against_its_root() -> None:
    for fixture in _fixtures():
        proof_index = fixture["proofIndex"]
        if proof_index is None:
            continue
        leaves = _leaves(fixture["leaves"])
        proof = inclusion_proof(leaves, proof_index)
        assert verify_proof(leaves[proof_index], proof, merkle_root(leaves))
