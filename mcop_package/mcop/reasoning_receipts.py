# SPDX-License-Identifier: Apache-2.0
# Copyright (c) 2026 Kevin John Kull (Kuonirad) and KullAILABS MCOP Framework contributors
"""Verifiable reasoning receipts over an append-only Merkle Mountain Range.

Python parity side of ``src/core/reasoningReceipts.ts`` — **byte-identical**
to the TypeScript reference for every receipt, root, and inclusion proof. A
reasoning session is an append-only accumulator over reasoning *claims*; each
claim carries a few-kilobyte receipt that a reader can verify locally against a
published root.

Why a Merkle Mountain Range (MMR) instead of a linear hash chain?
-----------------------------------------------------------------
A linear provenance chain links each event to the previous one by parent hash,
so proving one event belongs to the chain means replaying every event up to it
— ``O(n)`` work and data. An MMR is an append-only accumulator: appending a
claim is ``O(log n)`` and an inclusion proof is a single ``O(log n)`` audit
path. The reader downloads a few kilobytes, not the whole transcript, and
confirms ``claim ∈ session`` against one published root.

Substrate (shared, byte-identical across runtimes)
--------------------------------------------------
* **Claim → leaf entry:** RFC 8785 canonical JSON, SHA-256. This is exactly
  :func:`mcop.canonical_encoding.canonical_digest`, already parity-locked
  against the TypeScript ``canonicalize`` package.
* **Tree:** RFC 6962 leaf/interior hashing with ``0x00``/``0x01`` domain
  separation, reusing :func:`mcop.merkle.hash_leaf` and
  :func:`mcop.merkle.hash_node`. Interior nodes can never be replayed as leaves
  (second-preimage resistance).

Because an MMR whose leaf count is a power of two collapses to a single peak,
its root is bit-for-bit identical to the RFC 6962 ``merkle_root`` over the same
leaves — so this module inherits the existing cross-runtime Merkle parity
guarantees for those sizes.

Trust boundary
--------------
A valid receipt proves exactly one thing: *this claim was committed to a
session whose root is R, and the session has not been altered since.* It does
**not** prove the claim is true, that the reasoning was sound, or that R is a
root you should trust — that last step requires independently anchoring R.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal, Mapping, Optional, Sequence

from . import merkle
from .canonical_encoding import canonical_digest

__all__ = [
    "REASONING_RECEIPT_VERSION",
    "REASONING_RECEIPT_EPOCH",
    "EMPTY_SESSION_ROOT",
    "ProofSide",
    "ProofStep",
    "ReasoningReceipt",
    "ReceiptVerification",
    "MerkleMountainRange",
    "ReasoningSession",
    "is_hex_sha256",
    "leaf_entry_for_claim",
    "verify_inclusion_proof",
    "verify_receipt",
    "receipt_matches_anchor",
]

#: Receipt envelope version. Bump on any wire-format change.
REASONING_RECEIPT_VERSION = "mcop-reasoning-receipt/1.0"

#: Hashing epoch — a self-describing marker of the accumulator construction.
#: Receipts and sessions carry it so a future migration (a different tree shape
#: or hash) is detectable rather than silent: a verifier that does not
#: recognise the epoch must refuse rather than guess.
REASONING_RECEIPT_EPOCH = "mmr-rfc6962-sha256/1"

#: Root of the empty session, ``H()`` (RFC 6962 §2.1).
EMPTY_SESSION_ROOT = merkle.EMPTY_TREE_ROOT.hex()

ProofSide = Literal["left", "right"]

ReceiptReason = Literal[
    "unknown-epoch",
    "claim-leaf-mismatch",
    "receipt-id-mismatch",
    "proof-invalid",
    "malformed",
]


def is_hex_sha256(value: object) -> bool:
    """Return whether ``value`` is a 64-char hex SHA-256 string."""
    if not isinstance(value, str) or len(value) != 64:
        return False
    try:
        int(value, 16)
    except ValueError:
        return False
    return True


def _hash_leaf_hex(entry_hex: str) -> str:
    """``H(0x00 || entry)`` over a 32-byte hex leaf entry → 64-hex node hash."""
    return merkle.hash_leaf(bytes.fromhex(entry_hex)).hex()


def _hash_node_hex(left_hex: str, right_hex: str) -> str:
    """``H(0x01 || left || right)`` over two 64-hex child hashes → 64-hex hash."""
    return merkle.hash_node(bytes.fromhex(left_hex), bytes.fromhex(right_hex)).hex()


def leaf_entry_for_claim(claim: object) -> str:
    """RFC 8785 canonical digest of ``claim`` — its tree leaf entry (64 hex).

    Byte-identical to ``leafEntryForClaim`` in the TypeScript reference and to
    :func:`mcop.canonical_encoding.canonical_digest`.
    """
    return canonical_digest(claim)


def _bag_peaks(peak_hashes: Sequence[str]) -> str:
    """Bag a left→right (height-descending) peak list into the MMR root.

    Right fold::

        bag([p0, p1, ..., pk]) = H(p0, H(p1, ... H(p_{k-1}, pk)))

    A single peak bags to itself, so a power-of-two session's root equals the
    RFC 6962 ``merkle_root`` over the same leaves.
    """
    if not peak_hashes:
        return EMPTY_SESSION_ROOT
    acc = peak_hashes[-1]
    for i in range(len(peak_hashes) - 2, -1, -1):
        acc = _hash_node_hex(peak_hashes[i], acc)
    return acc


@dataclass(frozen=True)
class ProofStep:
    """One level of an inclusion proof.

    ``sibling`` is the hex-encoded SHA-256 of the sibling subtree; ``side``
    says whether it sits to the ``left`` or ``right`` of the running hash while
    folding the proof from the leaf upward.
    """

    sibling: str  # hex-encoded SHA-256
    side: ProofSide

    def to_json(self) -> dict[str, str]:
        return {"sibling": self.sibling, "side": self.side}

    @staticmethod
    def from_json(obj: Mapping[str, str]) -> "ProofStep":
        side = obj["side"]
        if side not in ("left", "right"):
            raise ValueError(f"invalid proof-step side: {side!r}")
        return ProofStep(sibling=obj["sibling"], side=side)  # type: ignore[arg-type]


@dataclass(frozen=True)
class _MmrNode:
    """A perfect-subtree node retained for proof generation."""

    hash: str
    height: int
    size: int  # number of leaves under this node (a power of two)
    left: Optional["_MmrNode"] = None
    right: Optional["_MmrNode"] = None


class MerkleMountainRange:
    """Append-only Merkle Mountain Range.

    Retains the node objects so inclusion proofs for any past leaf can be
    generated in ``O(log n)`` without the leaf set. Memory is ``O(n)`` —
    appropriate for a reasoning session (thousands of claims), not a chain of
    millions.
    """

    def __init__(self) -> None:
        # Peaks, left → right, strictly descending height.
        self._peaks: list[_MmrNode] = []
        self._leaf_count = 0

    def append(self, leaf_entry_hex: str) -> int:
        """Append a 32-byte hex leaf entry; return its zero-based leaf index."""
        if not is_hex_sha256(leaf_entry_hex):
            raise ValueError(
                f"MerkleMountainRange.append: expected 64-hex leaf entry, got {leaf_entry_hex!r}"
            )
        index = self._leaf_count
        self._leaf_count += 1

        node = _MmrNode(hash=_hash_leaf_hex(leaf_entry_hex), height=0, size=1)
        # Merge equal-height peaks (carry propagation, like a binary increment).
        while self._peaks and self._peaks[-1].height == node.height:
            left = self._peaks.pop()
            node = _MmrNode(
                hash=_hash_node_hex(left.hash, node.hash),
                height=left.height + 1,
                size=left.size + node.size,
                left=left,
                right=node,
            )
        self._peaks.append(node)
        return index

    @property
    def size(self) -> int:
        return self._leaf_count

    def peak_hashes(self) -> list[str]:
        """Peak hashes, left → right."""
        return [p.hash for p in self._peaks]

    def root(self) -> str:
        """Current bagged root."""
        return _bag_peaks(self.peak_hashes())

    def proof(self, leaf_index: int) -> list[ProofStep]:
        """Build the inclusion proof (leaf → root) for ``leaf_index``.

        The audit path within the leaf's mountain, then the steps that bag the
        remaining peaks.
        """
        if not isinstance(leaf_index, int) or isinstance(leaf_index, bool):
            raise ValueError(f"leaf index must be an int, got {leaf_index!r}")
        if leaf_index < 0 or leaf_index >= self._leaf_count:
            raise IndexError(
                f"leaf index {leaf_index} out of range for {self._leaf_count} leaves"
            )

        # 1. Locate the peak whose mountain contains this leaf.
        offset = 0
        peak_idx = -1
        for i, peak in enumerate(self._peaks):
            if leaf_index < offset + peak.size:
                peak_idx = i
                break
            offset += peak.size
        peak = self._peaks[peak_idx]

        # 2. Walk down the mountain to the leaf, collecting siblings top → down,
        #    then reverse to leaf → up.
        downward: list[ProofStep] = []
        node = peak
        local_index = leaf_index - offset  # index within this perfect subtree
        while node.height > 0:
            left = node.left
            right = node.right
            assert left is not None and right is not None
            if local_index < left.size:
                downward.append(ProofStep(sibling=right.hash, side="right"))
                node = left
            else:
                downward.append(ProofStep(sibling=left.hash, side="left"))
                node = right
                local_index -= left.size
        steps: list[ProofStep] = list(reversed(downward))

        # 3. Bag the remaining peaks. The bagging spine is a right fold, so the
        #    peaks to the right of ours collapse into one sibling on the right,
        #    and each peak to the left is a sibling on the left.
        peak_hashes = self.peak_hashes()
        if peak_idx < len(peak_hashes) - 1:
            right_bag = _bag_peaks(peak_hashes[peak_idx + 1 :])
            steps.append(ProofStep(sibling=right_bag, side="right"))
        for i in range(peak_idx - 1, -1, -1):
            steps.append(ProofStep(sibling=peak_hashes[i], side="left"))
        return steps


@dataclass(frozen=True)
class ReasoningReceipt:
    """A verifiable reasoning receipt.

    Self-contained: a reader needs only the receipt and the published root to
    confirm ``claim ∈ session``.
    """

    claim: Any
    leaf_entry: str
    leaf_index: int
    size: int
    proof: tuple[ProofStep, ...]
    root: str
    receipt_id: str
    version: str = REASONING_RECEIPT_VERSION
    epoch: str = REASONING_RECEIPT_EPOCH

    def to_json(self) -> dict[str, Any]:
        """Serialise with keys in the canonical wire order.

        Order: version, epoch, claim, leafEntry, leafIndex, size, proof, root,
        receiptId — matching the TypeScript receipt object.
        """
        return {
            "version": self.version,
            "epoch": self.epoch,
            "claim": self.claim,
            "leafEntry": self.leaf_entry,
            "leafIndex": self.leaf_index,
            "size": self.size,
            "proof": [step.to_json() for step in self.proof],
            "root": self.root,
            "receiptId": self.receipt_id,
        }

    @staticmethod
    def from_json(obj: Mapping[str, Any]) -> "ReasoningReceipt":
        proof = tuple(ProofStep.from_json(s) for s in obj.get("proof", []))
        return ReasoningReceipt(
            claim=obj["claim"],
            leaf_entry=obj["leafEntry"],
            leaf_index=obj["leafIndex"],
            size=obj["size"],
            proof=proof,
            root=obj["root"],
            receipt_id=obj["receiptId"],
            version=obj.get("version", REASONING_RECEIPT_VERSION),
            epoch=obj.get("epoch", REASONING_RECEIPT_EPOCH),
        )


@dataclass(frozen=True)
class ReceiptVerification:
    """Outcome of verifying a receipt. ``reason`` is present only when invalid."""

    valid: bool
    reason: Optional[ReceiptReason] = None


def _receipt_id_for(
    *,
    version: str,
    epoch: str,
    claim: Any,
    leaf_entry: str,
    leaf_index: int,
    size: int,
    proof: Sequence[ProofStep],
    root: str,
) -> str:
    """Canonical digest of a receipt body (everything except ``receipt_id``).

    Keys mirror the TypeScript ``receiptIdFor`` body exactly. RFC 8785 sorts
    keys, so insertion order is irrelevant to the resulting digest.
    """
    body = {
        "version": version,
        "epoch": epoch,
        "claim": claim,
        "leafEntry": leaf_entry,
        "leafIndex": leaf_index,
        "size": size,
        "proof": [{"sibling": s.sibling, "side": s.side} for s in proof],
        "root": root,
    }
    return canonical_digest(body)


def verify_inclusion_proof(
    leaf_entry_hex: str,
    proof: Sequence[ProofStep],
    root_hex: str,
) -> bool:
    """Fold an inclusion proof from ``leaf_entry_hex`` and return whether it
    reconstructs ``root_hex``.

    A malformed step makes the proof invalid rather than raising. This is the
    entire trust-critical surface a reader runs locally.
    """
    if not is_hex_sha256(leaf_entry_hex) or not is_hex_sha256(root_hex):
        return False
    h = _hash_leaf_hex(leaf_entry_hex)
    for step in proof:
        if not is_hex_sha256(step.sibling):
            return False
        if step.side == "left":
            h = _hash_node_hex(step.sibling, h)
        elif step.side == "right":
            h = _hash_node_hex(h, step.sibling)
        else:
            return False
    return h == root_hex


def verify_receipt(receipt: ReasoningReceipt | Mapping[str, Any]) -> ReceiptVerification:
    """Verify a receipt end to end.

    The claim hashes to the recorded leaf, the receipt body is untampered, and
    the proof reconstructs the root. Returns a :class:`ReceiptVerification`.

    Order of checks (cheapest structural first, the Merkle fold last):
    malformed → unknown-epoch → claim-leaf-mismatch → receipt-id-mismatch →
    proof-invalid → valid.

    Accepts either a :class:`ReasoningReceipt` or a JSON mapping (as parsed
    from a bundle) so verification matches the TypeScript ``verifyReceipt``.
    """
    if isinstance(receipt, ReasoningReceipt):
        receipt = receipt.to_json()

    if not isinstance(receipt, Mapping):
        return ReceiptVerification(False, "malformed")

    version = receipt.get("version")
    epoch = receipt.get("epoch")
    claim = receipt.get("claim")
    leaf_entry = receipt.get("leafEntry")
    leaf_index = receipt.get("leafIndex")
    size = receipt.get("size")
    proof_raw = receipt.get("proof")
    root = receipt.get("root")
    receipt_id = receipt.get("receiptId")

    if (
        version != REASONING_RECEIPT_VERSION
        or not isinstance(leaf_entry, str)
        or not isinstance(root, str)
        or not isinstance(proof_raw, (list, tuple))
        or not isinstance(leaf_index, int)
        or isinstance(leaf_index, bool)
        or not isinstance(size, int)
        or isinstance(size, bool)
        or not isinstance(receipt_id, str)
    ):
        return ReceiptVerification(False, "malformed")

    try:
        proof = tuple(ProofStep.from_json(s) for s in proof_raw)
    except (KeyError, ValueError, TypeError):
        return ReceiptVerification(False, "malformed")

    if epoch != REASONING_RECEIPT_EPOCH:
        return ReceiptVerification(False, "unknown-epoch")

    if leaf_entry_for_claim(claim) != leaf_entry:
        return ReceiptVerification(False, "claim-leaf-mismatch")

    recomputed = _receipt_id_for(
        version=version,
        epoch=epoch,
        claim=claim,
        leaf_entry=leaf_entry,
        leaf_index=leaf_index,
        size=size,
        proof=proof,
        root=root,
    )
    if recomputed != receipt_id:
        return ReceiptVerification(False, "receipt-id-mismatch")

    if not verify_inclusion_proof(leaf_entry, proof, root):
        return ReceiptVerification(False, "proof-invalid")

    return ReceiptVerification(True)


def receipt_matches_anchor(receipt: ReasoningReceipt, anchored_root: str) -> bool:
    """Whether a receipt's root matches an independently anchored root.

    This is the step that turns "internally consistent" into "trustworthy".
    """
    return is_hex_sha256(anchored_root) and receipt.root == anchored_root


class ReasoningSession:
    """A reasoning session: append claims, then issue a verifiable receipt.

    The accumulator is append-only, so receipts are anchored to the session
    size at issue time. Issue receipts after the claims they should witness are
    in.
    """

    def __init__(self, title: Optional[str] = None) -> None:
        self._title = title
        self._mmr = MerkleMountainRange()
        self._claims: list[Any] = []

    def add_claim(self, claim: Any) -> int:
        """Append a claim; return its leaf index."""
        self._claims.append(claim)
        return self._mmr.append(leaf_entry_for_claim(claim))

    @property
    def size(self) -> int:
        return self._mmr.size

    @property
    def title(self) -> Optional[str]:
        return self._title

    def root(self) -> str:
        """Current root over all appended claims."""
        return self._mmr.root()

    def receipt_for(self, leaf_index: int) -> ReasoningReceipt:
        """Issue a verifiable receipt for the claim at ``leaf_index``."""
        if not isinstance(leaf_index, int) or isinstance(leaf_index, bool):
            raise ValueError(f"leaf index must be an int, got {leaf_index!r}")
        if leaf_index < 0 or leaf_index >= len(self._claims):
            raise IndexError(
                f"leaf index {leaf_index} out of range for {len(self._claims)} claims"
            )
        claim = self._claims[leaf_index]
        leaf_entry = leaf_entry_for_claim(claim)
        proof = tuple(self._mmr.proof(leaf_index))
        root = self._mmr.root()
        size = self._mmr.size
        receipt_id = _receipt_id_for(
            version=REASONING_RECEIPT_VERSION,
            epoch=REASONING_RECEIPT_EPOCH,
            claim=claim,
            leaf_entry=leaf_entry,
            leaf_index=leaf_index,
            size=size,
            proof=proof,
            root=root,
        )
        return ReasoningReceipt(
            claim=claim,
            leaf_entry=leaf_entry,
            leaf_index=leaf_index,
            size=size,
            proof=proof,
            root=root,
            receipt_id=receipt_id,
        )

    def export(self) -> dict[str, Any]:
        """Export the whole session — claims, receipts, and root — as a bundle.

        Bundle keys: version, epoch, title? (only when set), root, size,
        claims, receipts.
        """
        receipts = [self.receipt_for(i).to_json() for i in range(len(self._claims))]
        bundle: dict[str, Any] = {
            "version": REASONING_RECEIPT_VERSION,
            "epoch": REASONING_RECEIPT_EPOCH,
        }
        if self._title is not None:
            bundle["title"] = self._title
        bundle["root"] = self._mmr.root()
        bundle["size"] = self._mmr.size
        bundle["claims"] = list(self._claims)
        bundle["receipts"] = receipts
        return bundle
