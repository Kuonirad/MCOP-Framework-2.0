"""Merkle-rooted model manifest for ``models/mcop_*.onnx``.

A *model manifest* pins the exact bytes of every shipped ONNX kernel
into a single tamper-evident structure:

* ``model_id = SHA-256(model bytes)`` is the cryptographic identity of
  one ONNX file. It changes iff a single byte of the model changes.
* The six ``model_id`` values are the leaves of an RFC 6962 Merkle tree
  (:mod:`mcop.merkle`); the tree head is the manifest's ``merkle.root``.
* Leaves are ordered **lexicographically by kernel name** so the root is
  a deterministic function of the model set, independent of filesystem
  iteration order or JSON key ordering.

The root is what gets anchored on-chain (see :mod:`mcop.pouw`): a single
32-byte commitment to every model the framework will execute. A
Proof-of-Useful-Work receipt then carries a compact Merkle proof that
the ``model_id`` it ran under is a leaf of that committed root.

Schema ``mcop-cuda-kernel-manifest/2.0`` (v1.0 stored a per-kernel
``merkle_root`` that was really a single-leaf canonical digest and had no
tree-wide root — v2.0 replaces it with a real tree).
"""

from __future__ import annotations

import datetime as _dt
import hashlib
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Mapping, Sequence

from . import merkle

__all__ = [
    "MANIFEST_VERSION",
    "MERKLE_ALGORITHM",
    "LEAF_ORDER",
    "ManifestError",
    "VerifyResult",
    "model_id_for_bytes",
    "model_id_for_file",
    "ordered_kernel_names",
    "manifest_root",
    "build_manifest",
    "load_manifest",
    "verify_manifest",
    "model_id_of",
    "leaf_index_of",
    "inclusion_proof_for_kernel",
]

MANIFEST_VERSION = "mcop-cuda-kernel-manifest/2.0"
MERKLE_ALGORITHM = "rfc6962-sha256"
LEAF_ORDER = "kernel-name-asc"


class ManifestError(ValueError):
    """Raised when a manifest is structurally invalid or fails to verify."""


@dataclass(frozen=True)
class VerifyResult:
    valid: bool
    reason: str = ""

    def __bool__(self) -> bool:  # ergonomic: ``if verify_manifest(...):``
        return self.valid


def model_id_for_bytes(data: bytes) -> str:
    """``model_id = SHA-256(model bytes)`` as a lowercase hex string."""
    return hashlib.sha256(data).hexdigest()


def model_id_for_file(path: Path) -> str:
    """Compute the ``model_id`` of an ONNX file from its bytes on disk."""
    return model_id_for_bytes(Path(path).read_bytes())


def ordered_kernel_names(names: Sequence[str]) -> list[str]:
    """Canonical leaf ordering: lexicographic by kernel name."""
    return sorted(names)


def _leaves_from_model_ids(model_ids_in_order: Sequence[str]) -> list[bytes]:
    leaves: list[bytes] = []
    for mid in model_ids_in_order:
        if not _is_hex_sha256(mid):
            raise ManifestError(f"model_id is not a 64-char hex SHA-256: {mid!r}")
        leaves.append(bytes.fromhex(mid))
    return leaves


def manifest_root(manifest: Mapping[str, Any]) -> str:
    """Return the manifest's declared Merkle root (hex)."""
    merkle_block = manifest.get("merkle")
    if not isinstance(merkle_block, Mapping):
        raise ManifestError("manifest has no 'merkle' block")
    root = merkle_block.get("root")
    if not _is_hex_sha256(root):
        raise ManifestError("manifest 'merkle.root' is not a 64-char hex SHA-256")
    return root


def build_manifest(
    files: Mapping[str, Path],
    *,
    backend: str,
    fp_variant: str,
    seed: int,
    exported_at: str | None = None,
) -> dict[str, Any]:
    """Build a v2.0 manifest from ``{kernel_name: path}``.

    The Merkle ``root`` and ``leaves`` are a pure function of the model
    bytes + ordering, so they are byte-stable across runs even though
    ``exported_at`` is a wall-clock timestamp.
    """
    names = ordered_kernel_names(list(files.keys()))
    model_ids = {name: model_id_for_file(files[name]) for name in names}
    ordered_ids = [model_ids[name] for name in names]
    leaves = _leaves_from_model_ids(ordered_ids)
    root = merkle.merkle_root(leaves).hex()

    kernels: dict[str, Any] = {}
    for index, name in enumerate(names):
        path = Path(files[name])
        kernels[name] = {
            "path": path.name,
            "model_id": model_ids[name],
            # ``bytes_sha256`` retained as an explicit alias of ``model_id``
            # so existing tooling/readers keep working and the identity is
            # unambiguous in the file itself.
            "bytes_sha256": model_ids[name],
            "fp_variant": fp_variant,
            "bytes": path.stat().st_size,
            "leaf_index": index,
        }

    return {
        "version": MANIFEST_VERSION,
        "exported_at": exported_at
        or _dt.datetime.now(tz=_dt.timezone.utc).isoformat().replace("+00:00", "Z"),
        "backend": backend,
        "fp_variant": fp_variant,
        "seed": seed,
        "merkle": {
            "algorithm": MERKLE_ALGORITHM,
            "leaf": "model_id",
            "leaf_order": LEAF_ORDER,
            "root": root,
            "leaves": ordered_ids,
        },
        "kernels": kernels,
    }


