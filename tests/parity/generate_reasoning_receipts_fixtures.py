# SPDX-License-Identifier: Apache-2.0
# Copyright (c) 2026 Kevin John Kull (Kuonirad) and KullAILABS MCOP Framework contributors
"""Generate the cross-runtime reasoning-receipts parity golden + publishable bundle.

Deterministic: running it twice produces byte-identical
``reasoningReceipts.golden.json`` and ``public/receipts/d1-calibration.json``.
Both the TypeScript and Python (pytest
``mcop_package/tests/parity/test_reasoning_receipts_parity.py``) parity tests
rebuild the session from the golden claims, recompute the root + every receipt,
and assert they match — a drift in either runtime's byte-level MMR math fails
the affected side.

The golden and the publishable bundle are byte-identical: the golden is the
parity fixture, ``public/receipts/d1-calibration.json`` is the same content the
reader-as-verifier web page fetches.

Re-generate after intentionally changing the claims::

    python3 tests/parity/generate_reasoning_receipts_fixtures.py

Do **not** edit the JSON files by hand.
"""

from __future__ import annotations

import importlib.util
import json
import sys
from pathlib import Path
from typing import Any

HERE = Path(__file__).resolve().parent
REPO_ROOT = HERE.parent.parent
GOLDEN_PATH = HERE / "reasoningReceipts.golden.json"
PUBLIC_PATH = REPO_ROOT / "public" / "receipts" / "d1-calibration.json"

TITLE = "D1 — Calibrated resonance, reasoned in the open"

# The fixed reasoning session. These claims are LOCKED — changing them
# invalidates the golden file and every published receipt.
CLAIMS: list[dict[str, Any]] = [
    {"id": 0, "kind": "premise", "text": "Hash-backend tensors are statistically independent across distinct inputs."},
    {"id": 1, "kind": "derivation", "text": "Independent components make the cosine score asymptotically Normal(0, 1/M)."},
    {"id": 2, "kind": "observation", "text": "SHA-256 tiling adds no information, so effective dimensionality M saturates at 32."},
    {"id": 3, "kind": "derivation", "text": "Best-of-n over a full buffer gives P(false resonance) = 1 - Phi(tau*sqrt(M))^n."},
    {"id": 4, "kind": "result", "text": "Inverting at alpha=0.01, n=2048 yields tau ~= 0.7816."},
    {"id": 5, "kind": "finding", "text": "The legacy threshold 0.65 admits a 21.5% per-query false-resonance rate."},
    {"id": 6, "kind": "conclusion", "text": "Therefore the default resonance floor is analytically calibrated, not a magic number."},
]


def _load_reasoning_receipts():
    """Import ``mcop.reasoning_receipts`` if installed, else load it by path.

    The module depends on ``mcop.merkle`` and ``mcop.canonical_encoding``
    (the latter needs the ``rfc8785`` package), so a by-path load wires those
    sibling modules in too.
    """
    try:
        from mcop import reasoning_receipts as _rr  # type: ignore[import-not-found]

        return _rr
    except Exception:
        pkg_root = REPO_ROOT / "mcop_package"
        if str(pkg_root) not in sys.path:
            sys.path.insert(0, str(pkg_root))
        path = pkg_root / "mcop" / "reasoning_receipts.py"
        spec = importlib.util.spec_from_file_location("mcop.reasoning_receipts", path)
        assert spec and spec.loader
        module = importlib.util.module_from_spec(spec)
        sys.modules[spec.name] = module
        spec.loader.exec_module(module)
        return module


rr = _load_reasoning_receipts()


def _build_session() -> "rr.ReasoningSession":
    session = rr.ReasoningSession(TITLE)
    for claim in CLAIMS:
        session.add_claim(claim)
    return session


def _golden_document(session: "rr.ReasoningSession") -> dict[str, Any]:
    receipts = [session.receipt_for(i).to_json() for i in range(session.size)]
    return {
        "title": TITLE,
        "claims": list(CLAIMS),
        "root": session.root(),
        "size": session.size,
        "receipts": receipts,
    }


def main() -> None:
    session = _build_session()
    document = _golden_document(session)

    payload = json.dumps(document, indent=2, ensure_ascii=False, sort_keys=False) + "\n"

    GOLDEN_PATH.write_text(payload, encoding="utf-8")
    PUBLIC_PATH.parent.mkdir(parents=True, exist_ok=True)
    PUBLIC_PATH.write_text(payload, encoding="utf-8")

    print(f"root: {document['root']}")
    print(f"wrote golden ({document['size']} receipts) -> {GOLDEN_PATH}")
    print(f"wrote publishable bundle -> {PUBLIC_PATH}")


if __name__ == "__main__":
    main()
