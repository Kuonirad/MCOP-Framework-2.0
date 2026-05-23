import {
  DEFAULT_NOVA_EVOLVE_CONFIG,
  HolographicEtch,
  NovaEvolveTuner,
  StigmergyV5,
  createLLMProposalGenerator,
  createOpenAICompatibleProposalClient,
} from '../core';

describe('NovaEvolveTuner', () => {
  function makeDeps() {
    return {
      stigmergy: new StigmergyV5({ resonanceThreshold: 0, maxTraces: 64 }),
      etch: new HolographicEtch({ confidenceFloor: 0, maxEtches: 64 }),
    };
  }

  it('waits for the configured interval before emitting a meta decision', async () => {
    const deps = makeDeps();
    const tuner = new NovaEvolveTuner(deps, DEFAULT_NOVA_EVOLVE_CONFIG, {
      metaTuneInterval: 2,
      proposalGenerator: () => ({
        knob: 'noveltyPressure',
        delta: 0.05,
        rationale: 'interval test',
      }),
    });

    await expect(tuner.maybeMetaTune()).resolves.toBeNull();
    const decision = await tuner.maybeMetaTune();

    expect(decision).not.toBeNull();
    expect(decision?.metaMerkleRoot).toHaveLength(64);
    expect(deps.stigmergy.getRecent(1)[0].metadata?.type).toBe('NOVA_EVOLVE_META_TUNE');
  });

  it('accepts a useful single-knob mutation and records an auditable genome root', async () => {
    const deps = makeDeps();
    const tuner = new NovaEvolveTuner(deps, DEFAULT_NOVA_EVOLVE_CONFIG, {
      metaTuneInterval: 1,
      projectedGainThreshold: 0.001,
      now: () => new Date('2026-05-07T00:00:00.000Z'),
      proposalGenerator: () => ({
        knob: 'mutationTemperature',
        delta: 0.08,
        rationale: 'raise exploration for hard ARC abstractions',
      }),
    });

    const decision = await tuner.maybeMetaTune([
      { accuracy: 0.62, novelty: 0.28, entropy: 0.92, latencyMs: 4.4, confidence: 0.72 },
    ]);

    expect(decision?.accepted).toBe(true);
    expect(decision?.depth).toBe(1);
    expect(tuner.getCurrentConfig().mutationTemperature).toBeCloseTo(0.93);
    expect(tuner.getMetaMerkleRoot()).toBe(decision?.metaMerkleRoot);
    expect(tuner.getMetaDecisions(1)[0].timestamp).toBe('2026-05-07T00:00:00.000Z');
  });

  it('rejects low-gain proposals without changing the current config', async () => {
    const deps = makeDeps();
    const tuner = new NovaEvolveTuner(deps, DEFAULT_NOVA_EVOLVE_CONFIG, {
      metaTuneInterval: 1,
      projectedGainThreshold: 0.5,
      proposalGenerator: () => ({
        knob: 'noveltyPressure',
        delta: 0.01,
        rationale: 'too small to accept',
      }),
    });

    const decision = await tuner.maybeMetaTune([{ accuracy: 0.9, novelty: 0.9, entropy: 0.3 }]);

    expect(decision?.accepted).toBe(false);
    expect(tuner.getCurrentConfig()).toEqual(DEFAULT_NOVA_EVOLVE_CONFIG);
    expect(tuner.getMetaDecisions(1)[0].metaMerkleRoot).toHaveLength(64);
  });

  it('enforces max meta-depth and clamps unsafe deltas', async () => {
    const deps = makeDeps();
    const tuner = new NovaEvolveTuner(deps, { mutationTemperature: 0.95 }, {
      metaTuneInterval: 1,
      projectedGainThreshold: 0,
      maxMetaDepth: 1,
      proposalGenerator: () => JSON.stringify({
        knob: 'mutationTemperature',
        delta: 99,
        rationale: 'oversized mutation should be bounded',
      }),
    });

    const first = await tuner.maybeMetaTune([{ entropy: 0.99, novelty: 0.1, latencyMs: 4.4 }]);
    const second = await tuner.maybeMetaTune([{ entropy: 0.99, novelty: 0.1, latencyMs: 4.4 }]);

    expect(first?.accepted).toBe(true);
    expect(tuner.getCurrentConfig().mutationTemperature).toBeLessThanOrEqual(0.98);
    expect(second?.accepted).toBe(false);
    expect(second?.rationale).toMatch(/Max meta-depth/);
    expect(tuner.getMetaDepth()).toBe(1);
  });

  it('can generate proposals through an injected LLM mutation oracle', async () => {
    const client = {
      completeJson: jest.fn(async (prompt: string) => {
        expect(prompt).toContain('NOVA-EVOLVE');
        expect(prompt).toContain('currentConfig');
        return JSON.stringify({
          knob: 'explorationSchedule',
          value: 'adaptive',
          rationale: 'LLM detected volatile entropy and chose adaptive rollout.',
        });
      }),
    };
    const generator = createLLMProposalGenerator(client);
    const proposal = await generator({
      currentConfig: DEFAULT_NOVA_EVOLVE_CONFIG,
      recentResults: [{ entropy: 0.9, novelty: 0.2, confidence: 0.8 }],
      recentTraces: [],
      recentEtches: [],
      currentMetaDepth: 0,
    });

    expect(proposal).toEqual({
      knob: 'explorationSchedule',
      value: 'adaptive',
      rationale: 'LLM detected volatile entropy and chose adaptive rollout.',
    });
  });

  it('OpenAI-compatible proposal client requests strict JSON', async () => {
    const fetchImpl = jest.fn(async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toBe('https://api.example.test/v1/chat/completions');
      expect(init?.headers).toMatchObject({ Authorization: 'Bearer oracle-key' });
      const body = JSON.parse(String(init?.body));
      expect(body).toMatchObject({
        model: 'oracle-model',
        response_format: { type: 'json_object' },
      });
      expect(body.messages.at(-1).content).toContain('NOVA-EVOLVE');
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({
          choices: [{
            message: {
              content: JSON.stringify({
                knob: 'noveltyPressure',
                delta: 0.03,
                rationale: 'raise novelty after stable outcomes',
              }),
            },
          }],
        }),
      } as Response;
    }) as unknown as typeof fetch;
    const client = createOpenAICompatibleProposalClient({
      apiKey: 'oracle-key',
      baseUrl: 'https://api.example.test/v1',
      model: 'oracle-model',
      fetchImpl,
    });

    await expect(client.completeJson('NOVA-EVOLVE prompt')).resolves.toContain('noveltyPressure');
  });
});
