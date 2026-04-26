import { HolographicEtch, NovaNeoEncoder, StigmergyV5 } from '../core';
import {
  AdapterRequest,
  DialecticalSynthesizer,
  FreepikClient,
  FreepikMCOPAdapter,
  GenericProductionAdapter,
  HumanFeedback,
  HumanVetoError,
  UtopaiClient,
  UtopaiMCOPAdapter,
} from '../adapters';

const baseTriad = () => ({
  encoder: new NovaNeoEncoder({ dimensions: 32, normalize: true }),
  stigmergy: new StigmergyV5({ resonanceThreshold: 0.3 }),
  etch: new HolographicEtch({ confidenceFloor: 0, auditLog: true }),
});

const freepikFixture = (): FreepikClient => ({
  textToImage: jest.fn(async ({ prompt }) => ({
    kind: 'image' as const,
    assetUrl: `image://${prompt}`,
    jobId: 'job-1',
  })),
  textToVideo: jest.fn(async ({ prompt }) => ({
    kind: 'video' as const,
    assetUrl: `video://${prompt}`,
  })),
  upscale: jest.fn(async ({ sourceAssetUrl }) => ({
    kind: 'upscale' as const,
    assetUrl: `${sourceAssetUrl}@2x`,
  })),
});

describe('DialecticalSynthesizer', () => {
  it('returns the rewritten prompt verbatim when feedback supplies one', () => {
    const synth = new DialecticalSynthesizer();
    const refined = synth.synthesize(
      'original',
      { score: 0.9, trace: undefined },
      { rewrittenPrompt: 'override' } satisfies HumanFeedback,
    );
    expect(refined).toBe('override');
  });

  it('appends operator notes and continuity tags above threshold', () => {
    const synth = new DialecticalSynthesizer({ resonancePreambleThreshold: 0.5 });
    const refined = synth.synthesize(
      'paint a scene',
      {
        score: 0.8,
        trace: {
          id: 'abcdef1234567890',
          hash: 'h',
          context: [],
          synthesisVector: [],
          weight: 1,
          metadata: { note: 'campaign-q1' },
          timestamp: '',
        },
      },
      { notes: 'lean cinematic' },
    );
    expect(refined).toMatch(/\[continuity:campaign-q1\]/);
    expect(refined).toMatch(/\[operator-notes\] lean cinematic/);
  });

  it('falls back to a trace-id stub when no string note metadata is present', () => {
    const synth = new DialecticalSynthesizer({ resonancePreambleThreshold: 0.1 });
    const refined = synth.synthesize(
      'hello',
      {
        score: 0.5,
        trace: {
          id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
          hash: 'h',
          context: [],
          synthesisVector: [],
          weight: 1,
          metadata: { note: 42 } as unknown as Record<string, unknown>,
          timestamp: '',
        },
      },
    );
    expect(refined.startsWith('[continuity:aaaaaaaa]')).toBe(true);
  });

  it('honors a hard veto', () => {
    const synth = new DialecticalSynthesizer();
    expect(() =>
      synth.synthesize('p', { score: 0, trace: undefined }, { veto: true }),
    ).toThrow(HumanVetoError);
  });

  it('omits the continuity tag when the resonance score is below threshold', () => {
    const synth = new DialecticalSynthesizer({ resonancePreambleThreshold: 0.9 });
    const refined = synth.synthesize(
      'low resonance',
      {
        score: 0.2,
        trace: {
          id: 'short',
          hash: 'h',
          context: [],
          synthesisVector: [],
          weight: 0,
          metadata: { note: 'irrelevant' },
          timestamp: '',
        },
      },
    );
    expect(refined).toBe('low resonance');
  });
});

