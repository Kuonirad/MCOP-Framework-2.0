"""Unit tests for the Merkle-rooted model manifest (:mod:`mcop.model_manifest`)."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from mcop import model_manifest as mm
from mcop.merkle import merkle_root

REPO_ROOT = Path(__file__).resolve().parents[2]
MODELS_DIR = REPO_ROOT / "models"
COMMITTED_ROOT = "3e53db14a02c652b8f4d03e3c7a730dba39ba834a1492b2129c53a58c8bb76f0"

SYNTH = {
    "encode": b"MCOP-ONNX encode bytes",
    "homeostasis": b"MCOP-ONNX homeostasis bytes",
    "cosineRecall": b"MCOP-ONNX cosineRecall bytes",
}


def _write_synth(dir_: Path) -> dict[str, Path]:
    files = {}
    for name, data in SYNTH.items():
        p = dir_ / f"mcop_{name}.onnx"
        p.write_bytes(data)
        files[name] = p
    return files


def test_model_id_is_sha256_of_bytes() -> None:
    assert mm.model_id_for_bytes(b"hello") == (
        "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824"
    )


def test_build_manifest_orders_leaves_by_kernel_name(tmp_path: Path) -> None:
    files = _write_synth(tmp_path)
    m = mm.build_manifest(files, backend="reference", fp_variant="fp16", seed=1, exported_at="T")
    assert m["version"] == mm.MANIFEST_VERSION
    assert m["kernels"]["cosineRecall"]["leaf_index"] == 0
    assert m["kernels"]["encode"]["leaf_index"] == 1
    assert m["kernels"]["homeostasis"]["leaf_index"] == 2
    assert m["kernels"]["encode"]["model_id"] == m["kernels"]["encode"]["bytes_sha256"]
    leaves = [bytes.fromhex(h) for h in m["merkle"]["leaves"]]
    assert m["merkle"]["root"] == merkle_root(leaves).hex()


def test_verify_synthetic_round_trip(tmp_path: Path) -> None:
    files = _write_synth(tmp_path)
    m = mm.build_manifest(files, backend="reference", fp_variant="fp16", seed=1, exported_at="T")
    assert mm.verify_manifest(m, tmp_path).valid


def test_verify_detects_byte_tamper(tmp_path: Path) -> None:
    files = _write_synth(tmp_path)
    m = mm.build_manifest(files, backend="reference", fp_variant="fp16", seed=1, exported_at="T")
    (tmp_path / "mcop_encode.onnx").write_bytes(b"TAMPERED")
    res = mm.verify_manifest(m, tmp_path)
    assert not res.valid and "model_id mismatch" in res.reason


def test_verify_detects_missing_file(tmp_path: Path) -> None:
    files = _write_synth(tmp_path)
    m = mm.build_manifest(files, backend="reference", fp_variant="fp16", seed=1, exported_at="T")
    (tmp_path / "mcop_encode.onnx").unlink()
    res = mm.verify_manifest(m, tmp_path)
    assert not res.valid and "missing" in res.reason


def test_verify_detects_leaf_reorder(tmp_path: Path) -> None:
    files = _write_synth(tmp_path)
    m = mm.build_manifest(files, backend="reference", fp_variant="fp16", seed=1, exported_at="T")
    m["kernels"]["encode"]["leaf_index"] = 9
    assert not mm.verify_manifest(m, tmp_path).valid


def test_verify_detects_forged_root(tmp_path: Path) -> None:
    files = _write_synth(tmp_path)
    m = mm.build_manifest(files, backend="reference", fp_variant="fp16", seed=1, exported_at="T")
    m["merkle"]["root"] = "a" * 64
    res = mm.verify_manifest(m, tmp_path)
    assert not res.valid and "root mismatch" in res.reason


def test_committed_manifest_verifies_against_committed_models() -> None:
    m = mm.load_manifest(MODELS_DIR / "manifest.json")
    assert mm.manifest_root(m) == COMMITTED_ROOT
    assert mm.verify_manifest(m, MODELS_DIR).valid


def test_inclusion_proof_for_every_committed_kernel() -> None:
    m = mm.load_manifest(MODELS_DIR / "manifest.json")
    for kernel in m["kernels"]:
        proof = mm.inclusion_proof_for_kernel(m, kernel)
        assert isinstance(proof, list)
        assert mm.leaf_index_of(m, kernel) >= 0


def test_unknown_kernel_raises() -> None:
    m = mm.load_manifest(MODELS_DIR / "manifest.json")
    with pytest.raises(mm.ManifestError):
        mm.model_id_of(m, "nope")


def test_load_manifest_errors(tmp_path: Path) -> None:
    bad = tmp_path / "m.json"
    bad.write_text("{not json", encoding="utf-8")
    with pytest.raises(mm.ManifestError):
        mm.load_manifest(bad)

    old = tmp_path / "old.json"
    old.write_text(json.dumps({"version": "mcop-cuda-kernel-manifest/1.0"}), encoding="utf-8")
    with pytest.raises(mm.ManifestError):
        mm.load_manifest(old)
