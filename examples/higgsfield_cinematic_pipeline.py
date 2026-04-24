"""
Higgsfield cinematic pipeline example.

Walks a multi-segment storyboard through the
:class:`HiggsfieldMCOPAdapter` so each shot inherits stylistic resonance
from the previous one and ships with a Merkle audit root.

Run with::

    python examples/higgsfield_cinematic_pipeline.py

The shipped client is a fixture; swap in the real Higgsfield SDK by
implementing :class:`HiggsfieldClient` (a single
``generate_video`` method).
"""

from __future__ import annotations

from typing import Any, Dict, List

from mcop.adapters import HiggsfieldMCOPAdapter


class FixtureHiggsfieldClient:
    """Fake SDK client that returns deterministic dummy payloads."""

    def __init__(self) -> None:
        self.calls: List[Dict[str, Any]] = []

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
            "video_url": f"https://cdn.higgsfield.example/{model}/{len(self.calls)}.mp4",
        }
        self.calls.append(record)
        return record


def main() -> None:
    client = FixtureHiggsfieldClient()
    adapter = HiggsfieldMCOPAdapter(client)

    storyboard = [
        ("opening drone shot of a desert temple at dawn", ["push-in", "low-angle"]),
        ("interior reveal: warm torches, slow pan", ["dolly-pan", "warm-grade"]),
        ("character close-up, breath visible in cold air", ["close-up", "cold-grade"]),
    ]

    for idx, (script, motion) in enumerate(storyboard):
        response = adapter.optimize_cinematic_video(script, motion)
        print(
            f"shot {idx}: model={response.result.model} "
            f"resonance={response.provenance.resonance_score:.3f} "
            f"merkle={response.merkle_root[:12]}..."
        )

    print(f"total SDK calls: {len(client.calls)}")


if __name__ == "__main__":
    main()
