"""Proof-of-Useful-Work (PoUW) receipts for accelerated kernel runs.

A PoUW receipt is the cryptographic answer to *"prove that this useful
work was performed with an authentic, on-chain-anchored model."* It binds
three independent commitments:

1. **The work** — ``work_merkle_root`` is the
   ``AcceleratorProvenance.merkleRoot`` already produced for every
   accelerated dispatch (a digest over the provenance envelope + payload).
2. **The model identity** — ``model_id = SHA-256(model bytes)`` of the
   ONNX kernel that executed the work.
3. **Model authenticity** — a compact RFC 6962 Merkle ``inclusion_proof``
   that ``model_id`` is a leaf of the model manifest whose head is
   ``manifest_root``.

A verifier checks the inclusion proof reproduces ``manifest_root`` and
that ``manifest_root`` equals the **on-chain anchored root** resolved from
an :class:`OnChainRootRegistry`. Both must hold: a valid proof against an
*unanchored* root proves nothing about the canonical model set, and an
anchored root with a broken proof proves nothing about *this* model.

The receipt is itself tamper-evident: ``receipt_id`` is the RFC 8785
canonical digest of every other field, so any post-hoc edit invalidates
it. ``receipt_id`` is byte-identical to the TypeScript
``buildModelPoUWReceipt`` output for the same logical receipt.
"""

from __future__ import annotations

import datetime as _dt
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Mapping, Sequence

from . import merkle, model_manifest
from .canonical_encoding import canonical_digest

__all__ = [
    "POUW_RECEIPT_VERSION",
    "ANCHOR_ENV_VAR",
    "DEFAULT_ANCHOR_FILENAME",
    "PoUWReceipt",
    "OnChainRootRegistry",
    "build_receipt",
    "verify_receipt",
]

POUW_RECEIPT_VERSION = "mcop-pouw-receipt/1.0"
ANCHOR_ENV_VAR = "MCOP_MODEL_MANIFEST_ROOT"
DEFAULT_ANCHOR_FILENAME = "anchored_root.json"


@dataclass(frozen=True)
class PoUWReceipt:
    kernel: str
    canonical_op: str
    model_id: str
    manifest_root: str
    inclusion_proof: tuple[merkle.ProofStep, ...]
    work_merkle_root: str
    verified_device: str
    device: str
    duration_ms: float
    timestamp: str
    receipt_id: str
    version: str = POUW_RECEIPT_VERSION

    def to_json(self) -> dict[str, Any]:
        return {
            "version": self.version,
            "kernel": self.kernel,
            "canonicalOp": self.canonical_op,
            "modelId": self.model_id,
            "manifestRoot": self.manifest_root,
            "inclusionProof": [step.to_json() for step in self.inclusion_proof],
            "workMerkleRoot": self.work_merkle_root,
            "verifiedDevice": self.verified_device,
            "device": self.device,
            "durationMs": self.duration_ms,
            "timestamp": self.timestamp,
            "receiptId": self.receipt_id,
        }

    @staticmethod
    def from_json(obj: Mapping[str, Any]) -> "PoUWReceipt":
        proof = tuple(merkle.ProofStep.from_json(s) for s in obj.get("inclusionProof", []))
        return PoUWReceipt(
            kernel=obj["kernel"],
            canonical_op=obj["canonicalOp"],
            model_id=obj["modelId"],
            manifest_root=obj["manifestRoot"],
            inclusion_proof=proof,
            work_merkle_root=obj["workMerkleRoot"],
            verified_device=obj["verifiedDevice"],
            device=obj["device"],
            duration_ms=float(obj["durationMs"]),
            timestamp=obj["timestamp"],
            receipt_id=obj["receiptId"],
            version=obj.get("version", POUW_RECEIPT_VERSION),
        )


def _receipt_body(
    *,
    kernel: str,
    canonical_op: str,
    model_id: str,
    manifest_root: str,
    inclusion_proof: Sequence[merkle.ProofStep],
    work_merkle_root: str,
    verified_device: str,
    device: str,
    duration_ms: float,
    timestamp: str,
) -> dict[str, Any]:
    """Canonical body whose digest is the ``receipt_id``.

    Keys mirror the TypeScript ``buildModelPoUWReceipt`` body exactly so
    the resulting ``receipt_id`` is byte-identical across runtimes.
    """
    return {
        "type": "MCOP_POUW_RECEIPT",
        "version": POUW_RECEIPT_VERSION,
        "kernel": kernel,
        "canonicalOp": canonical_op,
        "modelId": model_id,
        "manifestRoot": manifest_root,
        "inclusionProof": [step.to_json() for step in inclusion_proof],
        "workMerkleRoot": work_merkle_root,
        "verifiedDevice": verified_device,
        "device": device,
        "durationMs": duration_ms,
        "timestamp": timestamp,
    }


