import {
  CompositeEvidenceRetriever,
  InMemoryEvidenceRetriever,
  type EvidenceItem,
} from '../utils/evidenceRetriever';

const climateCorpus: EvidenceItem[] = [
  {
    content:
      'Anthropogenic CO2 emissions are the dominant driver of recent climate change.',
    source: 'IPCC AR6',
    evidenceType: 'peer_reviewed',
    weight: 0.95,
  },
  {
    content:
      'Arctic sea ice has retreated since 1979 satellite records began.',
    source: 'NASA',
    evidenceType: 'documented_observation',
    weight: 0.85,
  },
  {
    content: 'Tomatoes are a fruit in the botanical sense.',
    source: 'trivia',
    evidenceType: 'anecdotal',
    weight: 0.2,
  },
];

describe('InMemoryEvidenceRetriever', () => {
  it('returns top-K results sorted by similarity', () => {
    const r = new InMemoryEvidenceRetriever(climateCorpus, {
      topK: 2,
      minSimilarity: 0.05,
    });
    const results = r.retrieve(
      'climate change arctic sea ice emissions',
    );
    expect(results.length).toBe(2);
    expect(results[0].similarity).toBeGreaterThanOrEqual(
      results[1].similarity,
    );
    const contents = results.map((x) => x.evidence.content);
    expect(contents.some((c) => c.includes('CO2'))).toBe(true);
    expect(contents.some((c) => c.includes('sea ice'))).toBe(true);
    expect(contents.some((c) => c.includes('Tomato'))).toBe(false);
  });

  it('filters out items below minSimilarity', () => {
    const r = new InMemoryEvidenceRetriever(climateCorpus, {
      minSimilarity: 0.99,
    });
    expect(r.retrieve('nothing matches this query')).toEqual([]);
  });

  it('attaches provenance metadata to every hit', () => {
    const r = new InMemoryEvidenceRetriever(climateCorpus);
    const [hit] = r.retrieve('anthropogenic emissions', 1);
    expect(hit.retrieverName).toBe('in_memory_cosine');
    expect(hit.evidence.metadata).toMatchObject({
      retriever: 'in_memory_cosine',
    });
    expect(hit.evidence.metadata?.similarity).toBeGreaterThan(0);
  });

  it('caches results within a call and resets on demand', () => {
    const r = new InMemoryEvidenceRetriever(climateCorpus);
    const first = r.retrieve('CO2 emissions');
    const second = r.retrieve('CO2 emissions');
    expect(second).toBe(first);
    r.resetCache();
    const third = r.retrieve('CO2 emissions');
    expect(third).not.toBe(first);
    expect(third.map((x) => x.evidence.content)).toEqual(
      first.map((x) => x.evidence.content),
    );
  });

  it('returns empty for empty corpus or empty query', () => {
    const empty = new InMemoryEvidenceRetriever([]);
    expect(empty.retrieve('anything')).toEqual([]);

    const r = new InMemoryEvidenceRetriever(climateCorpus);
    expect(r.retrieve('')).toEqual([]);
  });
});

describe('CompositeEvidenceRetriever', () => {
  it('merges results and dedupes by evidence content', () => {
    const a = new InMemoryEvidenceRetriever(climateCorpus.slice(0, 2));
    const b = new InMemoryEvidenceRetriever(climateCorpus.slice(1));
    const composite = new CompositeEvidenceRetriever([a, b], {
      topK: 5,
      minSimilarity: 0.05,
    });
    const results = composite.retrieve('arctic sea ice satellite');
    const seaIceHits = results.filter((r) =>
      r.evidence.content.includes('sea ice'),
    );
    expect(seaIceHits.length).toBe(1);
  });

  it('throws when constructed with zero backends', () => {
    expect(() => new CompositeEvidenceRetriever([])).toThrow();
  });
});
