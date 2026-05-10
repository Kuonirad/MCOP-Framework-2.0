"""Tests for ``mcop_package.mcop.integrations`` Python shims.

Mirrors `src/__tests__/integrations.*.test.ts` 1:1 so the TS and
Python integrations can be confirmed forensically equivalent.
"""

from __future__ import annotations

import pytest

from mcop.integrations import (
    BaseLangChainMessage,
    MCOPHaystackDocument,
    MCOPLlamaIndexNode,
    MCOPLlamaIndexQuery,
    create_mcop_haystack_document_store,
    create_mcop_langchain_memory,
    create_mcop_llamaindex_vector_store,
    ensure_triad,
    mcop_haystack_document_from_content,
    mcop_llamaindex_node_from_text,
    record_into_triad,
    recall_from_triad,
)
from mcop.integrations.triad_harness import (
    MCOPHolographicEtch,
    MCOPStigmergy,
    MCOPTriadOptions,
)


# ---------- triad harness ---------------------------------------------------


def test_ensure_triad_lazily_builds_a_default_triad() -> None:
    triad = ensure_triad()
    assert triad.encoder.dimensions == 64
    assert isinstance(triad.stigmergy, MCOPStigmergy)
    assert isinstance(triad.etch, MCOPHolographicEtch)


def test_ensure_triad_returns_supplied_triad_verbatim() -> None:
    base = ensure_triad()
    again = ensure_triad(MCOPTriadOptions(triad=base))
    assert again is base


def test_record_into_triad_emits_full_provenance() -> None:
    triad = ensure_triad()
    result = record_into_triad(triad, "positive resonance memory", {"tag": "demo"})
    assert result.provenance.etch_hash
    assert result.provenance.merkle_root
    assert result.provenance.auditable is True
    assert result.provenance.timestamp.endswith("Z")


def test_recall_from_triad_returns_zero_score_when_empty() -> None:
    triad = ensure_triad()
    _, resonance = recall_from_triad(triad, "nothing recorded")
    assert resonance.score == 0.0
    assert resonance.trace is None


def test_recall_from_triad_returns_match_above_threshold() -> None:
    triad = ensure_triad(MCOPTriadOptions(resonance_threshold=0.05))
    record_into_triad(triad, "the holographic etch is rank-1 and replayable")
    _, resonance = recall_from_triad(
        triad, "the holographic etch is rank-1 and replayable"
    )
    assert resonance.score > 0
    assert resonance.trace is not None


# ---------- LangChain shim --------------------------------------------------


def test_langchain_factory_returns_supplied_session_id() -> None:
    memory = create_mcop_langchain_memory(session_id="agent-007")
    assert memory.session_id == "agent-007"


def test_langchain_default_session_id() -> None:
    memory = create_mcop_langchain_memory()
    assert memory.session_id == "mcop-langchain-default"


def test_langchain_add_messages_records_with_provenance() -> None:
    memory = create_mcop_langchain_memory(session_id="agent-resonance")
    memory.add_messages(
        [
            BaseLangChainMessage(type="human", content="what is mcop"),
            BaseLangChainMessage(type="ai", content="a recursive triad"),
        ]
    )
    recorded = memory.get_messages()
    assert len(recorded) == 2
    for message in recorded:
        assert message.provenance is not None
        assert message.provenance.etch_hash
        assert message.provenance.auditable is True
        assert (
            message.additional_kwargs is not None
            and "mcop_stigmergy_trace_id" in message.additional_kwargs
        )


def test_langchain_clear_empties_history() -> None:
    memory = create_mcop_langchain_memory()
    memory.add_messages(
        [BaseLangChainMessage(type="human", content="alpha"),
         BaseLangChainMessage(type="human", content="beta")]
    )
    memory.clear()
    assert memory.get_messages() == []


def test_langchain_etch_every_message_false_skips_etching() -> None:
    memory = create_mcop_langchain_memory(etch_every_message=False)
    memory.add_message(BaseLangChainMessage(type="human", content="cheap memory"))
    recorded = memory.get_messages()
    assert recorded[0].provenance is None


def test_langchain_recall_returns_matching_message() -> None:
    memory = create_mcop_langchain_memory(
        triad_options=MCOPTriadOptions(resonance_threshold=0.05)
    )
    memory.add_messages(
        [
            BaseLangChainMessage(
                type="human",
                content="the holographic etch is an append-only confidence ledger",
            ),
            BaseLangChainMessage(
                type="human", content="completely unrelated topic about kelp forests"
            ),
        ]
    )
    hit = memory.recall_by_resonance(
        "the holographic etch is an append-only confidence ledger"
    )
    assert hit["score"] > 0
    assert hit["message"] is not None
    assert "holographic etch" in hit["message"].content


def test_langchain_recall_returns_none_when_no_match() -> None:
    memory = create_mcop_langchain_memory()
    hit = memory.recall_by_resonance("nothing has been recorded yet")
    assert hit["score"] == 0.0
    assert hit["message"] is None


def test_langchain_messages_property_mirrors_get_messages() -> None:
    memory = create_mcop_langchain_memory()
    memory.add_message(BaseLangChainMessage(type="human", content="hi"))
    assert memory.messages == memory.get_messages()


# ---------- LlamaIndex shim -------------------------------------------------


def test_llamaindex_factory_returns_empty_store() -> None:
    store = create_mcop_llamaindex_vector_store()
    assert store.size() == 0
    assert store.stores_text is True
    assert store.is_embedding_query is True


def test_llamaindex_add_records_nodes() -> None:
    store = create_mcop_llamaindex_vector_store()
    nodes = [
        mcop_llamaindex_node_from_text("alpha trace one"),
        mcop_llamaindex_node_from_text("beta trace two"),
    ]
    ids = store.add(nodes)
    assert ids == [n.id_ for n in nodes]
    assert store.size() == 2


