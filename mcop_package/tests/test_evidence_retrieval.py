"""Tests for ``mcop.evidence_retrieval``.

The retriever surface is engine-facing, so the tests exercise both the
in-memory cosine backend and the composite fan-out path. We also pin
the ``build_query_from_hypothesis`` projection to a deterministic
shape so cross-runtime parity with the TS retriever stays achievable.
"""

from __future__ import annotations

import pytest

from mcop import Evidence, Hypothesis, Problem
from mcop.evidence_retrieval import (
    CompositeEvidenceRetriever,
    InMemoryEvidenceRetriever,
    RetrieverConfig,
    build_query_from_hypothesis,
)


@pytest.fixture
def climate_corpus() -> list[Evidence]:
    return [
        Evidence(
            content="Anthropogenic CO2 emissions are the dominant driver of climate change.",
            source="IPCC AR6",
            evidence_type="peer_reviewed",
            weight=0.95,
        ),
        Evidence(
            content="Arctic sea ice has retreated since the satellite record began in 1979.",
            source="NASA Earth Observatory",
            evidence_type="documented_observation",
            weight=0.85,
        ),
        Evidence(
            content="Tomatoes are a fruit in the botanical sense.",
            source="trivia",
            evidence_type="anecdotal",
            weight=0.2,
        ),
    ]


def test_in_memory_retriever_returns_top_k_in_similarity_order(climate_corpus):
    retr = InMemoryEvidenceRetriever(
        corpus=climate_corpus,
        config=RetrieverConfig(top_k=2, min_similarity=0.05),
    )

    # Query is broad enough to overlap both climate items but not the tomato.
    results = retr.retrieve("climate change arctic sea ice emissions")

    assert len(results) == 2
    # Highest similarity first.
    assert results[0].similarity >= results[1].similarity
    contents = [r.evidence.content for r in results]
    assert any("CO2" in c for c in contents)
    assert any("sea ice" in c for c in contents)
    # The tomato item should not survive the similarity filter.
    assert not any("Tomatoes" in c for c in contents)


def test_in_memory_retriever_respects_min_similarity(climate_corpus):
    retr = InMemoryEvidenceRetriever(
        corpus=climate_corpus,
        config=RetrieverConfig(top_k=10, min_similarity=0.99),
    )
    # An unrelated query should yield zero hits at this threshold.
    assert retr.retrieve("nothing matches this") == []


def test_in_memory_retriever_attaches_provenance_metadata(climate_corpus):
    retr = InMemoryEvidenceRetriever(corpus=climate_corpus)
    [result] = retr.retrieve("anthropogenic emissions", top_k=1)
    assert result.retriever_name == "in_memory_cosine"
    assert result.evidence.metadata["retriever"] == "in_memory_cosine"
    assert 0 < result.evidence.metadata["similarity"] <= 1.0


def test_retrieve_for_hypothesis_uses_problem_context(climate_corpus):
    retr = InMemoryEvidenceRetriever(corpus=climate_corpus)
    h = Hypothesis(content="CO2 forcing causes warming")
    problem = Problem(description="Quantify modern climate forcing")
    results = retr.retrieve_for_hypothesis(h, problem=problem)
    assert results, "hypothesis-projected query should hit the corpus"


def test_build_query_concatenates_hypothesis_and_problem():
    h = Hypothesis(content="alpha")
    p = Problem(description="beta")
    assert build_query_from_hypothesis(h, p) == "alpha beta"
    # No problem → just the hypothesis content.
    assert build_query_from_hypothesis(h) == "alpha"


def test_cache_within_call_is_stable_then_clearable(climate_corpus):
    retr = InMemoryEvidenceRetriever(corpus=climate_corpus)
    first = retr.retrieve("CO2 emissions")
    second = retr.retrieve("CO2 emissions")
    assert first is second  # cached identity
    retr.reset_cache()
    third = retr.retrieve("CO2 emissions")
    # After reset we get a fresh list; identity differs but the
    # similarity-ordered content set is identical.
    assert first is not third
    assert [r.evidence.content for r in first] == [
        r.evidence.content for r in third
    ]
    assert [r.similarity for r in first] == [r.similarity for r in third]


def test_composite_merges_and_dedupes_by_content(climate_corpus):
    a = InMemoryEvidenceRetriever(corpus=climate_corpus[:2])
    b = InMemoryEvidenceRetriever(corpus=climate_corpus[1:])
    composite = CompositeEvidenceRetriever(
        [a, b], config=RetrieverConfig(top_k=5, min_similarity=0.05)
    )
    results = composite.retrieve("arctic sea ice satellite")
    contents = [r.evidence.content for r in results]
    # The overlap (sea ice) should be present exactly once.
    sea_ice_hits = [c for c in contents if "sea ice" in c]
    assert len(sea_ice_hits) == 1


def test_composite_requires_at_least_one_backend():
    with pytest.raises(ValueError):
        CompositeEvidenceRetriever([])