describe('FreepikMCOPAdapter', () => {
  it('rejects empty prompts', async () => {
    const adapter = new FreepikMCOPAdapter({
      ...baseTriad(),
      client: freepikFixture(),
    });
    await expect(adapter.generate({ prompt: '' })).rejects.toThrow(
      /non-empty/,
    );
  });

  it('routes image / video / upscale requests to the right client method', async () => {
    const client = freepikFixture();
    const adapter = new FreepikMCOPAdapter({ ...baseTriad(), client });

    const img = await adapter.generateOptimizedImage('hero shot', {
      model: 'mystic',
    });
    expect(img.result.kind).toBe('image');
    expect(client.textToImage).toHaveBeenCalledTimes(1);
    expect(img.merkleRoot).toMatch(/^[0-9a-f]{64}$/);
    expect(img.provenance.tensorHash).toMatch(/^[0-9a-f]{64}$/);

    const vid = await adapter.generateOptimizedVideo('motion shot', {
      model: 'kling-v2',
    });
    expect(vid.result.kind).toBe('video');
    expect(client.textToVideo).toHaveBeenCalledTimes(1);

    const up = await adapter.generate({
      prompt: 'enhance asset',
      payload: {
        kind: 'upscale',
        sourceAssetUrl: 'https://cdn/example.png',
        upscale: { scale: 4 },
      },
    });
    expect(up.result.kind).toBe('upscale');
    expect(client.upscale).toHaveBeenCalledTimes(1);
  });

  it('surfaces capabilities for orchestrators', async () => {
    const adapter = new FreepikMCOPAdapter({
      ...baseTriad(),
      client: freepikFixture(),
    });
    const caps = await adapter.getCapabilities();
    expect(caps.platform).toBe('freepik');
    expect(caps.models.length).toBeGreaterThan(0);
    expect(caps.supportsAudit).toBe(true);
  });

  it('rejects upscale calls without a source asset', async () => {
    const adapter = new FreepikMCOPAdapter({
      ...baseTriad(),
      client: freepikFixture(),
    });
    await expect(
      adapter.generate({ prompt: 'enhance', payload: { kind: 'upscale' } }),
    ).rejects.toThrow(/sourceAssetUrl/);
  });

  it('accepts a custom default entropy target', async () => {
    const adapter = new FreepikMCOPAdapter({
      ...baseTriad(),
      client: freepikFixture(),
      defaultEntropyTarget: 0.2,
    });
    // The configured default must round-trip into request metadata.
    const result = await adapter.generateOptimizedImage('configured target');
    expect(result.provenance.refinedPrompt).toContain('configured target');
  });
});

describe('UtopaiMCOPAdapter', () => {
  const utopaiFixture = (
    overrides: Partial<Awaited<ReturnType<UtopaiClient['composeSegment']>>> = {},
  ): UtopaiClient => ({
    composeSegment: jest.fn(async () => ({
      segmentId: 'segment-1',
      script: 'rendered script',
      needsHumanReview: false,
      ...overrides,
    })),
  });

  it('flags low-resonance segments for human review', async () => {
    const adapter = new UtopaiMCOPAdapter({
      ...baseTriad(),
      client: utopaiFixture(),
      defaultContinuityFloor: 0.95,
    });
    const response = await adapter.generate({
      prompt: 'opening monologue',
      domain: 'narrative',
    });
    expect(response.result.needsHumanReview).toBe(true);
  });

  it('preserves vendor-set review flags', async () => {
    const adapter = new UtopaiMCOPAdapter({
      ...baseTriad(),
      client: utopaiFixture({ needsHumanReview: true }),
      defaultContinuityFloor: 0,
    });
    const response = await adapter.generate({
      prompt: 'second beat',
      domain: 'narrative',
    });
    expect(response.result.needsHumanReview).toBe(true);
  });

  it('exposes capabilities', async () => {
    const adapter = new UtopaiMCOPAdapter({
      ...baseTriad(),
      client: utopaiFixture(),
    });
    const caps = await adapter.getCapabilities();
    expect(caps.platform).toBe('utopai');
    expect(caps.features).toContain('human-review-gating');
  });
});

