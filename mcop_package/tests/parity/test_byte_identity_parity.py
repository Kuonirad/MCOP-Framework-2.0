# SPDX-License-Identifier: Apache-2.0
# Copyright (c) 2026 Kevin John Kull (Kuonirad) and KullAILABS MCOP Framework contributors
"""Cross-runtime byte-identity guardian — Python side.

Recomputes the cognition-state digest for the shared fixture and asserts it
matches the checked-in golden (`tests/parity/byteIdentity.golden.json`). The
TypeScript counterpart (`src/__tests__/byteIdentity.test.ts`) checks the same
golden through three independent JavaScript SHA-256 paths, so a drift in either
runtime's canonical encoding or hashing fails the affected side. Four runtimes,
one digest.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

from mcop.canonical_encoding import canonical_digest

REPO_ROOT = Path(__file__).resolve().parents[3]
GOLDEN_PATH = REPO_ROOT / "tests" / "parity" / "byteIdentity.golden.json"


def _golden() -> dict:
    return json.loads(GOLDEN_PATH.read_text(encoding="utf-8"))


def test_python_reproduces_every_golden_digest() -> None:
    golden = _golden()
    for payload, expected in zip(golden["fixture"], golden["digests"]):
        assert canonical_digest(payload) == expected


def test_consensus_root_reproduces() -> None:
    golden = _golden()
    digests = [canonical_digest(p) for p in golden["fixture"]]
    consensus = hashlib.sha256("\n".join(digests).encode("utf-8")).hexdigest()
    assert consensus == golden["consensusRoot"]


def test_serialisation_edges_are_stable() -> None:
    # Signed zero, 1e21, and non-BMP characters — exactly where naive JSON
    # serialisation diverges across languages and RFC 8785 makes it agree.
    golden = _golden()
    idx = next(
        i for i, p in enumerate(golden["fixture"]) if p.get("subsystem") == "serialisation-edges"
    )
    assert canonical_digest(golden["fixture"][idx]) == golden["digests"][idx]
