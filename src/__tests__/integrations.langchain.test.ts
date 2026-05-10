import {
  BaseLangChainMessage,
  createMCOPLangChainMemory,
  MCOPLangChainMemory,
} from '../integrations/langchain';

describe('MCOPLangChainMemory', () => {
  function userMsg(content: string): BaseLangChainMessage {
    return { type: 'human', content };
  }
  function aiMsg(content: string): BaseLangChainMessage {
    return { type: 'ai', content };
  }

  it('factory returns a fresh memory with the supplied sessionId', () => {
    const memory = createMCOPLangChainMemory({ sessionId: 'agent-007' });
    expect(memory).toBeInstanceOf(MCOPLangChainMemory);
    expect(memory.sessionId).toBe('agent-007');
  });

  it('default sessionId falls back to the canonical placeholder', () => {
    const memory = createMCOPLangChainMemory();
    expect(memory.sessionId).toBe('mcop-langchain-default');
  });

  it('addMessages records each entry and surfaces MCOP provenance', async () => {
    const memory = createMCOPLangChainMemory({ sessionId: 'agent-resonance' });
    await memory.addMessages([userMsg('what is mcop'), aiMsg('a recursive triad')]);

    const recorded = await memory.getMessages();
    expect(recorded).toHaveLength(2);
    for (const message of recorded) {
      expect(message.provenance).toBeDefined();
      expect(message.provenance?.etchHash.length).toBeGreaterThan(0);
      expect(message.provenance?.merkleRoot).toBeDefined();
      expect(message.provenance?.auditable).toBe(true);
      expect(typeof message.additional_kwargs?.mcop_stigmergy_trace_id).toBe('string');
      expect(typeof message.additional_kwargs?.mcop_etch_hash).toBe('string');
    }
  });

  it('addMessage is the singular convenience over addMessages', async () => {
    const memory = createMCOPLangChainMemory();
    await memory.addMessage(userMsg('hello triad'));
    expect(await memory.getMessages()).toHaveLength(1);
  });

  it('clear() empties the message history', async () => {
    const memory = createMCOPLangChainMemory();
    await memory.addMessages([userMsg('first'), userMsg('second')]);
    await memory.clear();
    expect(await memory.getMessages()).toHaveLength(0);
  });

  it('etchEveryMessage=false skips etching but still preserves shape', async () => {
    const memory = createMCOPLangChainMemory({ etchEveryMessage: false });
    await memory.addMessages([userMsg('cheap memory')]);
    const recorded = await memory.getMessages();
    expect(recorded).toHaveLength(1);
    expect(recorded[0].provenance).toBeUndefined();
  });

  it('recallByResonance returns the matching message for a strong query', async () => {
    const memory = createMCOPLangChainMemory({
      sessionId: 'agent-recall',
      resonanceThreshold: 0.05,
    });
    await memory.addMessages([
      userMsg('the holographic etch is an append-only confidence ledger'),
      userMsg('completely unrelated topic about kelp forests'),
    ]);
    const hit = await memory.recallByResonance(
      'the holographic etch is an append-only confidence ledger',
    );
    expect(hit.score).toBeGreaterThan(0);
    expect(hit.message?.content).toContain('holographic etch');
  });

  it('recallByResonance returns score=0 when no traces match', async () => {
    const memory = createMCOPLangChainMemory();
    const hit = await memory.recallByResonance('nothing has been recorded yet');
    expect(hit.score).toBe(0);
    expect(hit.message).toBeNull();
  });

  it('triadHandle exposes the underlying triad for advanced callers', () => {
    const memory = createMCOPLangChainMemory();
    const triad = memory.triadHandle;
    expect(triad.encoder).toBeDefined();
    expect(triad.stigmergy).toBeDefined();
    expect(triad.etch).toBeDefined();
  });
});
