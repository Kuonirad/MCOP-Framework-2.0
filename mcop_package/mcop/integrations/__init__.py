"""Ecosystem-integration shims for MCOP — LangChain, LlamaIndex, Haystack.

Each shim implements the upstream library's protocol shape **without**
taking a runtime dependency on the upstream library, mirroring the
TypeScript `src/integrations/` namespace. So a project that already
imports the upstream library can drop the returned object straight into
its chain — and the same shim file is the basis for an upstream PR
contributing MCOP as a memory layer to LangChain / LlamaIndex / Haystack.

The triad backing every shim is the deterministic NOVA-NEO encoder + a
Python Merkle chain anchored on RFC 8785 canonical JSON, byte-identical
with the TypeScript runtime via ``canonical_digest`` in
``mcop_package.mcop.canonical_encoding``.
"""

from .triad_harness import (
    MCOPProvenance,
    MCOPRecordResult,
    MCOPTriad,
    MCOPTriadOptions,
    ensure_triad,
    recall_from_triad,
    record_into_triad,
)
from .langchain import (
    BaseLangChainMessage,
    MCOPLangChainMemory,
    create_mcop_langchain_memory,
)
from .llamaindex import (
    MCOPLlamaIndexNode,
    MCOPLlamaIndexQuery,
    MCOPLlamaIndexQueryResult,
    MCOPLlamaIndexVectorStore,
    create_mcop_llamaindex_vector_store,
    mcop_llamaindex_node_from_text,
)
from .haystack import (
    MCOPHaystackDocument,
    MCOPHaystackDocumentStore,
    create_mcop_haystack_document_store,
    mcop_haystack_document_from_content,
)

__all__ = [
    "BaseLangChainMessage",
    "MCOPHaystackDocument",
    "MCOPHaystackDocumentStore",
    "MCOPLangChainMemory",
    "MCOPLlamaIndexNode",
    "MCOPLlamaIndexQuery",
    "MCOPLlamaIndexQueryResult",
    "MCOPLlamaIndexVectorStore",
    "MCOPProvenance",
    "MCOPRecordResult",
    "MCOPTriad",
    "MCOPTriadOptions",
    "create_mcop_haystack_document_store",
    "create_mcop_langchain_memory",
    "create_mcop_llamaindex_vector_store",
    "ensure_triad",
    "mcop_haystack_document_from_content",
    "mcop_llamaindex_node_from_text",
    "recall_from_triad",
    "record_into_triad",
]
