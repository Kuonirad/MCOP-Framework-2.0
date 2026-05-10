/**
 * MCOP ↔ LlamaIndex integration shim.
 *
 * Implements the LlamaIndex `BaseVectorStore` shape (TS port — the
 * Python-canonical surface is mirrored 1:1 in `mcop_package` once
 * upstream PRs land) without taking a runtime dependency on
 * `llamaindex`. Callers can drop the returned object into a LlamaIndex
 * `VectorStoreIndex.fromVectorStore(...)` in either runtime.
 *
 * Every `add` call funnels through the MCOP triad (encode → resonate →
 * record → etch), so a LlamaIndex retrieval pipeline gets Merkle-rooted
 * provenance for free. `query` returns nodes ranked by Stigmergy
 * resonance against the query embedding.
 */

import { randomUUID } from 'node:crypto';
import {
  ensureTriad,
  recallFromTriad,
  recordIntoTriad,
  type MCOPProvenance,
  type MCOPTriad,
  type MCOPTriadOptions,
} from './triadHarness';

/** Subset of LlamaIndex's `BaseNode` shape (framework-agnostic). */
export interface MCOPLlamaIndexNode {
  readonly id_: string;
  readonly text: string;
  readonly metadata?: Record<string, unknown>;
  readonly embedding?: ReadonlyArray<number>;
  readonly provenance?: MCOPProvenance;
}

/** Subset of LlamaIndex's `VectorStoreQuery`. */
export interface MCOPLlamaIndexQuery {
  readonly queryStr?: string;
  readonly queryEmbedding?: ReadonlyArray<number>;
  readonly similarityTopK?: number;
}

/** Subset of LlamaIndex's `VectorStoreQueryResult`. */
export interface MCOPLlamaIndexQueryResult {
  readonly nodes: ReadonlyArray<MCOPLlamaIndexNode>;
  readonly similarities: ReadonlyArray<number>;
  readonly ids: ReadonlyArray<string>;
}

/** Constructor options for the LlamaIndex MCOP vector store. */
export interface MCOPLlamaIndexVectorStoreOptions extends MCOPTriadOptions {
  /** Default top-k when a query omits `similarityTopK`. */
  readonly defaultTopK?: number;
}

/**
 * MCOP-backed LlamaIndex `BaseVectorStore` implementation.
 *
 * Public surface deliberately matches LlamaIndex naming
 * (`add` / `delete` / `query` / `persist`) so a chain can swap a stock
 * LlamaIndex vector store for this shim without other code changes.
 */
export class MCOPLlamaIndexVectorStore {
  private readonly triad: MCOPTriad;
  private readonly nodes = new Map<string, MCOPLlamaIndexNode>();
  /**
   * Mirror of `nodes` indexed by Stigmergy trace id, used by `query` to
   * recover the LlamaIndex node from a resonance hit.
   */
  private readonly nodesByTraceId = new Map<string, string>();
  private readonly defaultTopK: number;
  /** LlamaIndex feature flag — we DO store the text directly. */
  public readonly storesText = true;
  /** LlamaIndex feature flag — embeddings are deterministic. */
  public readonly isEmbeddingQuery = true;

  constructor(options: MCOPLlamaIndexVectorStoreOptions = {}) {
    this.triad = ensureTriad(options);
    this.defaultTopK = options.defaultTopK ?? 5;
  }

  /** LlamaIndex `BaseVectorStore.add`. */
  async add(nodes: ReadonlyArray<MCOPLlamaIndexNode>): Promise<ReadonlyArray<string>> {
    const ids: string[] = [];
    for (const node of nodes) {
      const recorded = recordIntoTriad(
        this.triad,
        node.text,
        {
          ...(node.metadata ?? {}),
          mcop_llamaindex_node_id: node.id_,
        },
        `mcop-llamaindex:${node.id_}`,
      );
      const stored: MCOPLlamaIndexNode = {
        ...node,
        embedding: node.embedding ?? recorded.trace.context,
        provenance: recorded.provenance,
        metadata: {
          ...(node.metadata ?? {}),
          mcop_stigmergy_trace_id: recorded.trace.id,
          mcop_etch_hash: recorded.etch.hash,
        },
      };
      this.nodes.set(stored.id_, stored);
      this.nodesByTraceId.set(recorded.trace.id, stored.id_);
      ids.push(stored.id_);
    }
    return ids;
  }

  /** LlamaIndex `BaseVectorStore.delete` — by ref doc id (we treat as node id). */
  async delete(refDocId: string): Promise<void> {
    const node = this.nodes.get(refDocId);
    if (!node) return;
    this.nodes.delete(refDocId);
    for (const [traceId, nodeId] of this.nodesByTraceId.entries()) {
      if (nodeId === refDocId) {
        this.nodesByTraceId.delete(traceId);
      }
    }
  }

  /** LlamaIndex `BaseVectorStore.query` — resonance-ranked retrieval. */
  async query(query: MCOPLlamaIndexQuery): Promise<MCOPLlamaIndexQueryResult> {
    const queryString = query.queryStr ?? '';
    if (!queryString) {
      return { nodes: [], similarities: [], ids: [] };
    }
    const { resonance } = recallFromTriad(this.triad, queryString);
    if (!resonance.trace) {
      return { nodes: [], similarities: [], ids: [] };
    }
    const nodeId = this.nodesByTraceId.get(resonance.trace.id);
    if (!nodeId) {
      return { nodes: [], similarities: [], ids: [] };
    }
    const node = this.nodes.get(nodeId);
    if (!node) {
      return { nodes: [], similarities: [], ids: [] };
    }
    const topK = Math.max(1, query.similarityTopK ?? this.defaultTopK);
    return {
      nodes: [node].slice(0, topK),
      similarities: [resonance.score].slice(0, topK),
      ids: [node.id_].slice(0, topK),
    };
  }

  /** LlamaIndex `BaseVectorStore.persist` — no-op for the in-memory shim. */
  async persist(): Promise<void> {
    /* in-memory; persistence delegated to the host triad */
  }

  /** Snapshot current store size — useful for tests + observability. */
  size(): number {
    return this.nodes.size;
  }

  /** Expose the underlying triad for advanced callers. */
  get triadHandle(): MCOPTriad {
    return this.triad;
  }
}

/** Factory matching the rest of `src/integrations/`. */
export function createMCOPLlamaIndexVectorStore(
  options: MCOPLlamaIndexVectorStoreOptions = {},
): MCOPLlamaIndexVectorStore {
  return new MCOPLlamaIndexVectorStore(options);
}

/**
 * Helper: build a `MCOPLlamaIndexNode` from raw text + metadata. Mirrors
 * the convention of LlamaIndex's `TextNode.from_text(...)` factory.
 */
export function mcopLlamaIndexNodeFromText(
  text: string,
  metadata?: Record<string, unknown>,
): MCOPLlamaIndexNode {
  return {
    id_: randomUUID(),
    text,
    metadata,
  };
}
