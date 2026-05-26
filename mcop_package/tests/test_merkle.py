"""Unit tests for the RFC 6962 Merkle tree (:mod:`mcop.merkle`)."""

from __future__ import annotations

import hashlib

import pytest

from mcop.merkle import (
    EMPTY_TREE_ROOT,
    ProofStep,
    hash_leaf,
    hash_node,
    inclusion_proof,
    largest_power_of_two_below,
    merkle_root,
    verify_proof,
)


def _e(s: str) -> bytes:
    return s.encode("utf-8")


class TestLeafNodeHashing:
    def test_hash_leaf_prefixes_0x00(self) -> None:
        entry = _e("abc")
        assert hash_leaf(entry) == hashlib.sha256(b"\x00" + entry).digest()

    def test_hash_node_prefixes_0x01(self) -> None:
        left, right = hash_leaf(_e("a")), hash_leaf(_e("b"))
        assert hash_node(left, right) == hashlib.sha256(b"\x01" + left + right).digest()

    def test_leaf_and_node_domains_never_collide(self) -> None:
        left, right = hash_leaf(_e("a")), hash_leaf(_e("b"))
        assert hash_leaf(left + right) != hash_node(left, right)


class TestMerkleRoot:
    def test_empty_tree_is_sha256_of_empty(self) -> None:
        assert merkle_root([]) == EMPTY_TREE_ROOT == hashlib.sha256(b"").digest()

    def test_single_leaf(self) -> None:
        assert merkle_root([_e("x")]) == hash_leaf(_e("x"))

    def test_two_leaves(self) -> None:
        a, b = _e("a"), _e("b")
        assert merkle_root([a, b]) == hash_node(hash_leaf(a), hash_leaf(b))

    def test_three_leaves_split_at_k2(self) -> None:
        a, b, c = _e("a"), _e("b"), _e("c")
        left = hash_node(hash_leaf(a), hash_leaf(b))
        assert merkle_root([a, b, c]) == hash_node(left, hash_leaf(c))

    def test_order_sensitive(self) -> None:
        assert merkle_root([_e("a"), _e("b")]) != merkle_root([_e("b"), _e("a")])


class TestLargestPowerOfTwoBelow:
    @pytest.mark.parametrize(
        "n,expected",
        [(2, 1), (3, 2), (4, 2), (5, 4), (8, 4), (9, 8), (16, 8), (17, 16)],
    )
    def test_values(self, n: int, expected: int) -> None:
        assert largest_power_of_two_below(n) == expected

    @pytest.mark.parametrize("n", [0, 1])
    def test_raises_below_two(self, n: int) -> None:
        with pytest.raises(ValueError):
            largest_power_of_two_below(n)


class TestInclusionProofRoundTrip:
    @pytest.mark.parametrize("n", [1, 2, 3, 4, 5, 6, 7, 8, 13, 16, 17])
    def test_every_leaf_proves_inclusion(self, n: int) -> None:
        leaves = [_e(f"leaf-{i}") for i in range(n)]
        root = merkle_root(leaves)
        for i in range(n):
            proof = inclusion_proof(leaves, i)
            assert verify_proof(leaves[i], proof, root)

    def test_single_leaf_proof_is_empty(self) -> None:
        assert inclusion_proof([_e("only")], 0) == []

    def test_raises_on_empty_and_out_of_range(self) -> None:
        with pytest.raises(IndexError):
            inclusion_proof([], 0)
        with pytest.raises(IndexError):
            inclusion_proof([_e("a")], 1)
        with pytest.raises(IndexError):
            inclusion_proof([_e("a")], -1)


class TestVerifyProofRejectsTampering:
    def setup_method(self) -> None:
        self.leaves = [_e(f"m-{i}") for i in range(6)]
        self.root = merkle_root(self.leaves)
        self.index = 2
        self.proof = inclusion_proof(self.leaves, self.index)

    def test_rejects_wrong_entry(self) -> None:
        assert not verify_proof(_e("nope"), self.proof, self.root)

    def test_rejects_tampered_sibling(self) -> None:
        bad = [ProofStep(sibling="f" * 64, side=self.proof[0].side)] + list(self.proof[1:])
        assert not verify_proof(self.leaves[self.index], bad, self.root)

    def test_rejects_flipped_side(self) -> None:
        first = self.proof[0]
        flipped_side = "right" if first.side == "left" else "left"
        bad = [ProofStep(sibling=first.sibling, side=flipped_side)] + list(self.proof[1:])
        assert not verify_proof(self.leaves[self.index], bad, self.root)

    def test_rejects_malformed_hex(self) -> None:
        assert not verify_proof(self.leaves[self.index], [ProofStep(sibling="zz", side="left")], self.root)


class TestProofStepJson:
    def test_round_trip(self) -> None:
        step = ProofStep(sibling="a" * 64, side="left")
        assert ProofStep.from_json(step.to_json()) == step

    def test_rejects_bad_side(self) -> None:
        with pytest.raises(ValueError):
            ProofStep.from_json({"sibling": "a" * 64, "side": "up"})

    def test_rejects_bad_sibling(self) -> None:
        with pytest.raises(ValueError):
            ProofStep.from_json({"sibling": "xyz", "side": "left"})
