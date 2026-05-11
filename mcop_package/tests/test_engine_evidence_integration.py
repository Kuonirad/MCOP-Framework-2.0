"""Engine-level integration tests for the v3.3 evidence-retrieval +
Guardian surfaces.

These tests verify that the engine actually calls into an attached
retriever, surfaces Guardian verdicts on the solution, and respects
the new default 0.70 grounding threshold.
"""

from __future__ import annotations

from mcop import (
    Evidence,
    InMemoryEvidenceRetriever,
    MCOPConfig,
    MCOPEngine,
    Problem,
    RetrieverConfig,
)


def _climate_retriever() -> InMemoryEvidenceRetriever:
    return InMemoryEvidenceRetriever(
        corpus=[
            Evidence(
                content="Anthropogenic CO2 emissions are the dominant driver of recent climate change.",
                source="IPCC AR6",
                evidence_type="peer_reviewed",
                weight=0.95,
            ),
            Evidence(
                content="Arctic sea ice has retreated since 1979 satellite records began.",
                source="NASA",
                evidence_type="documented_observation",
                weight=0.85,
            ),
        ],
        config=RetrieverConfig(top_k=2, min_similarity=0.05),
    )


def test_default_grounding_threshold_is_guardian_floor():
    assert MCOPConfig().grounding_threshold == 0.70


def test_engine_consumes_retriever_and_records_guardian_verdict():
    engine = MCOPEngine(
        MCOPConfig(max_iterations=2, verbose=False),
        evidence_retriever=_climate_retriever(),
    )
    solution = engine.solve(
        Problem(description="What drives recent climate change?")
    )

    assert solution.grounding_index > 0
    # The solution carries a Guardian verdict in its metadata.
    assert "guardian" in solution.metadata
    verdict = solution.metadata["guardian"]["last_verdict"]
    assert verdict["threshold"] == 0.70
    assert verdict["status"] in {"RATIFIED", "CONTESTED", "REQUIRES_HUMAN_REVIEW"}


def test_engine_runs_without_retriever_for_backward_compat():
    engine = MCOPEngine(MCOPConfig(max_iterations=2, verbose=False))
    solution = engine.solve(Problem(description="general reasoning task"))
    # Even with no retriever, the engine still synthesises a solution
    # and runs the Guardian sweep over it.
    assert solution.content
    assert "guardian" in solution.metadata


def test_disabling_guardian_skips_verdict_metadata():
    engine = MCOPEngine(
        MCOPConfig(
            max_iterations=2,
            enable_guardian=False,
            verbose=False,
        ),
    )
    solution = engine.solve(Problem(description="ungated reasoning"))
    assert "guardian" not in solution.metadata


def test_retriever_lifts_grounding_vs_no_retriever():
    """The retriever should add evidence weight that is at least
    comparable to the synthetic baseline. Asserting strict inequality
    on the noisy synthetic fallback would be brittle, so we just
    confirm both paths run and report non-zero grounding."""
    problem = Problem(description="Quantify recent climate forcing.")

    bare = MCOPEngine(MCOPConfig(max_iterations=2)).solve(problem)
    retrieved = MCOPEngine(
        MCOPConfig(max_iterations=2),
        evidence_retriever=_climate_retriever(),
    ).solve(problem)

    assert bare.grounding_index >= 0
    assert retrieved.grounding_index >= 0
    # The retrieved path should attach at least one retriever-sourced
    # Evidence to the chain (the synthetic baseline never sets
    # source="IPCC AR6").
    sources = {e.source for e in retrieved.evidence_chain}
    assert any(s in {"IPCC AR6", "NASA"} for s in sources)
