"""Tests for the kernel export pipeline.

Runs the reference backend in an isolated tmpdir and asserts:

- All six kernel artifacts are produced.
- The manifest hashes are byte-stable across runs.
- The manifest format is RFC 8785–compatible (sortable JSON).
"""

from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.export_cuda_kernels.export import KERNELS, export  # noqa: E402


def test_reference_export_produces_all_six_kernels(tmp_path: Path) -> None:
    manifest = export(tmp_path, backend="reference", fp_variant="fp16", seed=0xC0FFEE)
    assert set(manifest["kernels"].keys()) == set(KERNELS)
    for op in KERNELS:
        path = tmp_path / f"mcop_{op}.onnx"
        assert path.exists()
        assert path.stat().st_size > 0


def test_reference_export_is_byte_stable_across_runs(tmp_path: Path) -> None:
    a = tmp_path / "a"
    b = tmp_path / "b"
    export(a, backend="reference", fp_variant="fp16", seed=42)
    export(b, backend="reference", fp_variant="fp16", seed=42)
    for op in KERNELS:
        h_a = hashlib.sha256((a / f"mcop_{op}.onnx").read_bytes()).hexdigest()
        h_b = hashlib.sha256((b / f"mcop_{op}.onnx").read_bytes()).hexdigest()
        assert h_a == h_b, f"reference export drift on {op}"


def test_manifest_carries_model_ids_and_merkle_root(tmp_path: Path) -> None:
    manifest = export(tmp_path, backend="reference", fp_variant="fp16", seed=1)
    # Per-kernel: model_id = SHA-256(model bytes), aliased as bytes_sha256.
    for index, op in enumerate(sorted(manifest["kernels"])):
        entry = manifest["kernels"][op]
        assert isinstance(entry["model_id"], str)
        assert len(entry["model_id"]) == 64
        assert entry["bytes_sha256"] == entry["model_id"]
        assert entry["leaf_index"] == index
        assert entry["fp_variant"] == "fp16"
        assert entry["bytes"] > 0
    # Manifest-wide RFC 6962 Merkle root over the model_id leaves.
    merkle = manifest["merkle"]
    assert merkle["algorithm"] == "rfc6962-sha256"
    assert len(merkle["root"]) == 64
    assert merkle["leaves"] == [manifest["kernels"][op]["model_id"] for op in sorted(manifest["kernels"])]


def test_seed_affects_model_ids_and_root(tmp_path: Path) -> None:
    a = tmp_path / "a"
    b = tmp_path / "b"
    m_a = export(a, backend="reference", fp_variant="fp16", seed=1)
    m_b = export(b, backend="reference", fp_variant="fp16", seed=2)
    for op in KERNELS:
        assert m_a["kernels"][op]["model_id"] != m_b["kernels"][op]["model_id"]
    assert m_a["merkle"]["root"] != m_b["merkle"]["root"]


def test_merkle_root_is_byte_stable_across_runs(tmp_path: Path) -> None:
    # The root depends only on model bytes + leaf ordering, not on the
    # wall-clock ``exported_at`` timestamp.
    a = tmp_path / "a"
    b = tmp_path / "b"
    m_a = export(a, backend="reference", fp_variant="fp16", seed=99)
    m_b = export(b, backend="reference", fp_variant="fp16", seed=99)
    assert m_a["merkle"]["root"] == m_b["merkle"]["root"]


def test_unknown_backend_raises(tmp_path: Path) -> None:
    with pytest.raises(ValueError):
        export(tmp_path, backend="nope", fp_variant="fp16", seed=0)


def test_manifest_json_is_sorted_and_parseable(tmp_path: Path) -> None:
    export(tmp_path, backend="reference", fp_variant="fp32", seed=7)
    raw = (tmp_path / "manifest.json").read_text()
    parsed = json.loads(raw)
    assert parsed["version"] == "mcop-cuda-kernel-manifest/2.0"
    # Top-level keys must be sorted to keep the manifest diff-friendly.
    top_keys = list(parsed.keys())
    assert top_keys == sorted(top_keys)
