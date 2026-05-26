"""RFC 6962 binary Merkle tree over raw byte leaves.

This is the *cryptographic substrate* for the Merkle-rooted model
manifest (:mod:`mcop.model_manifest`) and the Proof-of-Useful-Work
receipts (:mod:`mcop.pouw`). It is **byte-identical** to the TypeScript
implementation in ``src/provenance/merkleTree.ts`` because both operate
purely on byte strings — there is no JSON, float, or string-encoding
ambiguity to reconcile (unlike :mod:`mcop.canonical_encoding`, which
needs RFC 8785 to agree across runtimes).

Why RFC 6962 (the Certificate Transparency tree) rather than the flat
"digest of the sorted leaf list" used by the hosted ledger?

1. **Second-preimage resistance.** Leaves are hashed with a ``0x00``
   prefix and interior nodes with a ``0x01`` prefix, so an attacker can
   never present an interior node as if it were a leaf (the classic
   Merkle second-preimage attack). The flat-list digest has no notion of
   internal nodes and therefore admits no compact inclusion proof at all.
2. **Compact O(log n) inclusion proofs.** A receipt carries only the
   audit path (one sibling hash per tree level), not the entire leaf set,
   so a verifier can confirm ``model_id ∈ manifest`` against an on-chain
   root without downloading every model digest.

Specification (RFC 6962 §2.1), with ``H = SHA-256``::

    MTH({})        = H()                            # empty tree
    MTH({d0})      = H(0x00 || d0)                  # single leaf
    MTH(D[0:n])    = H(0x01 || MTH(D[0:k]) || MTH(D[k:n]))   # n > 1

where ``k`` is the largest power of two strictly less than ``n``. The
audit path is defined symmetrically (RFC 6962 §2.1.1). Each proof step
is self-describing — it records whether the sibling sits on the ``left``
or ``right`` — so a verifier can fold the path back to the root without
knowing the leaf index or total leaf count.
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass
from typing import Literal, Sequence

__all__ = [
    "LEAF_PREFIX",
    "NODE_PREFIX",
    "EMPTY_TREE_ROOT",
    "ProofStep",
    "hash_leaf",
    "hash_node",
    "merkle_root",
    "inclusion_proof",
    "verify_proof",
    "largest_power_of_two_below",
]

# Domain-separation prefixes (RFC 6962). A leaf can never collide with an
# interior node because their preimages start with different bytes.
LEAF_PREFIX = b"\x00"
NODE_PREFIX = b"\x01"

Side = Literal["left", "right"]


@dataclass(frozen=True)
class ProofStep:
    """One level of a Merkle audit path.

    ``sibling`` is the hex-encoded hash of the sibling subtree at this
    level; ``side`` says whether that sibling sits to the ``left`` or the
    ``right`` of the running hash. Verification folds the path from the
    leaf upward::

        side == "left"  -> h = hash_node(sibling, h)
        side == "right" -> h = hash_node(h, sibling)
    """

    sibling: str  # hex-encoded SHA-256
    side: Side

    def to_json(self) -> dict[str, str]:
        return {"sibling": self.sibling, "side": self.side}

    @staticmethod
    def from_json(obj: dict[str, str]) -> "ProofStep":
        side = obj["side"]
        if side not in ("left", "right"):
            raise ValueError(f"invalid proof-step side: {side!r}")
        sibling = obj["sibling"]
        if not _is_hex_sha256(sibling):
            raise ValueError(f"invalid proof-step sibling: {sibling!r}")
        return ProofStep(sibling=sibling, side=side)  # type: ignore[arg-type]


def hash_leaf(entry: bytes) -> bytes:
    """Return ``H(0x00 || entry)`` — the Merkle hash of a single leaf."""
    return hashlib.sha256(LEAF_PREFIX + entry).digest()


def hash_node(left: bytes, right: bytes) -> bytes:
    """Return ``H(0x01 || left || right)`` — the hash of an interior node."""
    return hashlib.sha256(NODE_PREFIX + left + right).digest()


# Root of the empty tree, ``H()`` (RFC 6962 §2.1). Exposed so callers can
# detect the degenerate "no models" manifest explicitly rather than by a
# magic constant.
EMPTY_TREE_ROOT = hashlib.sha256(b"").digest()


def largest_power_of_two_below(n: int) -> int:
    """Largest power of two strictly less than ``n`` (``n >= 2``)."""
    if n < 2:
        raise ValueError("largest_power_of_two_below requires n >= 2")
    k = 1
    while k << 1 < n:
        k <<= 1
    return k


def merkle_root(leaves: Sequence[bytes]) -> bytes:
    """Compute the RFC 6962 Merkle tree head over ``leaves``.

    ``leaves`` are the raw leaf *entries* (e.g. 32-byte ``model_id``
    values), **not** pre-hashed. Returns the 32-byte root digest.
    """
    n = len(leaves)
    if n == 0:
        return EMPTY_TREE_ROOT
    if n == 1:
        return hash_leaf(leaves[0])
    k = largest_power_of_two_below(n)
    return hash_node(merkle_root(leaves[:k]), merkle_root(leaves[k:]))


def inclusion_proof(leaves: Sequence[bytes], index: int) -> list[ProofStep]:
    """Build the audit path proving ``leaves[index]`` is in the tree.

    The returned list is ordered from the leaf level upward toward the
    root, exactly as :func:`verify_proof` consumes it.
    """
    n = len(leaves)
    if n == 0:
        raise IndexError("inclusion_proof on empty tree")
    if not 0 <= index < n:
        raise IndexError(f"leaf index {index} out of range for {n} leaves")
    if n == 1:
        return []
    k = largest_power_of_two_below(n)
    if index < k:
        # Target is in the left subtree; its sibling is the right subtree.
        sub = inclusion_proof(leaves[:k], index)
        sub.append(ProofStep(sibling=merkle_root(leaves[k:]).hex(), side="right"))
        return sub
    # Target is in the right subtree; its sibling is the left subtree.
    sub = inclusion_proof(leaves[k:], index - k)
    sub.append(ProofStep(sibling=merkle_root(leaves[:k]).hex(), side="left"))
    return sub


def verify_proof(entry: bytes, proof: Sequence[ProofStep], root: bytes) -> bool:
    """Return ``True`` iff ``entry`` is provably a leaf under ``root``.

    ``entry`` is the raw leaf entry (it is hashed internally with the
    leaf prefix). The proof is folded from the leaf upward; any malformed
    step hex makes the proof invalid rather than raising.
    """
    h = hash_leaf(entry)
    for step in proof:
        try:
            sibling = bytes.fromhex(step.sibling)
        except ValueError:
            return False
        if len(sibling) != 32:
            return False
        if step.side == "left":
            h = hash_node(sibling, h)
        elif step.side == "right":
            h = hash_node(h, sibling)
        else:  # pragma: no cover - guarded by ProofStep construction
            return False
    return h == root


def _is_hex_sha256(value: object) -> bool:
    if not isinstance(value, str) or len(value) != 64:
        return False
    try:
        int(value, 16)
    except ValueError:
        return False
    return True
