"""Contract tests for the public Python Deterministic Triad."""

from __future__ import annotations

import json

import pytest

import mcop
from mcop.canonical_encoding import canonical_digest
from mcop.integrations.triad_harness import (
    MCOPEncoder,
    MCOPHolographicEtch,
    MCOPStigmergy,
)
from mcop.triad import (
    TRIAD_PROTOCOL_VERSION,
    HolographicEtch,
    NovaNeoEncoder,
    StigmergyV5,
    _cli,
)


CONTEXT = [0.25, -0.5, 0.75, 1.0]
SYNTHESIS = [0.5, -0.25, 0.75, 0.5]
METADATA = {"stage": "cross-language-parity", "sequence": 1}
TRACE_ID = "123e4567-e89b-42d3-a456-426614174000"
OPTIONAL_TRACE_ID = "223e4567-e89b-42d3-a456-426614174000"
FIXED_TIME = "2026-07-14T00:00:00.000Z"


def _clock() -> str:
    return FIXED_TIME


def _memory(max_traces: int = 8) -> StigmergyV5:
    return StigmergyV5(
        resonance_threshold=0.25,
        adaptive_threshold=False,
        max_traces=max_traces,
        clock=_clock,
    )


def _etch(max_etches: int = 8, confidence_floor: float = 0.0) -> HolographicEtch:
    return HolographicEtch(
        confidence_floor=confidence_floor,
        audit_log=True,
        max_etches=max_etches,
        static_floor_weight=0.4,
        curiosity_bonus=0.15,
        flourishing_amplifier=0.2,
        clock=_clock,
    )


def test_flagship_and_legacy_surfaces_are_public() -> None:
    assert mcop.NovaNeoEncoder is NovaNeoEncoder
    assert mcop.StigmergyV5 is StigmergyV5
    assert mcop.HolographicEtch is HolographicEtch
    assert mcop.MCOPEngine is not None
    assert TRIAD_PROTOCOL_VERSION == "2.4.0"


def test_fixed_trace_is_byte_identical_to_typescript_fixture() -> None:
    memory = _memory()
    trace = memory.record_trace(
        CONTEXT, SYNTHESIS, METADATA, trace_id=TRACE_ID
    )

    assert trace.id == TRACE_ID
    assert trace.timestamp == FIXED_TIME
    assert trace.weight == pytest.approx(0.903696114115064)
    assert trace.hash == (
        "59dcb6b926488e097e22283b8c3b00611afdcbc6249b561192dead8bc63f8a6f"
    )
    assert memory.get_merkle_root() == trace.hash
    assert memory.getMerkleRoot() == trace.hash

    resonance = memory.get_resonance(CONTEXT)
    assert resonance.trace is trace
    assert resonance.score == pytest.approx(1.0)
    assert resonance.threshold_used == 0.25
    assert resonance.positive_feedback_score == pytest.approx(1.0)


def test_trace_omits_absent_metadata_instead_of_hashing_null_or_empty_object() -> None:
    memory = _memory()
    omitted = memory.record_trace(
        CONTEXT, SYNTHESIS, metadata=None, trace_id=OPTIONAL_TRACE_ID
    )
    assert omitted.hash == (
        "5f7e4ff850d27587c591196038493add26ce05191afc644ab824ecc1c3cecbff"
    )

    payload = {
        "id": OPTIONAL_TRACE_ID,
        "context": CONTEXT,
        "synthesisVector": SYNTHESIS,
        "weight": omitted.weight,
    }
    assert omitted.hash == canonical_digest({"payload": payload, "parentHash": None})
    assert omitted.hash != canonical_digest(
        {"payload": {**payload, "metadata": None}, "parentHash": None}
    )
    assert omitted.hash != canonical_digest(
        {"payload": {**payload, "metadata": {}}, "parentHash": None}
    )


def test_stigmergy_merkle_chain_and_memory_are_bounded() -> None:
    memory = _memory(max_traces=2)
    first = memory.record_trace([1.0], [1.0], {}, trace_id="trace-1")
    second = memory.record_trace([0.5], [0.5], {}, trace_id="trace-2")
    third = memory.record_trace([0.25], [0.25], {}, trace_id="trace-3")

    assert second.parent_hash == first.hash
    assert third.parent_hash == second.hash
    assert [trace.id for trace in memory.get_recent(10)] == ["trace-3", "trace-2"]
    assert [trace.id for trace in memory.traces] == ["trace-2", "trace-3"]
    stats = memory.get_buffer_stats()
    assert (stats.size, stats.capacity, stats.lifetime_pushes) == (2, 2, 3)
    assert stats.lifetimePushes == 3


