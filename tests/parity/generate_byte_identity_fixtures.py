# SPDX-License-Identifier: Apache-2.0
# Copyright (c) 2026 Kevin John Kull (Kuonirad) and KullAILABS MCOP Framework contributors
"""Generate the cross-runtime byte-identity golden fixture.

The headline claim of the MCOP reproducibility story is not ops/sec (which
invites hardware quibbles) but a property a referee can check in ninety
seconds: **the cognition-state digest is byte-identical across runtimes.**

Every provenance hash in MCOP — NOVA-NEO tensors, Stigmergy traces, Holographic
Etch records, reasoning-receipt leaves, film-shot records — rests on the same
substrate: ``SHA-256(RFC-8785-canonical-JSON(payload))``. This generator emits
the Python side of that digest for a fixture of representative cognition-state
payloads (including the float/unicode edge cases where naive JSON serialisation
diverges across languages). The TypeScript guardian
(``src/__tests__/byteIdentity.test.ts``) recomputes each digest through three
independent JavaScript SHA-256 paths — Node native ``crypto``, the portable
pure-JS implementation, and WebCrypto ``subtle`` — and asserts they equal each
other *and* this Python golden: four runtimes, one digest.

Deterministic: running it twice produces byte-identical output.

    python3 tests/parity/generate_byte_identity_fixtures.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO_ROOT = HERE.parent.parent
sys.path.insert(0, str(REPO_ROOT / "mcop_package"))

from mcop.canonical_encoding import canonical_digest  # noqa: E402

GOLDEN_PATH = HERE / "byteIdentity.golden.json"

# Representative cognition-state payloads — one per subsystem, plus the
# serialisation edge cases (signed zero, scientific-notation cutover, non-BMP
# characters) that are exactly where TS `JSON.stringify` and Python `json.dumps`
# disagree and RFC 8785 makes them agree.
COGNITION_STATE_FIXTURE = [
    {"subsystem": "nova-neo-encode", "text": "a solitary rover crosses the lunar south pole", "dimensions": 256, "normalize": True},
    {"subsystem": "stigmergy-trace", "context": [0.1, 0.2, 0.3], "synthesisVector": [0.4, 0.5, 0.6], "weight": 0.9876543210987654},
    {"subsystem": "holographic-etch", "deltaWeight": -0.015625, "note": "clip-3", "flourishingScore": 0.5},
    {"subsystem": "reasoning-receipt-leaf", "claim": {"id": 4, "text": "tau ~= 0.7816"}},
    {"subsystem": "film-shot", "shotIndex": 2, "seed": 4242, "priorFingerprintDigest": None},
    {"subsystem": "serialisation-edges", "emoji": "\U0001f702", "nonBmp": "\U00010348", "signedZero": -0.0, "sci": 1e21, "tiny": 5e-324},
]


def main() -> int:
    digests = [canonical_digest(payload) for payload in COGNITION_STATE_FIXTURE]
    # A single consensus root over the ordered per-payload digests — the one
    # hash a referee compares across all four runtimes.
    import hashlib

    consensus_root = hashlib.sha256("\n".join(digests).encode("utf-8")).hexdigest()

    golden = {
        "schema": "mcop-byte-identity/1.0",
        "note": "SHA-256(RFC-8785-canonical-JSON(payload)). Byte-identical across node, portable-JS, WebCrypto, and Python.",
        "fixture": COGNITION_STATE_FIXTURE,
        "digests": digests,
        "consensusRoot": consensus_root,
    }
    GOLDEN_PATH.write_text(json.dumps(golden, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"wrote {GOLDEN_PATH.relative_to(REPO_ROOT)} ({len(digests)} digests)")
    print(f"consensusRoot: {consensus_root}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