def test_llamaindex_query_returns_matching_node() -> None:
    store = create_mcop_llamaindex_vector_store(
        triad_options=MCOPTriadOptions(resonance_threshold=0.05)
    )
    node = mcop_llamaindex_node_from_text(
        "the nova-neo encoder is deterministic and entropy-normalised"
    )
    store.add([node])
    result = store.query(
        MCOPLlamaIndexQuery(
            query_str="the nova-neo encoder is deterministic and entropy-normalised",
            similarity_top_k=1,
        )
    )
    assert result.ids == [node.id_]
    assert result.similarities[0] > 0
    assert result.nodes[0].provenance is not None


def test_llamaindex_query_empty_store_returns_empty_result() -> None:
    store = create_mcop_llamaindex_vector_store()
    result = store.query(MCOPLlamaIndexQuery(query_str="totally unseen"))
    assert result.nodes == []


def test_llamaindex_query_empty_string_returns_empty_result() -> None:
    store = create_mcop_llamaindex_vector_store()
    result = store.query(MCOPLlamaIndexQuery(query_str=""))
    assert result.nodes == []


def test_llamaindex_delete_removes_node() -> None:
    store = create_mcop_llamaindex_vector_store()
    node = mcop_llamaindex_node_from_text("to delete")
    store.add([node])
    store.delete(node.id_)
    assert store.size() == 0


def test_llamaindex_delete_unknown_is_noop() -> None:
    store = create_mcop_llamaindex_vector_store()
    store.delete("does-not-exist")  # no exception


def test_llamaindex_persist_is_noop() -> None:
    store = create_mcop_llamaindex_vector_store()
    store.persist()


# ---------- Haystack shim ---------------------------------------------------


def test_haystack_factory_returns_empty_store() -> None:
    store = create_mcop_haystack_document_store()
    assert store.count_documents() == 0


def test_haystack_write_documents_records_with_provenance() -> None:
    store = create_mcop_haystack_document_store()
    docs = [
        mcop_haystack_document_from_content("alpha"),
        mcop_haystack_document_from_content("beta", {"tier": "gold"}),
    ]
    written = store.write_documents(docs)
    assert written == 2
    assert store.count_documents() == 2
    for doc in store.filter_documents():
        assert doc.provenance is not None
        assert doc.provenance.etch_hash


def test_haystack_filter_documents_applies_equality_filter() -> None:
    store = create_mcop_haystack_document_store()
    store.write_documents(
        [
            mcop_haystack_document_from_content("a", {"tier": "gold"}),
            mcop_haystack_document_from_content("b", {"tier": "silver"}),
        ]
    )
    golds = store.filter_documents({"tier": "gold"})
    assert len(golds) == 1
    assert (golds[0].meta or {}).get("tier") == "gold"


def test_haystack_filter_documents_returns_all_when_filter_empty() -> None:
    store = create_mcop_haystack_document_store()
    store.write_documents(
        [
            mcop_haystack_document_from_content("a"),
            mcop_haystack_document_from_content("b"),
        ]
    )
    assert len(store.filter_documents()) == 2
    assert len(store.filter_documents({})) == 2


def test_haystack_skip_policy_leaves_existing_intact() -> None:
    store = create_mcop_haystack_document_store(default_policy="skip")
    doc = MCOPHaystackDocument(id="alpha", content="original")
    store.write_documents([doc])
    store.write_documents([MCOPHaystackDocument(id="alpha", content="updated")])
    stored = store.filter_documents()[0]
    assert stored.content == "original"


def test_haystack_fail_policy_raises_on_duplicate() -> None:
    store = create_mcop_haystack_document_store()
    doc = MCOPHaystackDocument(id="alpha", content="first")
    store.write_documents([doc])
    with pytest.raises(ValueError, match="Duplicate document id"):
        store.write_documents([doc], policy="fail")


def test_haystack_overwrite_replaces_existing() -> None:
    store = create_mcop_haystack_document_store()
    doc = MCOPHaystackDocument(id="alpha", content="first", meta={"v": 1})
    store.write_documents([doc])
    store.write_documents(
        [MCOPHaystackDocument(id="alpha", content="second", meta={"v": 2})],
        policy="overwrite",
    )
    stored = store.filter_documents()[0]
    assert stored.content == "second"
    assert (stored.meta or {}).get("v") == 2


def test_haystack_delete_documents_removes_ids() -> None:
    store = create_mcop_haystack_document_store()
    a = mcop_haystack_document_from_content("a")
    b = mcop_haystack_document_from_content("b")
    store.write_documents([a, b])
    store.delete_documents([a.id])
    remaining = store.filter_documents()
    assert [d.id for d in remaining] == [b.id]


def test_haystack_recall_returns_matching_document() -> None:
    store = create_mcop_haystack_document_store(
        triad_options=MCOPTriadOptions(resonance_threshold=0.05)
    )
    doc = mcop_haystack_document_from_content(
        "the holographic etch is an append-only confidence ledger"
    )
    store.write_documents([doc])
    hit = store.recall_by_resonance(
        "the holographic etch is an append-only confidence ledger"
    )
    assert hit["score"] > 0
    assert hit["document"] is not None
    assert hit["document"].id == doc.id


def test_haystack_recall_returns_none_when_no_match() -> None:
    store = create_mcop_haystack_document_store()
    hit = store.recall_by_resonance("unseen")
    assert hit["score"] == 0.0
    assert hit["document"] is None


def test_haystack_factory_helper_produces_uuid_id() -> None:
    doc = mcop_haystack_document_from_content("payload")
    assert len(doc.id.split("-")) == 5  # uuid v4 hex format
