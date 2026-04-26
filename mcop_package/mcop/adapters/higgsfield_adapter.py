"""
Higgsfield MCOP adapter — orchestrates Kling 3.0 / Veo 3.1 / Sora 2 /
Seedance video generations through the MCOP cognitive layer.

The adapter is SDK-agnostic: callers pass in a
:class:`HiggsfieldClient`-conforming object (the official ``higgsfield``
SDK, an in-house HTTP wrapper, or a fixture) and the adapter handles
encoder + resonance + etch + model selection.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Callable, Dict, List, Optional, Protocol

from .base_adapter import (
    AdapterCapabilities,
    AdapterRequest,
    AdapterResponse,
    BaseMCOPAdapter,
    PreparedDispatch,
)


__all__ = [
    "HiggsfieldClient",
    "HiggsfieldMCOPAdapter",
    "HiggsfieldRequest",
    "HiggsfieldResult",
    "ModelChoice",
]


@dataclass
class ModelChoice:
    """Resolved model selection with the resonance-weighted score."""

    name: str
    score: float
    reason: str


@dataclass
class HiggsfieldResult:
    """Vendor-agnostic shape of a Higgsfield generation."""

    model: str
    job_id: str
    video_url: Optional[str] = None
    raw: Any = None
    audit_hash: Optional[str] = None


@dataclass
class HiggsfieldRequest(AdapterRequest):
    """
    Higgsfield-flavoured request. Inherits from :class:`AdapterRequest`
    and exposes a typed motion-references helper.
    """

    motion_refs: List[str] = field(default_factory=list)


class HiggsfieldClient(Protocol):
    """Minimal client surface — keeps the adapter SDK-agnostic."""

    def generate_video(
        self,
        *,
        model: str,
        prompt: str,
        motion_refs: List[str],
        audit: Optional[str] = None,
    ) -> Dict[str, Any]:  # pragma: no cover -- structural typing only
        ...


ModelScorer = Callable[[PreparedDispatch, HiggsfieldRequest], List[ModelChoice]]


def _default_model_scorer(
    dispatch: PreparedDispatch, request: HiggsfieldRequest
) -> List[ModelChoice]:
    """
    Default scoring heuristic — biases model choice on resonance score and
    the number of motion references. The function is deterministic, so it
    can be unit-tested without mocking the adapter.
    """

    resonance = dispatch.resonance.score
    motion_count = len(request.motion_refs)

    # Higher resonance ⇒ bias toward continuity-friendly models that retain
    # camera language across cuts. Lower resonance ⇒ favour exploratory
    # models that introduce more variance.
    base = {
        "kling-3.0": 0.4 + 0.4 * resonance,
        "veo-3.1": 0.5 + 0.3 * (1 - abs(resonance - 0.5)),
        "sora-2": 0.55 + 0.05 * motion_count,
        "seedance": 0.45 + 0.5 * (1 - resonance),
    }
    return sorted(
        (
            ModelChoice(
                name=name,
                score=score,
                reason=(
                    f"resonance={resonance:.3f}, motion_refs={motion_count}"
                ),
            )
            for name, score in base.items()
        ),
        key=lambda c: c.score,
        reverse=True,
    )


class HiggsfieldMCOPAdapter(BaseMCOPAdapter):
    """
    Cinematic-video adapter. Selects among Higgsfield's model offerings
    based on stigmergic resonance and propagates the etch Merkle root as
    the SDK's ``audit`` parameter for end-to-end provenance.
    """

    def __init__(
        self,
        client: HiggsfieldClient,
        *,
        model_scorer: Optional[ModelScorer] = None,
        **base_kwargs: Any,
    ) -> None:
        super().__init__(**base_kwargs)
        self._client = client
        self._scorer = model_scorer or _default_model_scorer

    @property
    def platform_name(self) -> str:
        return "higgsfield"

    def get_capabilities(self) -> AdapterCapabilities:
        return AdapterCapabilities(
            platform="higgsfield",
            version="2024-11",
            models=["kling-3.0", "veo-3.1", "sora-2", "seedance"],
            supports_audit=True,
            features=[
                "cinematic-video",
                "motion-controls",
                "model-routing",
                "merkle-audit",
            ],
            max_resolution="1080p",
            notes=(
                "Selects best model via resonance-weighted scoring; pass a "
                "custom model_scorer to override."
            ),
        )

    # ------------------------------------------------------------------ API

    def optimize_cinematic_video(
        self,
        script_segment: str,
        motion_refs: Optional[List[str]] = None,
        *,
        planned_sequence: Optional[List[str]] = None,
        **extras: Any,
    ) -> AdapterResponse:
        """
        Convenience facade matching the v2.1 spec example. Encodes the
        script, computes resonance against motion references, picks the
        best model and dispatches the SDK call.

        ``planned_sequence`` (optional): a pre-planned action sequence
        produced by the MCTS+MAB planner. When supplied, the value is
        forwarded into the underlying :class:`AdapterRequest` and shows
        up verbatim in the trace metadata under ``plannedSequence`` for
        Merkle-auditable provenance. Omit to keep the existing reactive
        pipeline behaviour unchanged.
        """

        request = HiggsfieldRequest(
            prompt=script_segment,
            domain="cinematic",
            motion_refs=list(motion_refs or []),
            metadata=extras.pop("metadata", {}),
            human_feedback=extras.pop("human_feedback", None),
            style_context=extras.pop("style_context", None),
            entropy_target=extras.pop("entropy_target", None),
            planned_sequence=(
                list(planned_sequence) if planned_sequence is not None else None
            ),
        )
        return self.generate(request)

    def call_platform(
        self, dispatch: PreparedDispatch, request: AdapterRequest
    ) -> HiggsfieldResult:
        if not isinstance(request, HiggsfieldRequest):
            # Promote a generic AdapterRequest into a HiggsfieldRequest so
            # downstream typing stays predictable. ``payload`` may carry
            # `motion_refs` for callers that go through ``generate``.
            motion_refs = list(request.payload.get("motion_refs", []))
        else:
            motion_refs = list(request.motion_refs)

        choices = self._scorer(
            dispatch,
            HiggsfieldRequest(
                prompt=request.prompt,
                domain=request.domain,
                motion_refs=motion_refs,
                metadata=request.metadata,
            ),
        )
        if not choices:
            raise RuntimeError(
                "higgsfield: model_scorer returned no candidates"
            )
        best = choices[0]

        raw = self._client.generate_video(
            model=best.name,
            prompt=dispatch.refined_prompt,
            motion_refs=motion_refs,
            audit=dispatch.etch_hash or None,
        )

        return HiggsfieldResult(
            model=best.name,
            job_id=str(raw.get("job_id") or raw.get("id") or ""),
            video_url=raw.get("video_url") or raw.get("url"),
            raw=raw,
            audit_hash=dispatch.etch_hash or None,
        )
