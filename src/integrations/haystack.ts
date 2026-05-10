/**
 * MCOP ↔ Haystack integration shim.
 *
 * Implements the Haystack 2.x `DocumentStore` protocol shape without
 * taking a runtime dependency on `haystack-ai`. The Python-canonical
 * sibling lives in `mcop_package/integrations/haystack.py` (added in the
 * follow-on PR — see `docs/integrations/haystack.md`).
 *
 * Every `writeDocuments` call funnels through the MCOP triad
 * (encode → resonate → record → etch), so a Haystack pipeline gets
 * Merkle-rooted provenance for free. `filterDocuments` returns the
 * subset matching the supplied filter; `recallByResonance` exposes the
 * Stigmergy retrieval surface for callers who want resonance-ranked
 * search instead of metadata filtering.
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

/** Haystack 2.x `Document` shape (framework-agnostic subset). */
export interface MCOPHaystackDocument {
  readonly id: string;
  readonly content: string;
  readonly meta?: Record<string, unknown>;
  readonly score?: number;
  readonly embedding?: ReadonlyArray<number>;
  readonly provenance?: MCOPProvenance;
}

/** Haystack 2.x `DuplicatePolicy` (subset). */
export type MCOPHaystackDuplicatePolicy = 'overwrite' | 'skip' | 'fail';

/** Haystack 2.x filter spec (subset — equality only, mirrors LangChain pattern). */
export type MCOPHaystackFilters = Readonly<Record<string, unknown>>;

export interface MCOPHaystackDocumentStoreOptions extends MCOPTriadOptions {
  readonly defaultPolicy?: MCOPHaystackDuplicatePolicy;
}

/**
 * MCOP-backed Haystack 2.x `DocumentStore` implementation.
 *
 * Public surface mirrors `haystack.document_stores.in_memory.InMemoryDocumentStore`
 * so a pipeline can swap a stock Haystack store for this shim without
 * other code changes.
 */
export class MCOPHaystackDocumentStore {
  private readonly triad: MCOPTriad;
  private readonly documents = new Map<string, MCOPHaystackDocument>();
  private readonly documentsByTraceId = new Map<string, string>();
  private readonly defaultPolicy: MCOPHaystackDuplicatePolicy;

  constructor(options: MCOPHaystackDocumentStoreOptions = {}) {
    this.triad = ensureTriad(options);
    this.defaultPolicy = options.defaultPolicy ?? 'overwrite';
  }

  /** Haystack `DocumentStore.count_documents`. */
  async countDocuments(): Promise<number> {
    return this.documents.size;
  }

  /**
   * Haystack `DocumentStore.write_documents`. Returns the number of
   * documents written (after applying the duplicate policy).
   */
  async writeDocuments(
    documents: ReadonlyArray<MCOPHaystackDocument>,
    policy?: MCOPHaystackDuplicatePolicy,
  ): Promise<number> {
    const effectivePolicy = policy ?? this.defaultPolicy;
    let written = 0;
    for (const doc of documents) {
      const existing = this.documents.get(doc.id);
      if (existing) {
        if (effectivePolicy === 'fail') {
          throw new Error(`Duplicate document id: ${doc.id}`);
        }
        if (effectivePolicy === 'skip') continue;
      }
      const recorded = recordIntoTriad(
        this.triad,
        doc.content,
        {
          ...(doc.meta ?? {}),
          mcop_haystack_document_id: doc.id,
        },
        `mcop-haystack:${doc.id}`,
      );
      const stored: MCOPHaystackDocument = {
        ...doc,
        embedding: doc.embedding ?? recorded.trace.context,
        provenance: recorded.provenance,
        meta: {
          ...(doc.meta ?? {}),
          mcop_stigmergy_trace_id: recorded.trace.id,
          mcop_etch_hash: recorded.etch.hash,
        },
      };
      this.documents.set(stored.id, stored);
      this.documentsByTraceId.set(recorded.trace.id, stored.id);
      written += 1;
    }
    return written;
  }

  /** Haystack `DocumentStore.filter_documents` — equality filter only. */
  async filterDocuments(
    filters?: MCOPHaystackFilters,
  ): Promise<ReadonlyArray<MCOPHaystackDocument>> {
    const all = Array.from(this.documents.values());
    if (!filters || Object.keys(filters).length === 0) return all;
    return all.filter((doc) => {
      const meta = doc.meta ?? {};
      return Object.entries(filters).every(([key, value]) => meta[key] === value);
    });
  }

  /** Haystack `DocumentStore.delete_documents`. */
  async deleteDocuments(documentIds: ReadonlyArray<string>): Promise<void> {
    for (const id of documentIds) {
      this.documents.delete(id);
      for (const [traceId, docId] of this.documentsByTraceId.entries()) {
        if (docId === id) {
          this.documentsByTraceId.delete(traceId);
        }
      }
    }
  }

  /**
   * Resonance retrieval — returns the best-matching document by Stigmergy
   * resonance against the query string, or `null` if nothing resonates.
   */
  async recallByResonance(
    query: string,
  ): Promise<{ score: number; document: MCOPHaystackDocument | null }> {
    const { resonance } = recallFromTriad(this.triad, query);
    if (!resonance.trace) return { score: resonance.score, document: null };
    const docId = this.documentsByTraceId.get(resonance.trace.id);
    const document = docId ? this.documents.get(docId) ?? null : null;
    return { score: resonance.score, document };
  }

  /** Expose the underlying triad for advanced callers. */
  get triadHandle(): MCOPTriad {
    return this.triad;
  }
}

/** Factory matching the rest of `src/integrations/`. */
export function createMCOPHaystackDocumentStore(
  options: MCOPHaystackDocumentStoreOptions = {},
): MCOPHaystackDocumentStore {
  return new MCOPHaystackDocumentStore(options);
}

/** Convenience: build a Haystack-shape document from raw content + metadata. */
export function mcopHaystackDocumentFromContent(
  content: string,
  meta?: Record<string, unknown>,
): MCOPHaystackDocument {
  return {
    id: randomUUID(),
    content,
    meta,
  };
}
