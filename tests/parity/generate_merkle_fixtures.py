"""Generate the cross-runtime RFC 6962 Merkle-tree parity fixtures + golden.

Deterministic: running it twice produces byte-identical
``merkleTree.fixtures.json`` and ``merkleTree.golden.json``. CI has both
the TypeScript (Jest) parity test ``src/__tests__/merkleTreeParity.test.ts``
and the Python (pytest) test
``mcop_package/tests/parity/test_merkle_tree_parity.py`` recompute every
fixture's root + inclusion proof and assert they match the golden file. A
drift in either runtime's byte-level Merkle math fails the affected side.

Re-generate after adding new fixture cases::

    python3 tests/parity/generate_merkle_fixtures.py

Do **not** edit the JSON files by hand.
"""

from __future__ import annotations

import importlib.util
import json
import random
import sys
from pathlib import Path
from typing import Any

HERE = Path(__file__).resolve().parent
REPO_ROOT = HERE.parent.parent
FIXTURES_PATH = HERE / "merkleTree.fixtures.json"
GOLDEN_PATH = HERE / "merkleTree.golden.json"

# Deterministic PRNG seed; bumping it invalidates the golden file.
SEED = 0x4D43_4F50  # b"MCOP"


def _load_merkle():
    """Import ``mcop.merkle`` if installed, else load the module by path.

    Lets the generator run from a fresh checkout where the ``mcop``
    package (and its ``rfc8785`` dependency, pulled by ``mcop/__init__``)
    is not installed — ``merkle.py`` itself is stdlib-only.
    """
    try:
        from mcop import merkle as _m  # type: ignore[import-not-found]

        return _m
    except Exception:
        path = REPO_ROOT / "mcop_package" / "mcop" / "merkle.py"
        spec = importlib.util.spec_from_file_location("_mcop_merkle_standalone", path)
        assert spec and spec.loader
        module = importlib.util.module_from_spec(spec)
        # Register before exec so PEP 563 string annotations on the
        # ``ProofStep`` dataclass resolve against the module namespace.
        sys.modules[spec.name] = module
        spec.loader.exec_module(module)
        return module


merkle = _load_merkle()


# The six reference model_id leaves shipped in ``models/manifest.json``
# (kernel-name-asc order). Locking these makes the golden file double as a
# regression guard on the canonical manifest root.
_MANIFEST_LEAVES = [
    "cf8bf82eed0ab2f34b0737fd7ef05554b8b97fc79fafa8bb3a9186ef781141ad",
    "08ce45dd0a3ff746f2b204709231cef5d4d1c486920703ec9dc539fa82d5560e",
    "e14ead4c6a1e734ab009dc8357a6c96976d7e61b68beb48daff5a5d35224f590",
    "57a258355255d9d2b0ec53b7e0b0a5179f0f763135124cfcdd3bebb510c699dd",
    "c237b989b3d32ea9646e1531456caa05733426f85295156617b117eda16a7aa6",
    "640aaf1894d91a701f4ce1e2b272a86861c9570d774267a5a7f79669a4c94baf",
]


def _curated() -> list[dict[str, Any]]:
    cases: list[dict[str, Any]] = [
        {"leaves": [], "proofIndex": None},  # empty tree
        {"leaves": ["00"], "proofIndex": 0},  # single leaf -> empty proof
        {"leaves": ["00", "01"], "proofIndex": 0},
        {"leaves": ["00", "01"], "proofIndex": 1},
        {"leaves": ["aa", "bb", "cc"], "proofIndex": 0},  # odd (n=3)
        {"leaves": ["aa", "bb", "cc"], "proofIndex": 1},
        {"leaves": ["aa", "bb", "cc"], "proofIndex": 2},
        {"leaves": ["", "ff"], "proofIndex": 0},  # zero-length leaf entry
    ]
    # Powers of two and around them, proof for each index.
    for n in (4, 5, 6, 7, 8, 9, 16, 17):
        leaves = [f"{i:064x}" for i in range(n)]
        for idx in range(n):
            cases.append({"leaves": leaves, "proofIndex": idx})
    # The real manifest leaves with a proof for each kernel.
    for idx in range(len(_MANIFEST_LEAVES)):
        cases.append({"leaves": list(_MANIFEST_LEAVES), "proofIndex": idx})
    return cases


def _random_cases(rng: random.Random, target: int) -> list[dict[str, Any]]:
    cases: list[dict[str, Any]] = []
    while len(cases) < target:
        n = rng.randint(1, 33)
        leaves = []
        for _ in range(n):
            length = rng.choice([0, 1, 4, 16, 32, 32, 64])
            leaves.append(rng.randbytes(length).hex())
        proof_index = rng.randrange(n)
        cases.append({"leaves": leaves, "proofIndex": proof_index})
    return cases


def _golden_for(case: dict[str, Any]) -> dict[str, Any]:
    leaves = [bytes.fromhex(h) for h in case["leaves"]]
    root = merkle.merkle_root(leaves).hex()
    if case["proofIndex"] is None:
        return {"root": root, "proof": None}
    proof = merkle.inclusion_proof(leaves, case["proofIndex"])
    return {"root": root, "proof": [step.to_json() for step in proof]}


def main() -> None:
    rng = random.Random(SEED)
    cases = _curated()
    cases += _random_cases(rng, target=320 - len(cases))
    golden = [_golden_for(c) for c in cases]

    FIXTURES_PATH.write_text(
        json.dumps(cases, indent=2) + "\n",
        encoding="utf-8",
    )
    GOLDEN_PATH.write_text(
        json.dumps(golden, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"wrote {len(cases)} fixtures -> {FIXTURES_PATH}")
    print(f"wrote {len(golden)} golden entries -> {GOLDEN_PATH}")


if __name__ == "__main__":
    main()
