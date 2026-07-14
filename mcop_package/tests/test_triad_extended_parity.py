"""Focused regressions for the wider TypeScript/Python Triad contract."""

from __future__ import annotations

import asyncio
import hashlib
import struct

import pytest

from mcop.triad import (
    HashingTrickBackend,
    HolographicEtch,
    NovaNeoEncoder,
    StigmergyV5,
    nova_neo_encode,
)


def _tensor_hash(values: list[float]) -> str:
    return hashlib.sha256(
        b"".join(struct.pack("<d", value) for value in values)
    ).hexdigest()


def test_hashing_trick_backend_matches_typescript_fixture() -> None:
    encoder = NovaNeoEncoder(dimensions=16, normalize=True, backend="embedding")
    assert isinstance(encoder.embedding_backend, HashingTrickBackend)
    assert _tensor_hash(encoder.encode("Semantic café 😀")) == (
        "10e5669983d500f37347383f02b198ee5b76126d6610b140ec411266cc7008bd"
    )


def test_hashing_backend_dimension_healing_classifies_integer_valued_floats_like_js() -> None:
    backend = HashingTrickBackend()
    assert len(backend.encode("heal", -2.0, False)) == 1
    event = backend.getLastDimensionHealing()
    assert event is not None
    assert event["requestedDimensions"] == -2.0
    assert event["healedDimensions"] == 1
    assert event["reason"] == "non-positive"

    assert len(backend.encode("heal", True, False)) == 1
    boolean_event = backend.getLastDimensionHealing()
    assert boolean_event is not None
    assert boolean_event["reason"] == "non-integer"


def test_embedding_sync_and_async_aliases_share_the_default_backend() -> None:
    encoder = NovaNeoEncoder(dimensions=16, normalize=True, backend="embedding")
    expected = encoder.encode("shared async contract")
    assert asyncio.run(encoder.encode_async("shared async contract")) == expected
    assert asyncio.run(encoder.encodeAsync("shared async contract")) == expected


def test_async_only_embedding_backend_requires_the_async_surface() -> None:
    class AsyncOnlyBackend:
        async def encodeAsync(  # noqa: N802
            self, text: str, dimensions: int, normalize: bool
        ) -> list[float]:
            assert text == "async-only"
            return [1.0 if normalize else 2.0] * dimensions

    encoder = NovaNeoEncoder(
        dimensions=3,
        normalize=True,
        backend="embedding",
        embedding_backend=AsyncOnlyBackend(),
    )
    with pytest.raises(RuntimeError, match="asynchronous"):
        encoder.encode("async-only")
    assert asyncio.run(encoder.encodeAsync("async-only")) == [1.0, 1.0, 1.0]


def test_lone_surrogates_follow_text_encoder_replacement_semantics() -> None:
    # TextEncoder replaces each unpaired surrogate with U+FFFD.
    assert nova_neo_encode("\ud800", 8) == nova_neo_encode("\ufffd", 8)
    assert _tensor_hash(nova_neo_encode("\ud800", 8)) == (
        "7a8030750bfbf66bef7cd5c633cb37c30e9ae07ba5054330b8d2527af72e627c"
    )
    # A valid explicit UTF-16 pair remains the same scalar as the native
    # Python astral-code-point representation.
    assert nova_neo_encode("\ud83d\ude00", 8) == nova_neo_encode("😀", 8)


@pytest.mark.parametrize(
    ("candidates", "expected"),
    [
        (1, 0.41124408934467127),
        (8, 0.5342212854879516),
        (2048, 0.7815677326496892),
    ],
)
def test_noise_floor_candidate_count_matches_typescript(
    candidates: int, expected: float
) -> None:
    memory = StigmergyV5(
        max_traces=2048,
        noise_floor_candidates=candidates,
        adaptive_threshold=False,
    )
    assert memory.get_resonance([0.0]).threshold_used == expected


def test_default_growth_ledger_matches_typescript_hash_and_metrics() -> None:
    etcher = HolographicEtch(growth_ledger=True, max_growth_events=8)
    event = etcher.recordPositiveGrowthEvent(
        {
            "domain": "determinism",
            "title": "Parity",
            "positiveBuilding": "Shared contract",
            "resonanceDelta": 0.5,
        }
    )
    assert event is not None
    assert event.hash == (
        "e5065b8a846d83003d3c5087c290f7e86f6b3c888d1e22fcf4a3b0010701f28b"
    )
    assert etcher.recentPositiveGrowth(1) == [event]
    metrics = etcher.getPositiveImpactMetrics()
    assert metrics is not None
    assert metrics.contributorJoy == 0.888
    assert metrics.adoptionVelocity == 0.7
    assert metrics.beneficialOutcomeAmplification == 0.65
    assert metrics.growthEvents == 1
    assert metrics.merkleRoot == event.hash


def test_holographic_etch_accepts_a_camel_case_duck_typed_growth_ledger() -> None:
    class ExternalLedger:
        def __init__(self) -> None:
            self.inputs: list[object] = []

        def recordGrowthEvent(self, value: object) -> object:  # noqa: N802
            self.inputs.append(value)
            return value

        def recentGrowthEvents(self, limit: int) -> list[object]:  # noqa: N802
            return self.inputs[-limit:][::-1]

        def getPositiveImpactMetrics(self) -> dict[str, int]:  # noqa: N802
            return {"growthEvents": len(self.inputs)}

    external = ExternalLedger()
    etcher = HolographicEtch(growth_ledger=external)
    payload = {"domain": "joy"}
    assert etcher.record_positive_growth_event(payload) is payload
    assert etcher.recent_positive_growth() == [payload]
    assert etcher.get_positive_impact_metrics() == {"growthEvents": 1}
