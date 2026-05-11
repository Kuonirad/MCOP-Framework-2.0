/**
 * Automated Evidence Retrieval — TypeScript surface.
 *
 * Mirrors `mcop.evidence_retrieval` (Python) so a CouncilScorer or
 * front-end can request relevant evidence for a query / hypothesis
 * without taking a runtime dependency on the Python engine. The
 * default backend is a deterministic in-memory cosine retriever
 * keyed on a simple token bag — identical preprocessing to the
 * Python side so cross-runtime parity tests have a chance.
 *
 * Human primacy: every retriever advertises `allowsHumanOverride`.
 * The Guardian and CouncilScorer never use retrieved evidence to
 * silently override an explicit human input — retrieved items are
 * always advisory until a reviewer ratifies them.
 */

export interface EvidenceItem {
  content: string;
  source?: string;
  evidenceType?: string;
  weight?: number;
  metadata?: Record<string, unknown>;
}

export interface RetrieverConfig {
  topK: number;
  minSimilarity: number;
  defaultWeight: number;
  cacheWithinCall: boolean;
  allowsHumanOverride: boolean;
}

export const DEFAULT_RETRIEVER_CONFIG: RetrieverConfig = {
  topK: 5,
  minSimilarity: 0.1,
  defaultWeight: 0.5,
  cacheWithinCall: true,
  allowsHumanOverride: true,
};

export interface RetrievalResult {
  evidence: EvidenceItem;
  similarity: number;
  retrieverName: string;
}

export interface EvidenceRetriever {
  readonly name: string;
  readonly config: RetrieverConfig;
  retrieve(query: string, topK?: number): RetrievalResult[];
  resetCache(): void;
}

const TOKEN_RE = /[A-Za-z0-9']+/g;

function tokenize(text: string): string[] {
  if (!text) return [];
  const matches = text.match(TOKEN_RE);
  return matches ? matches.map((t) => t.toLowerCase()) : [];
}

function bagOfTokens(text: string): Map<string, number> {
  const bag = new Map<string, number>();
  for (const tok of tokenize(text)) {
    bag.set(tok, (bag.get(tok) ?? 0) + 1);
  }
  return bag;
}

function cosine(a: Map<string, number>, b: Map<string, number>): number {
  if (a.size === 0 || b.size === 0) return 0;

  let dot = 0;
  for (const [key, va] of a) {
    const vb = b.get(key);
    if (vb !== undefined) dot += va * vb;
  }
  if (dot === 0) return 0;

  let normA = 0;
  for (const v of a.values()) normA += v * v;
  let normB = 0;
  for (const v of b.values()) normB += v * v;
  if (normA === 0 || normB === 0) return 0;

  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export class InMemoryEvidenceRetriever implements EvidenceRetriever {
  readonly name = 'in_memory_cosine';
  readonly config: RetrieverConfig;

  private corpus: EvidenceItem[];
  private bags: Map<string, number>[];
  private cache: Map<string, RetrievalResult[]> = new Map();

  constructor(
    corpus: readonly EvidenceItem[] = [],
    config: Partial<RetrieverConfig> = {},
  ) {
    this.config = { ...DEFAULT_RETRIEVER_CONFIG, ...config };
    this.corpus = [...corpus];
    this.bags = this.corpus.map((e) => bagOfTokens(e.content));
  }

  add(evidence: EvidenceItem): void {
    this.corpus.push(evidence);
    this.bags.push(bagOfTokens(evidence.content));
  }

  retrieve(query: string, topK?: number): RetrievalResult[] {
    if (!query || this.corpus.length === 0) return [];

    if (this.config.cacheWithinCall && this.cache.has(query)) {
      return this.cache.get(query)!;
    }

    const queryBag = bagOfTokens(query);
    const scored: RetrievalResult[] = [];

    for (let i = 0; i < this.corpus.length; i++) {
      const similarity = cosine(queryBag, this.bags[i]);
      if (similarity < this.config.minSimilarity) continue;

      const item = this.corpus[i];
      scored.push({
        evidence: {
          content: item.content,
          source: item.source ?? this.name,
          evidenceType: item.evidenceType,
          weight: item.weight ?? this.config.defaultWeight,
          metadata: {
            ...(item.metadata ?? {}),
            retriever: this.name,
            similarity,
          },
        },
        similarity,
        retrieverName: this.name,
      });
    }

    scored.sort((a, b) => b.similarity - a.similarity);
    const limit = topK ?? this.config.topK;
    const result = scored.slice(0, limit);

    if (this.config.cacheWithinCall) {
      this.cache.set(query, result);
    }
    return result;
  }

  resetCache(): void {
    this.cache.clear();
  }

  get size(): number {
    return this.corpus.length;
  }
}

/**
 * Fan-out retriever that merges results from multiple backends and
 * keeps the highest similarity per unique evidence content.
 */
export class CompositeEvidenceRetriever implements EvidenceRetriever {
  readonly name = 'composite';
  readonly config: RetrieverConfig;

  constructor(
    private readonly retrievers: readonly EvidenceRetriever[],
    config: Partial<RetrieverConfig> = {},
  ) {
    if (retrievers.length === 0) {
      throw new Error('CompositeEvidenceRetriever needs ≥1 backend');
    }
    this.config = { ...DEFAULT_RETRIEVER_CONFIG, ...config };
  }

  retrieve(query: string, topK?: number): RetrievalResult[] {
    const merged = new Map<string, RetrievalResult>();
    for (const r of this.retrievers) {
      for (const result of r.retrieve(query, topK)) {
        const existing = merged.get(result.evidence.content);
        if (!existing || result.similarity > existing.similarity) {
          merged.set(result.evidence.content, result);
        }
      }
    }
    const ranked = [...merged.values()].sort(
      (a, b) => b.similarity - a.similarity,
    );
    const limit = topK ?? this.config.topK;
    return ranked.slice(0, limit);
  }

  resetCache(): void {
    for (const r of this.retrievers) r.resetCache();
  }
}