def test_resonant_recent_exposes_curiosity_and_ranked_scores() -> None:
    memory = _memory()
    memory.record_trace([1.0, 0.0], [1.0, 0.0], trace_id="strong")
    memory.record_trace([0.0, 1.0], [1.0, 0.0], trace_id="weak")
    ranked = memory.get_resonant_recent(2, context=[1.0, 0.0])
    assert [trace.id for trace in ranked] == ["strong", "weak"]
    assert ranked[0].resonance_score == 1.0
    assert ranked[1].curiosity_lift > 0.0


def test_fixed_etch_is_byte_identical_and_carries_eudaimonic_fields() -> None:
    etcher = _etch()
    record = etcher.apply_etch(CONTEXT, SYNTHESIS, "cross-language-parity")

    assert record.timestamp == FIXED_TIME
    assert record.hash == (
        "ece78ce9de018a7721c759e665326f1b855bdb1430c2958928186812fc0891fb"
    )
    assert record.delta_weight == 0.328125
    assert record.flourishing_score == pytest.approx(0.4024300574888011)
    assert record.propagation_hint == "seed"
    assert etcher.recent(1) == [record]
    assert etcher.recent_audit(1) == [record]


def test_etch_omits_absent_note_instead_of_hashing_null() -> None:
    record = _etch().apply_etch(CONTEXT, SYNTHESIS, note=None)
    assert record.hash == (
        "cb5684e09d1ae28916bcaa0826c0c949e0586cd2aa7f2138465a675eb3025f41"
    )
    payload = {
        "context": CONTEXT,
        "synthesisVector": SYNTHESIS,
        "normalizedDelta": 0.328125,
    }
    assert record.hash == canonical_digest(payload)
    assert record.hash != canonical_digest({**payload, "note": None})


def test_etch_committed_and_audit_memories_are_bounded() -> None:
    etcher = _etch(max_etches=2)
    for index in range(3):
        etcher.apply_etch([1.0 + index], [1.0], note=str(index))

    assert [record.note for record in etcher.recent(10)] == ["2", "1"]
    assert [record.note for record in etcher.recent_audit(10)] == ["2", "1"]
    stats = etcher.get_memory_stats()
    assert (stats.size, stats.capacity, stats.lifetime_pushes) == (2, 2, 3)
    assert stats.utilization_pct == 100.0


def test_skipped_etch_is_audited_but_not_committed() -> None:
    etcher = _etch(confidence_floor=0.65)
    skipped = etcher.apply_etch([1.0, 0.0], [-1.0, 0.0])
    assert skipped.hash == ""
    assert skipped.note == "skipped-low-confidence"
    assert etcher.recent() == []
    assert etcher.recent_audit() == [skipped]
    assert etcher.get_memory_stats().lifetime_pushes == 0


def test_core_and_legacy_wrapper_defaults_are_intentional() -> None:
    flagship_memory = StigmergyV5()
    flagship_etch = HolographicEtch()
    assert flagship_memory.get_buffer_stats().capacity == 2048
    assert flagship_memory.resonance_threshold > 0.55
    assert flagship_etch.confidence_floor == 0.65
    assert flagship_etch.get_memory_stats().capacity == 4096

    assert MCOPEncoder().dimensions == 64
    assert MCOPStigmergy().resonance_threshold == 0.55
    assert MCOPHolographicEtch().confidence_floor == 0.0


def test_cli_emits_full_cross_language_fixture(capsys: pytest.CaptureFixture[str]) -> None:
    assert _cli(["crystalline entropy", "--dimensions", "64", "--normalize"]) == 0
    payload = json.loads(capsys.readouterr().out)

    assert payload["tensor_sha256"] == (
        "7da1b986757f0b617250ac0421daef95417f985c47e590e3ea331132accb9211"
    )
    assert payload["triad_protocol_version"] == "2.4.0"
    assert payload["stigmergy"]["trace_hash"] == (
        "59dcb6b926488e097e22283b8c3b00611afdcbc6249b561192dead8bc63f8a6f"
    )
    assert payload["holographic_etch"]["hash"] == (
        "ece78ce9de018a7721c759e665326f1b855bdb1430c2958928186812fc0891fb"
    )
    assert payload["optional_fields"] == {
        "trace_hash": "5f7e4ff850d27587c591196038493add26ce05191afc644ab824ecc1c3cecbff",
        "etch_hash": "cb5684e09d1ae28916bcaa0826c0c949e0586cd2aa7f2138465a675eb3025f41",
    }
