import {
  createMCOPLlamaIndexVectorStore,
  mcopLlamaIndexNodeFromText,
  MCOPLlamaIndexVectorStore,
} from '../integrations/llamaIndex';

describe('MCOPLlamaIndexVectorStore', () => {
  it('factory returns a fresh store with the LlamaIndex feature flags set', () => {
    const store = createMCOPLlamaIndexVectorStore();
    expect(store).toBeInstanceOf(MCOPLlamaIndexVectorStore);
    expect(store.storesText).toBe(true);
    expect(store.isEmbeddingQuery).toBe(true);
    expect(store.size()).toBe(0);
  });

  it('add() records nodes through the triad and surfaces provenance + ids', async () => {
    const store = createMCOPLlamaIndexVectorStore();
    const nodes = [
      mcopLlamaIndexNodeFromText('the nova-neo encoder is deterministic'),
      mcopLlamaIndexNodeFromText('the holographic etch is rank-1 and replayable'),
    ];
    const ids = await store.add(nodes);
    expect(ids).toEqual(nodes.map((node) => node.id_));
    expect(store.size()).toBe(2);
  });

  it('query() returns the resonance-matching node for a similar query', async () => {
    const store = createMCOPLlamaIndexVectorStore({ resonanceThreshold: 0.05 });
    const node = mcopLlamaIndexNodeFromText(
      'the nova-neo encoder is deterministic and entropy-normalised',
    );
    await store.add([node]);
    const result = await store.query({
      queryStr: 'the nova-neo encoder is deterministic and entropy-normalised',
      similarityTopK: 1,
    });
    expect(result.ids).toEqual([node.id_]);
    expect(result.similarities[0]).toBeGreaterThan(0);
    expect(result.nodes[0].provenance?.etchHash.length).toBeGreaterThan(0);
  });

  it('query() returns empty result for an unindexed query', async () => {
    const store = createMCOPLlamaIndexVectorStore();
    const result = await store.query({ queryStr: 'totally unseen query' });
    expect(result.nodes).toHaveLength(0);
    expect(result.similarities).toHaveLength(0);
    expect(result.ids).toHaveLength(0);
  });

  it('query() with empty string returns empty result without throwing', async () => {
    const store = createMCOPLlamaIndexVectorStore();
    const result = await store.query({ queryStr: '' });
    expect(result.nodes).toHaveLength(0);
  });

  it('query() honours the supplied similarityTopK upper bound', async () => {
    const store = createMCOPLlamaIndexVectorStore({ resonanceThreshold: 0.05, defaultTopK: 5 });
    await store.add([mcopLlamaIndexNodeFromText('alpha trace one')]);
    const result = await store.query({ queryStr: 'alpha trace one', similarityTopK: 3 });
    expect(result.nodes.length).toBeLessThanOrEqual(3);
  });

  it('delete() removes the corresponding node and trace mapping', async () => {
    const store = createMCOPLlamaIndexVectorStore();
    const node = mcopLlamaIndexNodeFromText('to be deleted');
    await store.add([node]);
    expect(store.size()).toBe(1);
    await store.delete(node.id_);
    expect(store.size()).toBe(0);
  });

  it('delete() is a no-op for an unknown node id', async () => {
    const store = createMCOPLlamaIndexVectorStore();
    await expect(store.delete('does-not-exist')).resolves.toBeUndefined();
  });

  it('persist() resolves without throwing for the in-memory shim', async () => {
    const store = createMCOPLlamaIndexVectorStore();
    await expect(store.persist()).resolves.toBeUndefined();
  });

  it('triadHandle exposes the underlying triad for advanced callers', () => {
    const store = createMCOPLlamaIndexVectorStore();
    expect(store.triadHandle.encoder).toBeDefined();
    expect(store.triadHandle.stigmergy).toBeDefined();
    expect(store.triadHandle.etch).toBeDefined();
  });

  it('mcopLlamaIndexNodeFromText produces a uuid id and carries metadata', () => {
    const node = mcopLlamaIndexNodeFromText('hello', { tag: 'demo' });
    expect(node.id_).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(node.metadata?.tag).toBe('demo');
  });
});
