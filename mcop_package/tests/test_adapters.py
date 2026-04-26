"""Tests for the Python MCOP adapter framework and Higgsfield adapter."""

from __future__ import annotations

from typing import Any, Dict, List

import pytest

from mcop.adapters import (
    AdapterRequest,
    BaseMCOPAdapter,
    DialecticalSynthesizer,
    EtchLedger,
    HiggsfieldClient,
    HiggsfieldMCOPAdapter,
    HiggsfieldRequest,
    HumanFeedback,
    HumanVetoError,
    PreparedDispatch,
    StigmergyStore,
)
from mcop.adapters.base_adapter import ResonanceResult


class FakeHiggsfield(HiggsfieldClient):  # type: ignore[misc]
    def __init__(self, override: Dict[str, Any] | None = None) -> None:
        self.calls: List[Dict[str, Any]] = []
        self._override = override or {}

    def generate_video(
        self,
        *,
        model: str,
        prompt: str,
        motion_refs: List[str],
        audit: str | None = None,
    ) -> Dict[str, Any]:
        record = {
            "model": model,
            "prompt": prompt,
            "motion_refs": motion_refs,
            "audit": audit,
            "job_id": f"hf-{len(self.calls):04d}",
            "video_url": f"https://cdn.example/{model}/{len(self.calls)}.mp4",
            **self._override,
        }
        self.calls.append(record)
        return record


def test_dialectical_synthesizer_veto_and_overrides():
    synth = DialecticalSynthesizer(resonance_preamble_threshold=0.4)

    with pytest.raises(HumanVetoError):
        synth.synthesize("p", ResonanceResult(score=0.0), HumanFeedback(veto=True))

    overridden = synth.synthesize(
        "p",
        ResonanceResult(score=0.0),
        HumanFeedback(rewritten_prompt="override"),
    )
    assert overridden == "override"


def test_stigmergy_store_records_and_resonates():
    store = StigmergyStore(resonance_threshold=0.1, max_traces=4)
    trace = store.record_trace([1.0, 0.0, 0.0], [1.0, 0.0, 0.0], {"note": "n"})
    assert trace.hash
    assert store.merkle_root() == trace.hash

    result = store.get_resonance([1.0, 0.0, 0.0])
    assert result.score > 0.99
    assert result.trace is not None and result.trace.id == trace.id

    # Below-threshold queries should return a zero-score, no-trace tuple.
    miss = store.get_resonance([0.0, 0.0, 0.0])
    assert miss.score == 0.0 and miss.trace is None


def test_stigmergy_store_eviction_preserves_chain():
    store = StigmergyStore(resonance_threshold=0.0, max_traces=2)
    a = store.record_trace([1, 0], [1, 0], {})
    b = store.record_trace([0, 1], [0, 1], {})
    c = store.record_trace([1, 1], [1, 1], {})
    # Capacity=2 means trace ``a`` should have been evicted but the chain
    # parent_hash on ``c`` should still reference its predecessor at insert
    # time (i.e. ``b``).
    assert store.merkle_root() == c.hash
    assert c.parent_hash == b.hash


def test_etch_ledger_skip_and_accept():
    ledger = EtchLedger(confidence_floor=0.5, max_etches=8)
    skipped = ledger.apply_etch([1, 0], [-1, 0])
    assert skipped.hash == ""
    accepted = ledger.apply_etch([1, 1], [1, 1])
    assert accepted.hash and accepted.delta_weight > 0


def test_higgsfield_adapter_routes_via_resonance_score():
    client = FakeHiggsfield()
    adapter = HiggsfieldMCOPAdapter(client)

    response = adapter.optimize_cinematic_video(
        "wide aerial of a glacier at sunrise",
        motion_refs=["push-in", "low-angle"],
    )
    assert response.result.model in {"kling-3.0", "veo-3.1", "sora-2", "seedance"}
    assert response.merkle_root  # accepted etch
    assert response.provenance.refined_prompt
    assert client.calls[0]["audit"] == response.merkle_root


def test_higgsfield_adapter_capabilities():
    adapter = HiggsfieldMCOPAdapter(FakeHiggsfield())
    caps = adapter.get_capabilities()
    assert caps.platform == "higgsfield"
    assert "kling-3.0" in caps.models
    assert caps.supports_audit is True


def test_higgsfield_adapter_rejects_empty_prompt():
    adapter = HiggsfieldMCOPAdapter(FakeHiggsfield())
    with pytest.raises(ValueError):
        adapter.generate(AdapterRequest(prompt=""))


def test_higgsfield_adapter_uses_payload_motion_refs_for_generic_request():
    client = FakeHiggsfield()
    adapter = HiggsfieldMCOPAdapter(client)
    response = adapter.generate(
        AdapterRequest(
            prompt="rooftop chase",
            domain="cinematic",
            payload={"motion_refs": ["whip-pan", "handheld"]},
        )
    )
    assert client.calls[0]["motion_refs"] == ["whip-pan", "handheld"]
    assert response.result.video_url


def test_higgsfield_adapter_custom_scorer_is_honoured():
    client = FakeHiggsfield()

    def scorer(_dispatch: PreparedDispatch, _request: HiggsfieldRequest):
        from mcop.adapters import ModelChoice

        return [ModelChoice(name="custom-model", score=1.0, reason="forced")]

    adapter = HiggsfieldMCOPAdapter(client, model_scorer=scorer)
    response = adapter.optimize_cinematic_video("forced model", ["zoom"])
    assert response.result.model == "custom-model"


def test_higgsfield_adapter_forwards_planned_sequence_to_trace():
    """A planner-produced action sequence must show up verbatim in
    trace metadata for Merkle-auditable provenance, and must be absent
    when the caller does not pass one (back-compat with the reactive
    pipeline)."""

    client = FakeHiggsfield()
    adapter = HiggsfieldMCOPAdapter(client)

    # 1. With a planned sequence — appears in trace metadata.
    plan = ["shot:wide", "shot:close", "shot:wide"]
    response = adapter.optimize_cinematic_video(
        "tracking shot through a forest",
        motion_refs=["dolly", "handheld"],
        planned_sequence=plan,
    )
    assert response.merkle_root
    # pylint: disable=protected-access
    traces = adapter.stigmergy._traces
    assert traces and traces[-1].metadata.get("plannedSequence") == plan

    # 2. Without a planned sequence — key is absent.
    response2 = adapter.optimize_cinematic_video(
        "follow-up shot",
        motion_refs=["pan"],
    )
    assert response2.merkle_root
    # pylint: disable=protected-access
    traces_after = adapter.stigmergy._traces
    assert traces_after and "plannedSequence" not in traces_after[-1].metadata


def test_base_adapter_requires_subclass_overrides():
    """Calling unimplemented methods on the base class must raise."""

    base = BaseMCOPAdapter()
    with pytest.raises(NotImplementedError):
        base.get_capabilities()
    with pytest.raises(NotImplementedError):
        base.call_platform(
            PreparedDispatch(
                refined_prompt="p",
                tensor=[],
                resonance=ResonanceResult(score=0.0),
                trace=None,  # type: ignore[arg-type]
                etch_hash="",
                etch_delta=0.0,
                provenance=None,  # type: ignore[arg-type]
            ),
            AdapterRequest(prompt="p"),
        )
