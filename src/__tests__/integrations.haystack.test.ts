import {
  createMCOPHaystackDocumentStore,
  mcopHaystackDocumentFromContent,
  MCOPHaystackDocumentStore,
} from '../integrations/haystack';

describe('MCOPHaystackDocumentStore', () => {
  it('factory returns an empty store with the canonical Haystack shape', async () => {
    const store = createMCOPHaystackDocumentStore();
    expect(store).toBeInstanceOf(MCOPHaystackDocumentStore);
    expect(await store.countDocuments()).toBe(0);
  });

  it('writeDocuments records each doc through the triad', async () => {
    const store = createMCOPHaystackDocumentStore();
    const docs = [
      mcopHaystackDocumentFromContent('alpha trace document'),
      mcopHaystackDocumentFromContent('beta trace document', { tier: 'gold' }),
    ];
    const written = await store.writeDocuments(docs);
    expect(written).toBe(2);
    expect(await store.countDocuments()).toBe(2);
    const all = await store.filterDocuments();
    for (const doc of all) {
      expect(doc.provenance?.etchHash.length).toBeGreaterThan(0);
      expect(typeof doc.meta?.mcop_stigmergy_trace_id).toBe('string');
    }
  });

  it('filterDocuments applies an equality filter on metadata', async () => {
    const store = createMCOPHaystackDocumentStore();
    await store.writeDocuments([
      mcopHaystackDocumentFromContent('gold doc', { tier: 'gold' }),
      mcopHaystackDocumentFromContent('silver doc', { tier: 'silver' }),
    ]);
    const golds = await store.filterDocuments({ tier: 'gold' });
    expect(golds).toHaveLength(1);
    expect(golds[0].meta?.tier).toBe('gold');
  });

  it('filterDocuments returns all documents when filters omitted or empty', async () => {
    const store = createMCOPHaystackDocumentStore();
    await store.writeDocuments([
      mcopHaystackDocumentFromContent('one'),
      mcopHaystackDocumentFromContent('two'),
    ]);
    expect(await store.filterDocuments()).toHaveLength(2);
    expect(await store.filterDocuments({})).toHaveLength(2);
  });

  it('writeDocuments duplicate policy "skip" leaves existing docs intact', async () => {
    const store = createMCOPHaystackDocumentStore({ defaultPolicy: 'skip' });
    const doc = mcopHaystackDocumentFromContent('original', { v: 1 });
    await store.writeDocuments([doc]);
    const dup = { ...doc, content: 'updated' };
    await store.writeDocuments([dup]);
    const stored = (await store.filterDocuments())[0];
    expect(stored.content).toBe('original');
  });

  it('writeDocuments duplicate policy "fail" throws on duplicate id', async () => {
    const store = createMCOPHaystackDocumentStore();
    const doc = mcopHaystackDocumentFromContent('first');
    await store.writeDocuments([doc]);
    await expect(store.writeDocuments([doc], 'fail')).rejects.toThrow(/Duplicate document id/);
  });

  it('writeDocuments duplicate policy "overwrite" replaces the existing doc', async () => {
    const store = createMCOPHaystackDocumentStore();
    const doc = mcopHaystackDocumentFromContent('first', { v: 1 });
    await store.writeDocuments([doc]);
    await store.writeDocuments([{ ...doc, content: 'second', meta: { v: 2 } }], 'overwrite');
    const stored = (await store.filterDocuments())[0];
    expect(stored.content).toBe('second');
    expect(stored.meta?.v).toBe(2);
  });

  it('deleteDocuments removes the supplied ids', async () => {
    const store = createMCOPHaystackDocumentStore();
    const a = mcopHaystackDocumentFromContent('a');
    const b = mcopHaystackDocumentFromContent('b');
    await store.writeDocuments([a, b]);
    await store.deleteDocuments([a.id]);
    const remaining = await store.filterDocuments();
    expect(remaining.map((d) => d.id)).toEqual([b.id]);
  });

  it('recallByResonance returns the best-matching document', async () => {
    const store = createMCOPHaystackDocumentStore({ resonanceThreshold: 0.05 });
    const doc = mcopHaystackDocumentFromContent(
      'the holographic etch is an append-only confidence ledger',
    );
    await store.writeDocuments([doc]);
    const hit = await store.recallByResonance(
      'the holographic etch is an append-only confidence ledger',
    );
    expect(hit.score).toBeGreaterThan(0);
    expect(hit.document?.id).toBe(doc.id);
  });

  it('recallByResonance returns null document when nothing resonates', async () => {
    const store = createMCOPHaystackDocumentStore();
    const hit = await store.recallByResonance('unseen query');
    expect(hit.score).toBe(0);
    expect(hit.document).toBeNull();
  });

  it('triadHandle exposes the underlying triad for advanced callers', () => {
    const store = createMCOPHaystackDocumentStore();
    expect(store.triadHandle.encoder).toBeDefined();
    expect(store.triadHandle.stigmergy).toBeDefined();
    expect(store.triadHandle.etch).toBeDefined();
  });

  it('mcopHaystackDocumentFromContent produces a uuid id', () => {
    const doc = mcopHaystackDocumentFromContent('payload');
    expect(doc.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });
});