def build_receipt(
    manifest: Mapping[str, Any],
    *,
    kernel: str,
    canonical_op: str,
    work_merkle_root: str,
    verified_device: str,
    device: str,
    duration_ms: float,
    timestamp: str | None = None,
) -> PoUWReceipt:
    """Mint a PoUW receipt for a kernel run against ``manifest``."""
    model_id = model_manifest.model_id_of(manifest, kernel)
    manifest_root_hex = model_manifest.manifest_root(manifest)
    proof = tuple(model_manifest.inclusion_proof_for_kernel(manifest, kernel))
    iso_ts = timestamp or _dt.datetime.now(tz=_dt.timezone.utc).isoformat().replace("+00:00", "Z")

    body = _receipt_body(
        kernel=kernel,
        canonical_op=canonical_op,
        model_id=model_id,
        manifest_root=manifest_root_hex,
        inclusion_proof=proof,
        work_merkle_root=work_merkle_root,
        verified_device=verified_device,
        device=device,
        duration_ms=duration_ms,
        timestamp=iso_ts,
    )
    receipt_id = canonical_digest(body)
    return PoUWReceipt(
        kernel=kernel,
        canonical_op=canonical_op,
        model_id=model_id,
        manifest_root=manifest_root_hex,
        inclusion_proof=proof,
        work_merkle_root=work_merkle_root,
        verified_device=verified_device,
        device=device,
        duration_ms=duration_ms,
        timestamp=iso_ts,
        receipt_id=receipt_id,
    )


def verify_receipt(receipt: PoUWReceipt, on_chain_root: str | None) -> model_manifest.VerifyResult:
    """Verify a receipt against the trusted on-chain anchored root.

    Order of checks is deliberate — cheapest structural checks first, the
    Merkle fold last:

    1. ``receipt_id`` reproduces the canonical body (no tampering).
    2. an on-chain root is available and equals ``manifest_root``.
    3. the inclusion proof folds ``model_id`` back to ``manifest_root``.
    """
    body = _receipt_body(
        kernel=receipt.kernel,
        canonical_op=receipt.canonical_op,
        model_id=receipt.model_id,
        manifest_root=receipt.manifest_root,
        inclusion_proof=receipt.inclusion_proof,
        work_merkle_root=receipt.work_merkle_root,
        verified_device=receipt.verified_device,
        device=receipt.device,
        duration_ms=receipt.duration_ms,
        timestamp=receipt.timestamp,
    )
    if canonical_digest(body) != receipt.receipt_id:
        return model_manifest.VerifyResult(False, "receipt_id mismatch — receipt has been tampered with")

    if on_chain_root is None:
        return model_manifest.VerifyResult(False, "no on-chain anchored root available to verify against")
    if not _is_hex_sha256(receipt.manifest_root):
        return model_manifest.VerifyResult(False, "receipt manifest_root is not a valid SHA-256")
    if receipt.manifest_root.lower() != on_chain_root.lower():
        return model_manifest.VerifyResult(
            False,
            f"manifest root {receipt.manifest_root} is not anchored on-chain (anchor={on_chain_root})",
        )

    if not _is_hex_sha256(receipt.model_id):
        return model_manifest.VerifyResult(False, "receipt model_id is not a valid SHA-256")
    ok = merkle.verify_proof(
        bytes.fromhex(receipt.model_id),
        receipt.inclusion_proof,
        bytes.fromhex(receipt.manifest_root),
    )
    if not ok:
        return model_manifest.VerifyResult(False, "inclusion proof does not reproduce the manifest root")
    return model_manifest.VerifyResult(True, "")


class OnChainRootRegistry:
    """Resolve the trusted model-manifest root anchored "on-chain".

    Resolution order (first hit wins):

    1. an explicit ``override`` passed to the constructor;
    2. the ``MCOP_MODEL_MANIFEST_ROOT`` environment variable;
    3. the ``root`` field of a committed anchor file
       (``models/anchored_root.json`` by default).

    The default is a *pinned* anchor checked into the repository. In a
    production deployment, point ``anchor_path`` at a file your chain
    indexer rewrites from the canonical contract storage slot / a
    transparency-log signed tree head, or subclass and override
    :meth:`resolve`. This class deliberately performs **no** network or
    RPC calls — anchoring policy is the operator's to wire in.
    """

    def __init__(
        self,
        *,
        override: str | None = None,
        anchor_path: Path | str | None = None,
        env: Mapping[str, str] | None = None,
    ) -> None:
        self._override = override
        self._anchor_path = Path(anchor_path) if anchor_path is not None else None
        self._env = env if env is not None else os.environ

    def resolve(self) -> str | None:
        if self._override and _is_hex_sha256(self._override):
            return self._override.lower()
        env_root = self._env.get(ANCHOR_ENV_VAR, "").strip()
        if _is_hex_sha256(env_root):
            return env_root.lower()
        if self._anchor_path is not None and self._anchor_path.is_file():
            return self._root_from_anchor_file(self._anchor_path)
        return None

    @staticmethod
    def _root_from_anchor_file(path: Path) -> str | None:
        import json

        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return None
        root = data.get("root") if isinstance(data, Mapping) else None
        return root.lower() if _is_hex_sha256(root) else None


def _is_hex_sha256(value: object) -> bool:
    if not isinstance(value, str) or len(value) != 64:
        return False
    try:
        int(value, 16)
    except ValueError:
        return False
    return True
