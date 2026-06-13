# SPDX-License-Identifier: Apache-2.0
# Copyright (c) 2026 Kevin John Kull (Kuonirad) and KullAILABS MCOP Framework contributors
"""Cross-Runtime reasoning-receipts (MMR) Parity Guardian — Python side.

Mirror of ``src/__tests__/reasoningReceipts.test.ts``. Both runtimes read
the same checked-in golden file
(``tests/parity/reasoningReceipts.golden.json``), rebuild the reasoning
session from the golden claims, recompute the root + every receipt, and
assert they match — a divergence in either runtime's byte-level MMR math
fails CI on the affected side.

Re-generate after intentionally changing the claims::

    python3 tests/parity/generate_reasoning_receipts_fixtures.py
"""

from __future__ import annotations

import copy
import json
from pathlib import Path

from mcop.reasoning_receipts import (
    EMPTY_SESSION_ROOT,
    ReasoningSession,
    verify_receipt,
)

REPO_ROOT = Path(__file__).resolve().parents[3]
GOLDEN_PATH = REPO_ROOT / "tests" / "parity" / "reasoningReceipts.golden.json"

_EMPTY_ROOT_CONST = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"


def _golden() -> dict:
    return json.loads(GOLDEN_PATH.read_text(encoding="utf-8"))


def _rebuild_session(golden: dict) -> ReasoningSession:
    session = ReasoningSession(golden.get("title"))
    for claim in golden["claims"]:
        session.add_claim(claim)
    return session


def test_empty_session_root_matches_rfc6962_constant() -> None:
    assert EMPTY_SESSION_ROOT == _EMPTY_ROOT_CONST
    assert ReasoningSession().root() == _EMPTY_ROOT_CONST


def test_rebuilt_session_root_and_size_match_golden() -> None:
    golden = _golden()
    session = _rebuild_session(golden)
    assert session.size == golden["size"]
    assert session.root() == golden["root"]


def test_every_golden_receipt_verifies() -> None:
    golden = _golden()
    for receipt in golden["receipts"]:
        result = verify_receipt(receipt)
        assert result.valid is True, (
            f"receipt leafIndex={receipt.get('leafIndex')} invalid: {result.reason}"
        )
        assert receipt["root"] == golden["root"]


def test_regenerated_receipts_match_golden_byte_for_byte() -> None:
    golden = _golden()
    session = _rebuild_session(golden)
    for i, expected in enumerate(golden["receipts"]):
        regenerated = session.receipt_for(i).to_json()
        assert regenerated == expected, f"receipt {i} drift"
        assert regenerated["receiptId"] == expected["receiptId"]
        assert regenerated["proof"] == expected["proof"]


def test_tampered_claim_fails_with_claim_leaf_mismatch() -> None:
    golden = _golden()
    receipt = copy.deepcopy(golden["receipts"][0])
    # Tamper the claim text without updating the recorded leaf entry.
    receipt["claim"]["text"] = receipt["claim"]["text"] + " (tampered)"
    result = verify_receipt(receipt)
    assert result.valid is False
    assert result.reason == "claim-leaf-mismatch"