describe('GenericProductionAdapter', () => {
  it('dispatches with the refined prompt and propagates the merkle root', async () => {
    const dispatchFn = jest.fn(async ({ refinedPrompt }) => ({
      ok: true,
      payload: refinedPrompt,
    }));
    const adapter = new GenericProductionAdapter<{ ok: boolean; payload: string }>({
      ...baseTriad(),
      platform: 'demo-platform',
      dispatch: dispatchFn,
      capabilities: { models: ['demo-v1'] },
    });

    const request: AdapterRequest = {
      prompt: 'generic call',
      domain: 'generic',
    };
    const response = await adapter.generate(request);
    expect(response.result.ok).toBe(true);
    expect(response.result.payload).toContain('generic call');
    expect(response.merkleRoot).toMatch(/^[0-9a-f]{64}$/);

    const caps = await adapter.getCapabilities();
    expect(caps.platform).toBe('demo-platform');
    expect(caps.models).toEqual(['demo-v1']);
  });

  it('uses default capability stubs when not configured', async () => {
    const adapter = new GenericProductionAdapter({
      ...baseTriad(),
      platform: 'plain',
      dispatch: async () => 'ok',
    });
    const caps = await adapter.getCapabilities();
    expect(caps.notes).toMatch(/Generic adapter/);
    expect(caps.version).toBe('unknown');
  });

  it('threads human feedback into the dispatch payload', async () => {
    const dispatchFn = jest.fn(async ({ dispatch }) => ({
      refined: dispatch.refinedPrompt,
    }));
    const adapter = new GenericProductionAdapter<{ refined: string }>({
      ...baseTriad(),
      platform: 'feedback-test',
      dispatch: dispatchFn,
    });
    const response = await adapter.generate({
      prompt: 'p',
      humanFeedback: { rewrittenPrompt: 'override-prompt' },
    });
    expect(response.result.refined).toBe('override-prompt');
  });

  it('records etch metadata for downstream replay', async () => {
    const adapter = new GenericProductionAdapter({
      ...baseTriad(),
      platform: 'replay-test',
      dispatch: async () => 'ok',
    });
    const response = await adapter.generate({ prompt: 'replayable' });
    expect(response.provenance.etchHash).toMatch(/^[0-9a-f]{64}$/);
    expect(response.provenance.etchDelta).toBeGreaterThan(0);
  });

  it('forwards plannedSequence into trace metadata + dispatch payload', async () => {
    const triad = baseTriad();
    const dispatchFn = jest.fn(async ({ request }) => ({
      planned: [...(request.plannedSequence ?? [])],
    }));
    const adapter = new GenericProductionAdapter<{ planned: string[] }>({
      ...triad,
      platform: 'planner-aware',
      dispatch: dispatchFn,
    });
    const planned = ['style:lush', 'pace:slow'] as const;
    const response = await adapter.generate({
      prompt: 'planner-driven dispatch',
      plannedSequence: planned,
    });
    // Dispatch sees the same sequence the caller provided.
    expect(response.result.planned).toEqual([...planned]);

    // Trace metadata records the sequence verbatim for Merkle audit.
    const recent = triad.stigmergy.getRecent(1);
    expect(recent.length).toBe(1);
    const recorded = recent[0].metadata as {
      plannedSequence?: string[];
    };
    expect(recorded.plannedSequence).toEqual([...planned]);
  });

  it('omits plannedSequence from trace metadata when not provided', async () => {
    const triad = baseTriad();
    const adapter = new GenericProductionAdapter({
      ...triad,
      platform: 'no-planner',
      dispatch: async () => 'ok',
    });
    await adapter.generate({ prompt: 'no plan here' });
    const recent = triad.stigmergy.getRecent(1);
    const recorded = recent[0].metadata as {
      plannedSequence?: string[];
    };
    expect(recorded.plannedSequence).toBeUndefined();
  });
});
