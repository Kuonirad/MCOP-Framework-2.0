"""Unit tests for Proof-of-Useful-Work receipts (:mod:`mcop.pouw`)."""

from __future__ import annotations

from pathlib import Path

from mcop import model_manifest as mm
from mcop import pouw
from mcop.canonical_encoding import canonical_digest

REPO_ROOT = Path(__file__).resolve().parents[2]
MODELS_DIR = REPO_ROOT / "models"
COMMITTED_ROOT = "3e53db14a02c652b8f4d03e3c7a730dba39ba834a1492b2129c53a58c8bb76f0"

SYNTH = {
    "encode": b"encode-bytes",
    "homeostasis": b"homeostasis-bytes",
    "cosineRecall": b"cosine-bytes",
}


def _manifest(tmp_path: Path):
    files = {}
    for name, data in SYNTH.items():
        p = tmp_path / f"mcop_{name}.onnx"
        p.write_bytes(data)
        files[name] = p
    return mm.build_manifest(files, backend="reference", fp_variant="fp16", seed=1, exported_at="T")


def _receipt(manifest, kernel="encode"):
    return pouw.build_receipt(
        manifest,
        kernel=kernel,
        canonical_op="nova-neo-encode",
        work_merkle_root="w" * 64,
        verified_device="CUDAExecutionProvider",
        device="cuda:0",
        duration_ms=1.5,
        timestamp="2026-05-25T00:00:00.000Z",
    )


def test_build_binds_model_and_proof(tmp_path: Path) -> None:
    m = _manifest(tmp_path)
    r = _receipt(m)
    assert r.model_id == m["kernels"]["encode"]["model_id"]
    assert r.manifest_root == mm.manifest_root(m)
    assert len(r.inclusion_proof) > 0
    assert len(r.receipt_id) == 64


def test_verify_accepts_valid(tmp_path: Path) -> None:
    m = _manifest(tmp_path)
    assert pouw.verify_receipt(_receipt(m), mm.manifest_root(m)).valid


def test_verify_rejects_missing_root(tmp_path: Path) -> None:
    r = _receipt(_manifest(tmp_path))
    res = pouw.verify_receipt(r, None)
    assert not res.valid and "no on-chain anchored root" in res.reason


def test_verify_rejects_unanchored_root(tmp_path: Path) -> None:
    r = _receipt(_manifest(tmp_path))
    res = pouw.verify_receipt(r, "b" * 64)
    assert not res.valid and "not anchored on-chain" in res.reason


def test_verify_rejects_tampered_receipt(tmp_path: Path) -> None:
    import dataclasses

    m = _manifest(tmp_path)
    r = _receipt(m)
    tampered = dataclasses.replace(r, model_id="c" * 64)
    res = pouw.verify_receipt(tampered, mm.manifest_root(m))
    assert not res.valid and "tampered" in res.reason


def test_verify_rejects_self_consistent_bad_proof(tmp_path: Path) -> None:
    import dataclasses

    m = _manifest(tmp_path)
    base = _receipt(m, "encode")
    other = _receipt(m, "homeostasis")
    # Swap in another kernel's proof, then re-seal receipt_id so the tamper
    # check passes and only the Merkle fold fails.
    body = pouw._receipt_body(
        kernel=base.kernel,
        canonical_op=base.canonical_op,
        model_id=base.model_id,
        manifest_root=base.manifest_root,
        inclusion_proof=other.inclusion_proof,
        work_merkle_root=base.work_merkle_root,
        verified_device=base.verified_device,
        device=base.device,
        duration_ms=base.duration_ms,
        timestamp=base.timestamp,
    )
    forged = dataclasses.replace(
        base, inclusion_proof=other.inclusion_proof, receipt_id=canonical_digest(body)
    )
    res = pouw.verify_receipt(forged, mm.manifest_root(m))
    assert not res.valid and "inclusion proof does not reproduce" in res.reason


def test_receipt_json_round_trip(tmp_path: Path) -> None:
    m = _manifest(tmp_path)
    r = _receipt(m)
    restored = pouw.PoUWReceipt.from_json(r.to_json())
    assert restored == r


class TestOnChainRootRegistry:
    def test_override_lowercased(self) -> None:
        reg = pouw.OnChainRootRegistry(override="A" * 64, env={})
        assert reg.resolve() == "a" * 64

    def test_env(self) -> None:
        reg = pouw.OnChainRootRegistry(env={pouw.ANCHOR_ENV_VAR: COMMITTED_ROOT})
        assert reg.resolve() == COMMITTED_ROOT

    def test_anchor_file(self, tmp_path: Path) -> None:
        anchor = tmp_path / "anchored_root.json"
        anchor.write_text(f'{{"root": "{COMMITTED_ROOT}"}}', encoding="utf-8")
        reg = pouw.OnChainRootRegistry(env={}, anchor_path=anchor)
        assert reg.resolve() == COMMITTED_ROOT

    def test_precedence(self, tmp_path: Path) -> None:
        anchor = tmp_path / "anchored_root.json"
        anchor.write_text(f'{{"root": "{"c" * 64}"}}', encoding="utf-8")
        reg = pouw.OnChainRootRegistry(
            override="a" * 64, env={pouw.ANCHOR_ENV_VAR: "b" * 64}, anchor_path=anchor
        )
        assert reg.resolve() == "a" * 64

    def test_none(self) -> None:
        assert pouw.OnChainRootRegistry(env={}).resolve() is None

    def test_committed_anchor_file_resolves(self) -> None:
        reg = pouw.OnChainRootRegistry(env={}, anchor_path=MODELS_DIR / "anchored_root.json")
        assert reg.resolve() == COMMITTED_ROOT


def test_end_to_end_committed_models_verify() -> None:
    """A receipt minted against the committed manifest verifies against the
    committed on-chain anchor — the real shipped artifacts, end to end."""
    m = mm.load_manifest(MODELS_DIR / "manifest.json")
    reg = pouw.OnChainRootRegistry(env={}, anchor_path=MODELS_DIR / "anchored_root.json")
    for kernel in m["kernels"]:
        r = pouw.build_receipt(
            m,
            kernel=kernel,
            canonical_op=kernel,
            work_merkle_root="a" * 64,
            verified_device="CUDAExecutionProvider",
            device="cuda:0",
            duration_ms=0.0,
        )
        assert pouw.verify_receipt(r, reg.resolve()).valid