def load_manifest(path: Path) -> dict[str, Any]:
    """Load and structurally validate a manifest JSON file."""
    raw = Path(path).read_text(encoding="utf-8")
    try:
        manifest = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise ManifestError(f"manifest is not valid JSON: {exc}") from exc
    if not isinstance(manifest, dict):
        raise ManifestError("manifest is not a JSON object")
    if manifest.get("version") != MANIFEST_VERSION:
        raise ManifestError(
            f"unsupported manifest version: {manifest.get('version')!r} "
            f"(expected {MANIFEST_VERSION!r})"
        )
    return manifest


def model_id_of(manifest: Mapping[str, Any], kernel: str) -> str:
    entry = _kernel_entry(manifest, kernel)
    mid = entry.get("model_id")
    if not _is_hex_sha256(mid):
        raise ManifestError(f"kernel {kernel!r} has no valid model_id")
    return mid


def leaf_index_of(manifest: Mapping[str, Any], kernel: str) -> int:
    entry = _kernel_entry(manifest, kernel)
    index = entry.get("leaf_index")
    if not isinstance(index, int) or isinstance(index, bool) or index < 0:
        raise ManifestError(f"kernel {kernel!r} has no valid leaf_index")
    return index


def inclusion_proof_for_kernel(manifest: Mapping[str, Any], kernel: str) -> list[merkle.ProofStep]:
    """Build the Merkle inclusion proof for one kernel's ``model_id``."""
    leaves = _leaves_from_model_ids(_manifest_leaf_ids(manifest))
    index = leaf_index_of(manifest, kernel)
    if index >= len(leaves):
        raise ManifestError(
            f"kernel {kernel!r} leaf_index {index} out of range for {len(leaves)} leaves"
        )
    # Defence in depth: the leaf at ``index`` must be this kernel's model_id.
    expected = model_id_of(manifest, kernel)
    if _manifest_leaf_ids(manifest)[index] != expected:
        raise ManifestError(
            f"kernel {kernel!r} model_id does not match leaves[{index}] — manifest is inconsistent"
        )
    return merkle.inclusion_proof(leaves, index)


def verify_manifest(manifest: Mapping[str, Any], models_dir: Path) -> VerifyResult:
    """Recompute every ``model_id`` from disk and re-derive the Merkle root.

    Returns ``valid=False`` with a human-readable ``reason`` on the first
    inconsistency: a missing file, a byte-level tamper (model_id drift),
    a leaf-ordering violation, or a root mismatch.
    """
    kernels = manifest.get("kernels")
    if not isinstance(kernels, Mapping) or not kernels:
        return VerifyResult(False, "manifest has no kernels")

    names = ordered_kernel_names(list(kernels.keys()))
    recomputed_ids: list[str] = []
    for expected_index, name in enumerate(names):
        entry = kernels[name]
        if not isinstance(entry, Mapping):
            return VerifyResult(False, f"kernel {name!r} entry is not an object")
        declared_index = entry.get("leaf_index")
        if declared_index != expected_index:
            return VerifyResult(
                False,
                f"kernel {name!r} leaf_index {declared_index} != canonical order index {expected_index}",
            )
        rel = entry.get("path")
        if not isinstance(rel, str) or not rel:
            return VerifyResult(False, f"kernel {name!r} has no path")
        file_path = Path(models_dir) / rel
        if not file_path.is_file():
            return VerifyResult(False, f"model file missing: {file_path}")
        actual_id = model_id_for_file(file_path)
        declared_id = entry.get("model_id")
        if actual_id != declared_id:
            return VerifyResult(
                False,
                f"model_id mismatch for {name!r}: file={actual_id} manifest={declared_id} (tampered bytes)",
            )
        recomputed_ids.append(actual_id)

    declared_leaves = _manifest_leaf_ids(manifest)
    if declared_leaves != recomputed_ids:
        return VerifyResult(False, "manifest 'merkle.leaves' do not match kernel model_ids in canonical order")

    try:
        recomputed_root = merkle.merkle_root(_leaves_from_model_ids(recomputed_ids)).hex()
        declared_root = manifest_root(manifest)
    except ManifestError as exc:
        return VerifyResult(False, str(exc))
    if recomputed_root != declared_root:
        return VerifyResult(
            False,
            f"merkle root mismatch: recomputed={recomputed_root} manifest={declared_root}",
        )
    return VerifyResult(True, "")


# --------------------------------------------------------------------------
# internals
# --------------------------------------------------------------------------


def _kernel_entry(manifest: Mapping[str, Any], kernel: str) -> Mapping[str, Any]:
    kernels = manifest.get("kernels")
    if not isinstance(kernels, Mapping):
        raise ManifestError("manifest has no kernels")
    entry = kernels.get(kernel)
    if not isinstance(entry, Mapping):
        raise ManifestError(f"unknown kernel: {kernel!r}")
    return entry


def _manifest_leaf_ids(manifest: Mapping[str, Any]) -> list[str]:
    merkle_block = manifest.get("merkle")
    if not isinstance(merkle_block, Mapping):
        raise ManifestError("manifest has no 'merkle' block")
    leaves = merkle_block.get("leaves")
    if not isinstance(leaves, list) or not all(isinstance(x, str) for x in leaves):
        raise ManifestError("manifest 'merkle.leaves' is not a list of hex strings")
    return list(leaves)


def _is_hex_sha256(value: object) -> bool:
    if not isinstance(value, str) or len(value) != 64:
        return False
    try:
        int(value, 16)
    except ValueError:
        return False
    return True
