import {
  HolographicEtch,
  LowMemoryMCOPMode,
  NovaNeoEncoder,
  StigmergyV5,
} from '../core';
import {
  AdapterRequest,
  chooseLinearSlackAction,
  chooseProviderByEntropyResonance,
  defaultGrokClient,
  DevinOrchestratorAdapter,
  DialecticalSynthesizer,
  FreepikClient,
  FreepikMCOPAdapter,
  estimateFreepikUpscaleCost,
  GenericProductionAdapter,
  RegulatedProvenanceAdapter,
  mapProvenanceToFHIR,
  GrokClient,
  GrokMCOPAdapter,
  HumanFeedback,
  HumanVetoError,
  LinearSlackOrchestratorAdapter,
  MagnificClient,
  MagnificMCOPAdapter,
  checkMagnificAttribution,
  mockLinearClient,
  mockSlackClient,
  mockSubAgentClient,
  runResearcherCoderReviewer,
  SubAgentClient,
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
  videoUpscale: jest.fn(async ({ sourceAssetUrl }) => ({
    kind: 'video-upscale' as const,
    assetUrl: `${sourceAssetUrl}@video-upscale`,
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
  /* ---------------------------------------------------------------- */
  /*  General adapter behaviour                                         */
  /*  NOTE: Freepik adapter emits a one-time console.warn on first      */
  /*  construction. We mock it here to avoid jest console noise.      */
  /* ---------------------------------------------------------------- */

  beforeAll(() => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

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
    expect(caps.version).toBe('2026-04-27-legacy');
    expect(caps.models.length).toBeGreaterThan(0);
    expect(caps.supportsAudit).toBe(true);
    expect(caps.notes).toContain('LEGACY WRAPPER');
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
    const result = await adapter.generateOptimizedImage('configured target');
    expect(result.provenance.refinedPrompt).toContain('configured target');
  });

  /* ---------------------------------------------------------------- */
  /*  Branch-coverage tests (audit remediation 2026-05-01)            */
  /*  Target: lift freepikAdapter.ts from 35.71% to >=80% branch cov.  */
  /* ---------------------------------------------------------------- */

  it('reports platformName as freepik', () => {
    const adapter = new FreepikMCOPAdapter({
      ...baseTriad(),
      client: freepikFixture(),
    });
    expect(adapter.getCapabilities()).resolves.toMatchObject({
      platform: 'freepik',
    });
  });

  it('upscaleAsset supports legacy 2x scaling', async () => {
    const client = freepikFixture();
    const adapter = new FreepikMCOPAdapter({ ...baseTriad(), client });
    const result = await adapter.upscaleAsset('https://cdn/img.png', {
      scale: 2,
    });
    expect(result.result.kind).toBe('upscale');
  });

  it('upscaleAsset supports legacy 4x scaling', async () => {
    const client = freepikFixture();
    const adapter = new FreepikMCOPAdapter({ ...baseTriad(), client });
    const result = await adapter.upscaleAsset('https://cdn/img.png', {
      scale: 4,
    });
    expect(result.result.kind).toBe('upscale');
  });

  it('upscaleAsset defaults to 2x when scale is omitted', async () => {
    const client = freepikFixture();
    const adapter = new FreepikMCOPAdapter({ ...baseTriad(), client });
    const result = await adapter.upscaleAsset('https://cdn/img.png', {});
    expect(result.result.kind).toBe('upscale');
  });

  it('upscaleAsset rejects 8× with legacy-specific error', async () => {
    const adapter = new FreepikMCOPAdapter({
      ...baseTriad(),
      client: freepikFixture(),
    });
    await expect(
      adapter.upscaleAsset('https://cdn/img.png', { scale: 8 }),
    ).rejects.toThrow(/only supports 2/);
  });

  it('upscaleAsset rejects 16× with legacy-specific error', async () => {
    const adapter = new FreepikMCOPAdapter({
      ...baseTriad(),
      client: freepikFixture(),
    });
    await expect(
      adapter.upscaleAsset('https://cdn/img.png', { scale: 16 }),
    ).rejects.toThrow(/Use MagnificMCOPAdapter.upscaleImage/);
  });

  it('estimateFreepikUpscaleCost delegates to Magnific estimator', () => {
    // 640x480 @ 2x = 0.10 (exact match in volumetric table)
    expect(
      estimateFreepikUpscaleCost(640, 480, 2),
    ).toBe(0.10);
  });

  it('preserves freepik-specific notes in capabilities even when Magnific has no notes', async () => {
    const client = freepikFixture();
    const adapter = new FreepikMCOPAdapter({
      ...baseTriad(),
      client,
    });
    const caps = await adapter.getCapabilities();
    expect(caps.notes).toContain('LEGACY WRAPPER');
  });
});

describe('MagnificMCOPAdapter', () => {
  const magnificFixture = (): MagnificClient => ({
    textToImage: jest.fn(async ({ prompt }) => ({
      kind: 'image' as const,
      assetUrl: `image://${prompt}`,
      jobId: 'job-magnific-1',
    })),
    textToVideo: jest.fn(async ({ prompt }) => ({
      kind: 'video' as const,
      assetUrl: `video://${prompt}`,
      jobId: 'job-magnific-vid',
    })),
    upscale: jest.fn(async ({ sourceAssetUrl }) => ({
      kind: 'upscale' as const,
      assetUrl: `${sourceAssetUrl}@magnific-upscale`,
    })),
    videoUpscale: jest.fn(async ({ sourceAssetUrl }) => ({
      kind: 'video-upscale' as const,
      assetUrl: `${sourceAssetUrl}@magnific-video-upscale`,
    })),
  });

  it('rejects empty prompts', async () => {
    const adapter = new MagnificMCOPAdapter({
      ...baseTriad(),
      client: magnificFixture(),
    });
    await expect(adapter.generate({ prompt: '' })).rejects.toThrow(
      /non-empty/,
    );
  });

  it('routes image / video / upscale / video-upscale requests correctly', async () => {
    const client = magnificFixture();
    const adapter = new MagnificMCOPAdapter({ ...baseTriad(), client });

    const img = await adapter.generateOptimizedImage('hero shot', {
      model: 'mystic-2.5-fluid',
    });
    expect(img.result.kind).toBe('image');
    expect(client.textToImage).toHaveBeenCalledTimes(1);
    expect(img.merkleRoot).toMatch(/^[0-9a-f]{64}$/);
    expect(img.provenance.tensorHash).toMatch(/^[0-9a-f]{64}$/);

    const vid = await adapter.generateOptimizedVideo('motion shot', {
      model: 'seeddance-2.0',
    });
    expect(vid.result.kind).toBe('video');
    expect(client.textToVideo).toHaveBeenCalledTimes(1);

    const up = await adapter.upscaleImage('https://cdn/example.png', {
      scale: 4,
      sourceWidth: 1280,
      sourceHeight: 720,
    });
    expect(up.result.kind).toBe('upscale');
    expect(client.upscale).toHaveBeenCalledTimes(1);

    const vUp = await adapter.upscaleVideo('https://cdn/example.mp4');
    expect(vUp.result.kind).toBe('video-upscale');
    expect(client.videoUpscale).toHaveBeenCalledTimes(1);
  });

  it('surfaces capabilities for orchestrators', async () => {
    const adapter = new MagnificMCOPAdapter({
      ...baseTriad(),
      client: magnificFixture(),
    });
    const caps = await adapter.getCapabilities();
    expect(caps.platform).toBe('magnific');
    expect(caps.models).toContain('veo-3.1');
    expect(caps.models).toContain('seeddance-2.0');
    expect(caps.supportsAudit).toBe(true);
  });

  it('estimates upscale cost using volumetric table', () => {
    const adapter = new MagnificMCOPAdapter({
      ...baseTriad(),
      client: magnificFixture(),
    });
    // Known reference: 640×480 @ 2× = €0.10
    expect(adapter.estimateUpscaleCost(640, 480, 2)).toBe(0.10);
    // Known reference: 1920×1080 @ 2× = €0.20
    expect(adapter.estimateUpscaleCost(1920, 1080, 2)).toBe(0.20);
    // Interpolated: 1280×720 @ 8× (no exact row — heuristic)
    const interpolated = adapter.estimateUpscaleCost(1280, 720, 8);
    expect(interpolated).toBeGreaterThan(0);
    expect(interpolated).toBeLessThan(10);
  });

  it('estimates video cost by model', () => {
    const adapter = new MagnificMCOPAdapter({
      ...baseTriad(),
      client: magnificFixture(),
    });
    expect(adapter.estimateVideoCost(10, 'veo-3.1')).toBe(4.0);
    expect(adapter.estimateVideoCost(10, 'seeddance-2.0')).toBe(3.0);
  });

  it('validates upscale guardrails before dispatch', async () => {
    const adapter = new MagnificMCOPAdapter({
      ...baseTriad(),
      client: magnificFixture(),
      maxUpscaleOutputArea: 10_000_000,
      maxCallCostEur: 1.0,
    });

    // Should pass — within guardrails
    await expect(
      adapter.upscaleImage('https://cdn/small.png', {
        scale: 2,
        sourceWidth: 640,
        sourceHeight: 480,
      }),
    ).resolves.toBeDefined();

    // Should throw — output area too large
    await expect(
      adapter.upscaleImage('https://cdn/huge.png', {
        scale: 16,
        sourceWidth: 3840,
        sourceHeight: 2160,
      }),
    ).rejects.toThrow(/exceeds adapter guardrail/);
  });

  it('rejects upscale calls without source asset', async () => {
    const adapter = new MagnificMCOPAdapter({
      ...baseTriad(),
      client: magnificFixture(),
    });
    await expect(
      adapter.generate({ prompt: 'enhance', payload: { kind: 'upscale' } }),
    ).rejects.toThrow(/sourceAssetUrl or sourceAssetBase64/);
  });

  it('accepts Base64 source in addition to URL', async () => {
    const client = magnificFixture();
    const adapter = new MagnificMCOPAdapter({ ...baseTriad(), client });

    const result = await adapter.generate({
      prompt: 'enhance',
      payload: {
        kind: 'upscale',
        sourceAssetBase64: 'data:image/png;base64,abc123',
        upscale: { scale: 2 },
      },
    });
    expect(result.result.kind).toBe('upscale');
  });

  it('checks Magnific attribution string', () => {
    expect(checkMagnificAttribution('Powered by Magnific')).toBe(true);
    expect(checkMagnificAttribution('Some random text')).toBe(false);
  });

  it('accepts a custom default entropy target', async () => {
    const adapter = new MagnificMCOPAdapter({
      ...baseTriad(),
      client: magnificFixture(),
      defaultEntropyTarget: 0.2,
    });
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

const grokFixture = (
  overrides: Partial<Awaited<ReturnType<GrokClient['createCompletion']>>> = {},
): GrokClient => ({
  createCompletion: jest.fn(async ({ messages, options }) => ({
    model: options.model ?? 'grok-3-mini',
    content: `echo:${messages[messages.length - 1]?.content ?? ''}`,
    finishReason: 'stop',
    usage: { promptTokens: 4, completionTokens: 4, totalTokens: 8 },
    ...overrides,
  })),
});

describe('LowMemoryMCOPMode', () => {
  it('builds compact MCOP defaults and prunes prompts deterministically', () => {
    const mode = new LowMemoryMCOPMode({
      promptTokenBudget: 6,
      preservePromptHeadTokens: 2,
      preservePromptTailTokens: 2,
      tensorDim: 16,
      maxTraces: 8,
    });

    const profile = mode.buildProfile();
    expect(profile.encoderConfig.dimensions).toBe(16);
    expect(profile.stigmergyConfig.maxTraces).toBe(8);
    expect(profile.estimatedTraceBytes).toBe(8 * 16 * Float32Array.BYTES_PER_ELEMENT);

    const pruned = mode.prunePrompt('one two three four five six seven eight');
    expect(pruned).toBe('one two [mcop-low-memory-pruned:4-tokens] seven eight');
  });

  it('round-trips compact tensors back to canonical array form', () => {
    const mode = new LowMemoryMCOPMode({ tensorDim: 8 });
    const compact = mode.encodeCompact('compact resonance');

    expect(compact).toBeInstanceOf(Float32Array);
    expect(mode.toCanonicalTensor(compact)).toHaveLength(8);
  });
});

describe('GrokMCOPAdapter', () => {
  it('rejects empty prompts', async () => {
    const adapter = new GrokMCOPAdapter({
      ...baseTriad(),
      client: grokFixture(),
    });
    await expect(adapter.generate({ prompt: '' })).rejects.toThrow(
      /non-empty/,
    );
  });

  it('routes refined prompt through Grok and surfaces provenance + usage', async () => {
    const client = grokFixture();
    const adapter = new GrokMCOPAdapter({ ...baseTriad(), client });

    const response = await adapter.generateOptimizedCompletion(
      'design a research agenda for stigmergic AI',
      { model: 'grok-3', temperature: 0.2 },
    );

    expect(response.result.model).toBe('grok-3');
    expect(response.result.content.startsWith('echo:')).toBe(true);
    expect(response.result.usage?.totalTokens).toBe(8);
    expect(client.createCompletion).toHaveBeenCalledTimes(1);

    // Provenance bundle is fully populated.
    expect(response.merkleRoot).toMatch(/^[0-9a-f]{64}$/);
    expect(response.provenance.tensorHash).toMatch(/^[0-9a-f]{64}$/);
    expect(response.provenance.refinedPrompt).toContain(
      'design a research agenda',
    );

    // The refined prompt is what was dispatched, not the raw input.
    const call = (client.createCompletion as jest.Mock).mock.calls[0][0] as {
      messages: ReadonlyArray<{ role: string; content: string }>;
    };
    expect(call.messages[call.messages.length - 1].content).toBe(
      response.provenance.refinedPrompt,
    );
  });

  it('prunes low-memory prompts before dispatch and strips routing-only options', async () => {
    const client = grokFixture();
    const adapter = new GrokMCOPAdapter({ ...baseTriad(), client });

    const response = await adapter.generateOptimizedCompletion(
      'one two three four five six seven eight',
      {
        model: 'grok-4',
        lowMemory: {
          promptTokenBudget: 6,
          preservePromptHeadTokens: 2,
          preservePromptTailTokens: 2,
        },
      },
    );

    expect(response.provenance.refinedPrompt).toContain(
      '[mcop-low-memory-pruned:4-tokens]',
    );
    const call = (client.createCompletion as jest.Mock).mock.calls[0][0] as {
      messages: ReadonlyArray<{ role: string; content: string }>;
      options: Record<string, unknown>;
    };
    expect(call.messages[call.messages.length - 1].content).toContain(
      '[mcop-low-memory-pruned:4-tokens]',
    );
    expect(call.options).toEqual({ model: 'grok-4' });
  });

  it('prepends the system prompt when supplied', async () => {
    const client = grokFixture();
    const adapter = new GrokMCOPAdapter({ ...baseTriad(), client });
    await adapter.generateOptimizedCompletion('q', {
      systemPrompt: 'You are MCOP-aware.',
    });
    const call = (client.createCompletion as jest.Mock).mock.calls[0][0] as {
      messages: ReadonlyArray<{ role: string; content: string }>;
    };
    expect(call.messages[0]).toEqual({
      role: 'system',
      content: 'You are MCOP-aware.',
    });
  });
  it('injects prior Stigmergy Merkle history into Grok without leaking routing-only options', async () => {
    const client = grokFixture();
    const adapter = new GrokMCOPAdapter({ ...baseTriad(), client });

    await adapter.generateOptimizedCompletion(
      'ARC step 1: observe blue cell symmetry',
      { model: 'grok-3-mini' },
      {
        metadata: {
          arcTaskId: 'arc-demo-1',
          phase: 'observation',
          apiToken: 'do-not-leak',
        },
      },
    );

    await adapter.generateOptimizedCompletion(
      'ARC step 2: test mirror transform',
      {
        model: 'grok-3-mini',
        stigmergyHistory: { limit: 1, label: 'ARC arc-demo-1' },
      },
      { metadata: { arcTaskId: 'arc-demo-1', phase: 'hypothesis' } },
    );

    const call = (client.createCompletion as jest.Mock).mock.calls[1][0] as {
      messages: ReadonlyArray<{ role: string; content: string }>;
      options: Record<string, unknown>;
    };
    const memoryMessage = call.messages.find((message) =>
      message.content.startsWith('MCOP Stigmergy v5 Merkle memory'),
    );

    expect(memoryMessage?.content).toContain('ARC arc-demo-1');
    expect(memoryMessage?.content).toContain('arc-demo-1');
    expect(memoryMessage?.content).toContain('hash=');
    expect(memoryMessage?.content).toContain('apiToken":"[redacted]');
    expect(memoryMessage?.content).not.toContain('do-not-leak');
    expect(call.options).toEqual({ model: 'grok-3-mini' });
  });


  it('honours human veto from the dialectical synthesizer', async () => {
    const adapter = new GrokMCOPAdapter({
      ...baseTriad(),
      client: grokFixture(),
    });
    await expect(
      adapter.generateOptimizedCompletion(
        'sensitive prompt',
        {},
        { humanFeedback: { veto: true } satisfies HumanFeedback },
      ),
    ).rejects.toThrow(HumanVetoError);
  });

  it('surfaces capabilities for orchestrators', async () => {
    const adapter = new GrokMCOPAdapter({
      ...baseTriad(),
      client: grokFixture(),
    });
    const caps = await adapter.getCapabilities();
    expect(caps.platform).toBe('xai-grok');
    expect(caps.features).toContain('entropy-resonance-routing');
    expect(caps.models.length).toBeGreaterThan(0);
    expect(caps.supportsAudit).toBe(true);
  });
});

describe('defaultGrokClient', () => {
  it('throws when no API key is available', () => {
    const original = process.env.XAI_API_KEY;
    delete process.env.XAI_API_KEY;
    try {
      expect(() => defaultGrokClient()).toThrow(/XAI_API_KEY/);
    } finally {
      if (original !== undefined) process.env.XAI_API_KEY = original;
    }
  });

  const okResponse = (
    payload: unknown,
  ): Pick<Response, 'ok' | 'status' | 'statusText' | 'json' | 'text'> => ({
    ok: true,
    status: 200,
    statusText: 'OK',
    json: async () => payload,
    text: async () => JSON.stringify(payload),
  });

  const errorResponse = (
    status: number,
    statusText: string,
    body: string,
  ): Pick<Response, 'ok' | 'status' | 'statusText' | 'json' | 'text'> => ({
    ok: false,
    status,
    statusText,
    json: async () => JSON.parse(body),
    text: async () => body,
  });

  it('POSTs an OpenAI-compatible body to /chat/completions', async () => {
    const fetchImpl = jest.fn(async () =>
      okResponse({
        id: 'cmpl-1',
        model: 'grok-3-mini',
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content: 'hi' },
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      }),
    );
    const client = defaultGrokClient({
      apiKey: 'test-key',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const result = await client.createCompletion({
      messages: [{ role: 'user', content: 'hello' }],
      options: { model: 'grok-3-mini', temperature: 0.1 },
    });
    expect(result.content).toBe('hi');
    expect(result.usage?.totalTokens).toBe(2);
    const calls = fetchImpl.mock.calls as unknown as Array<
      [string, RequestInit]
    >;
    expect(calls.length).toBe(1);
    const [url, init] = calls[0];
    expect(url).toBe('https://api.x.ai/v1/chat/completions');
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer test-key');
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe('grok-3-mini');
    expect(body.temperature).toBe(0.1);
    expect(body.messages[0].content).toBe('hello');
  });

  it('surfaces vendor error bodies in the thrown message', async () => {
    const fetchImpl = jest.fn(async () =>
      errorResponse(401, 'Unauthorized', '{"error":"unauthorized"}'),
    );
    const client = defaultGrokClient({
      apiKey: 'bad',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await expect(
      client.createCompletion({
        messages: [{ role: 'user', content: 'x' }],
        options: {},
      }),
    ).rejects.toThrow(/401/);
  });
});

describe('chooseProviderByEntropyResonance', () => {
  it('routes high-resonance prompts to local cache', () => {
    expect(
      chooseProviderByEntropyResonance({ entropy: 0.9, resonance: 0.85 }),
    ).toBe('local');
  });

  it('routes novel low-resonance prompts to grok', () => {
    expect(
      chooseProviderByEntropyResonance({ entropy: 0.7, resonance: 0.3 }),
    ).toBe('grok');
  });

  it('escalates very-low-confidence novel prompts to human review', () => {
    expect(
      chooseProviderByEntropyResonance({ entropy: 0.7, resonance: 0.05 }),
    ).toBe('human-review');
  });

  it('keeps stable prompts local even with mid-range resonance', () => {
    expect(
      chooseProviderByEntropyResonance({ entropy: 0.2, resonance: 0.4 }),
    ).toBe('local');
  });

  it('respects custom thresholds', () => {
    expect(
      chooseProviderByEntropyResonance(
        { entropy: 0.3, resonance: 0.5 },
        { noveltyEntropyFloor: 0.25, highResonanceCeiling: 0.9 },
      ),
    ).toBe('grok');
  });
});

const devinFixture = (
  overrides: Partial<{
    researcher: string;
    coder: string;
    reviewer: string;
  }> = {},
): SubAgentClient => {
  return mockSubAgentClient({
    responders: {
      researcher: ({ prompt }) => ({
        role: 'researcher',
        output: overrides.researcher ?? `RESEARCH:${prompt.slice(0, 32)}`,
        sessionUrl: 'mock://session/researcher',
        usage: { tokensIn: 10, tokensOut: 20, tokensTotal: 30, durationMs: 100 },
      }),
      coder: ({ prompt }) => ({
        role: 'coder',
        output: overrides.coder ?? `CODE:${prompt.slice(0, 32)}`,
        sessionUrl: 'mock://session/coder',
        usage: { tokensIn: 12, tokensOut: 24, tokensTotal: 36, durationMs: 120 },
      }),
      reviewer: ({ prompt }) => ({
        role: 'reviewer',
        output: overrides.reviewer ?? `REVIEW:${prompt.slice(0, 32)}`,
        sessionUrl: 'mock://session/reviewer',
        usage: { tokensIn: 8, tokensOut: 16, tokensTotal: 24, durationMs: 80 },
      }),
    },
  });
};

describe('DevinOrchestratorAdapter', () => {
  it('reports its capability surface with the canonical roles', async () => {
    const adapter = new DevinOrchestratorAdapter({
      ...baseTriad(),
      client: devinFixture(),
    });
    const caps = await adapter.getCapabilities();
    expect(caps.platform).toBe('devin-suba-gent');
    expect(caps.models).toEqual(
      expect.arrayContaining(['researcher', 'coder', 'reviewer']),
    );
    expect(caps.features).toEqual(
      expect.arrayContaining([
        'multi-role-orchestration',
        'mcop-triad-refinement',
        'human-veto',
        'resonance-cache-detection',
      ]),
    );
    expect(caps.supportsAudit).toBe(true);
  });

  it('rejects empty prompts on dispatchOptimizedTask', async () => {
    const adapter = new DevinOrchestratorAdapter({
      ...baseTriad(),
      client: devinFixture(),
    });
    await expect(
      adapter.dispatchOptimizedTask('researcher', ''),
    ).rejects.toThrow(/prompt must be a non-empty string/);
  });

  it('produces a Merkle-rooted ProvenanceMetadata bundle for a single dispatch', async () => {
    const adapter = new DevinOrchestratorAdapter({
      ...baseTriad(),
      client: devinFixture(),
    });
    const response = await adapter.dispatchOptimizedTask(
      'researcher',
      'investigate stigmergic resonance',
    );
    expect(response.merkleRoot).toMatch(/^[0-9a-f]+$/);
    expect(response.provenance.tensorHash).toMatch(/^[0-9a-f]+$/);
    expect(response.provenance.refinedPrompt).toContain(
      'investigate stigmergic resonance',
    );
    expect(response.result.role).toBe('researcher');
    expect(response.result.sessionUrl).toBe('mock://session/researcher');
  });

  it('forwards role + options + refined prompt verbatim to the client', async () => {
    const dispatchTask = jest.fn(
      async (args: {
        role: 'researcher' | 'coder' | 'reviewer' | (string & {});
        prompt: string;
        options: { maxTokens?: number; tags?: ReadonlyArray<string> };
      }) => ({
        role: args.role,
        output: 'ok',
        sessionUrl: null,
        usage: null,
      }),
    );
    const client: SubAgentClient = { dispatchTask };
    const adapter = new DevinOrchestratorAdapter({
      ...baseTriad(),
      client,
    });
    await adapter.dispatchOptimizedTask(
      'coder',
      'implement feature X',
      { maxTokens: 4096, tags: ['mcop'] },
    );
    expect(dispatchTask).toHaveBeenCalledTimes(1);
    const calls = dispatchTask.mock.calls as unknown as Array<
      [{ role: string; prompt: string; options: { maxTokens?: number; tags?: ReadonlyArray<string> } }]
    >;
    const [call] = calls[0];
    expect(call.role).toBe('coder');
    expect(call.prompt).toContain('implement feature X');
    expect(call.options.maxTokens).toBe(4096);
    expect(call.options.tags).toEqual(['mcop']);
  });

  it('honours human veto via the dialectical synthesizer', async () => {
    const dispatchTask = jest.fn();
    const client: SubAgentClient = {
      dispatchTask: dispatchTask as unknown as SubAgentClient['dispatchTask'],
    };
    const adapter = new DevinOrchestratorAdapter({
      ...baseTriad(),
      client,
    });
    await expect(
      adapter.dispatchOptimizedTask(
        'researcher',
        'risky prompt',
        {},
        { humanFeedback: { veto: true } as HumanFeedback },
      ),
    ).rejects.toBeInstanceOf(HumanVetoError);
    expect(dispatchTask).not.toHaveBeenCalled();
  });
});

describe('runResearcherCoderReviewer', () => {
  it('runs all three legs in order and returns a Merkle chain', async () => {
    const adapter = new DevinOrchestratorAdapter({
      ...baseTriad(),
      client: devinFixture(),
    });
    const report = await runResearcherCoderReviewer(adapter, {
      task: 'add a feature flag for the visualiser',
    });
    expect(report.legs).toHaveLength(3);
    expect(report.legs.map((l) => l.role)).toEqual([
      'researcher',
      'coder',
      'reviewer',
    ]);
    for (const leg of report.legs) {
      expect(leg.cacheHit).toBe(false);
      expect(leg.vetoed).toBe(false);
      expect(leg.response).not.toBeNull();
    }
    expect(report.merkleChain).toHaveLength(3);
    for (const root of report.merkleChain) {
      expect(root).toMatch(/^[0-9a-f]+$/);
    }
    expect(report.cacheHits).toBe(0);
    expect(report.humanVetoes).toBe(0);
    expect(report.totalUsage.tokensTotal).toBeGreaterThan(0);
  });

  it('records a human veto without dispatching that leg', async () => {
    const dispatchTask = jest.fn(async (args) => ({
      role: args.role,
      output: 'stub',
      sessionUrl: null,
      usage: { tokensIn: 1, tokensOut: 1, tokensTotal: 2, durationMs: 5 },
    }));
    const client: SubAgentClient = { dispatchTask };
    const adapter = new DevinOrchestratorAdapter({
      ...baseTriad(),
      client,
    });
    const report = await runResearcherCoderReviewer(adapter, {
      task: 'deploy production hot-fix',
      humanReview: (leg) => (leg === 'coder' ? { veto: true } : undefined),
    });
    expect(report.humanVetoes).toBe(1);
    const coderLeg = report.legs.find((l) => l.role === 'coder');
    expect(coderLeg?.vetoed).toBe(true);
    expect(coderLeg?.response).toBeNull();
    // Researcher + Reviewer still ran.
    expect(dispatchTask).toHaveBeenCalledTimes(2);
  });

  it('honours rewrittenPrompt when the operator rewrites a leg', async () => {
    const dispatchTask = jest.fn(async (args) => ({
      role: args.role,
      output: args.prompt,
      sessionUrl: null,
      usage: { tokensIn: 1, tokensOut: 1, tokensTotal: 2 },
    }));
    const client: SubAgentClient = { dispatchTask };
    const adapter = new DevinOrchestratorAdapter({
      ...baseTriad(),
      client,
    });
    const report = await runResearcherCoderReviewer(adapter, {
      task: 'investigate caching strategy',
      humanReview: (leg) =>
        leg === 'researcher'
          ? { rewrittenPrompt: 'CUSTOM-RESEARCHER-PROMPT' }
          : undefined,
    });
    const researcher = report.legs[0];
    expect(researcher.response?.result.output).toBe('CUSTOM-RESEARCHER-PROMPT');
  });

  it('short-circuits to a cache hit when resonance crosses the threshold', async () => {
    const dispatchTask = jest.fn(async (args) => ({
      role: args.role,
      output: `out:${args.prompt.slice(0, 8)}`,
      sessionUrl: null,
      usage: { tokensIn: 1, tokensOut: 1, tokensTotal: 2 },
    }));
    const client: SubAgentClient = { dispatchTask };
    const adapter = new DevinOrchestratorAdapter({
      ...baseTriad(),
      client,
    });
    // Threshold of 0 forces the second leg to be classified as a cache
    // hit since stigmergy will report a non-negative resonance after the
    // first leg records its trace.
    const report = await runResearcherCoderReviewer(adapter, {
      task: 'identical task probed twice',
      cacheResonanceThreshold: 0,
    });
    expect(report.cacheHits).toBeGreaterThanOrEqual(1);
    // Cache hits should NOT increase the token usage tally.
    const dispatchedLegs = report.legs.filter((l) => !l.cacheHit && !l.vetoed);
    expect(dispatchTask).toHaveBeenCalledTimes(dispatchedLegs.length);
  });
});

describe('chooseLinearSlackAction', () => {
  it('routes high-resonance events to slack-only', () => {
    expect(
      chooseLinearSlackAction({ entropy: 0.1, resonance: 0.95 }),
    ).toBe('slack-only');
  });

  it('routes novel high-entropy events to linear-only', () => {
    expect(
      chooseLinearSlackAction({ entropy: 0.6, resonance: 0.1 }),
    ).toBe('linear-only');
  });

  it('routes everything else to both', () => {
    expect(
      chooseLinearSlackAction({ entropy: 0.2, resonance: 0.5 }),
    ).toBe('both');
  });

  it('respects custom thresholds', () => {
    expect(
      chooseLinearSlackAction(
        { entropy: 0.3, resonance: 0.5 },
        { slackOnlyResonanceFloor: 0.4 },
      ),
    ).toBe('slack-only');
  });
});

describe('LinearSlackOrchestratorAdapter', () => {
  const buildAdapter = () => {
    const linear = mockLinearClient({ teamKeyPrefix: 'MCOP' });
    const slack = mockSlackClient();
    const adapter = new LinearSlackOrchestratorAdapter({
      ...baseTriad(),
      linear,
      slack,
      defaultLinearTeamKey: 'MCOP',
      defaultSlackChannel: '#mcop-oncall',
    });
    return { adapter, linear, slack };
  };

  it('reports its capability surface', async () => {
    const { adapter } = buildAdapter();
    const caps = await adapter.getCapabilities();
    expect(caps.platform).toBe('linear-slack-mcp');
    expect(caps.features).toEqual(
      expect.arrayContaining([
        'mcp-orchestration',
        'human-veto',
        'entropy-resonance-routing',
        'multi-tool-fanout',
      ]),
    );
  });

  it('rejects empty prompts on dispatchOptimizedAlert', async () => {
    const { adapter } = buildAdapter();
    await expect(adapter.dispatchOptimizedAlert('')).rejects.toThrow(
      /prompt must be a non-empty string/,
    );
  });

  it('produces a Merkle-rooted ProvenanceMetadata bundle', async () => {
    const { adapter } = buildAdapter();
    const response = await adapter.dispatchOptimizedAlert(
      'investigate replication lag on shard-3',
    );
    expect(response.merkleRoot).toMatch(/^[0-9a-f]+$/);
    expect(response.provenance.refinedPrompt).toContain(
      'investigate replication lag',
    );
    expect(response.result.action).toMatch(
      /^(slack-only|linear-only|both)$/,
    );
    expect(response.result.signals.entropy).toBeGreaterThanOrEqual(0);
    expect(response.result.signals.resonance).toBeGreaterThanOrEqual(0);
  });

  it('files a Linear issue with an audit-anchor comment for the both action', async () => {
    const { adapter } = buildAdapter();
    const response = await adapter.dispatchOptimizedAlert(
      'novel-event-A',
      // Force the both branch via a router override so the spec is robust
      // to encoder-entropy fluctuations.
      {
        router: {
          slackOnlyResonanceFloor: 1.5,
          linearOnlyEntropyFloor: 5,
          noveltyResonanceCeiling: -1,
        },
      },
    );
    expect(response.result.action).toBe('both');
    expect(response.result.slack).not.toBeNull();
    expect(response.result.linear).not.toBeNull();
    expect(response.result.linear?.identifier).toMatch(/^MCOP-\d+$/);
    expect(response.result.comment).not.toBeNull();
    expect(response.result.comment?.id).toMatch(/^mock-comment-\d+$/);
  });

  it('hits Slack only when the router decides slack-only', async () => {
    const linear = mockLinearClient();
    const slack = mockSlackClient();
    const linearSpy = jest.spyOn(linear, 'createIssue');
    const slackSpy = jest.spyOn(slack, 'postMessage');
    const adapter = new LinearSlackOrchestratorAdapter({
      ...baseTriad(),
      linear,
      slack,
      defaultLinearTeamKey: 'MCOP',
      defaultSlackChannel: '#mcop-oncall',
    });
    await adapter.dispatchOptimizedAlert('cached-event-B', {
      router: {
        slackOnlyResonanceFloor: -1, // every event becomes slack-only
      },
    });
    expect(slackSpy).toHaveBeenCalledTimes(1);
    expect(linearSpy).not.toHaveBeenCalled();
  });

  it('honours human veto via the dialectical synthesizer', async () => {
    const linear = mockLinearClient();
    const slack = mockSlackClient();
    const linearSpy = jest.spyOn(linear, 'createIssue');
    const slackSpy = jest.spyOn(slack, 'postMessage');
    const adapter = new LinearSlackOrchestratorAdapter({
      ...baseTriad(),
      linear,
      slack,
      defaultLinearTeamKey: 'MCOP',
      defaultSlackChannel: '#mcop-oncall',
    });
    await expect(
      adapter.dispatchOptimizedAlert('vetoed-event', {
        humanFeedback: { veto: true } as HumanFeedback,
      }),
    ).rejects.toBeInstanceOf(HumanVetoError);
    expect(linearSpy).not.toHaveBeenCalled();
    expect(slackSpy).not.toHaveBeenCalled();
  });

  it('throws when slack action is required but no channel is configured', async () => {
    const linear = mockLinearClient();
    const slack = mockSlackClient();
    const adapter = new LinearSlackOrchestratorAdapter({
      ...baseTriad(),
      linear,
      slack,
      defaultLinearTeamKey: 'MCOP',
      // no defaultSlackChannel
    });
    await expect(
      adapter.dispatchOptimizedAlert('needs-slack', {
        router: { slackOnlyResonanceFloor: -1 },
      }),
    ).rejects.toThrow(/slackChannel is required/);
  });

  it('throws when linear action is required but no team key is configured', async () => {
    const linear = mockLinearClient();
    const slack = mockSlackClient();
    const adapter = new LinearSlackOrchestratorAdapter({
      ...baseTriad(),
      linear,
      slack,
      defaultSlackChannel: '#mcop-oncall',
      // no defaultLinearTeamKey
    });
    await expect(
      adapter.dispatchOptimizedAlert('needs-linear', {
        router: {
          slackOnlyResonanceFloor: 5,
          linearOnlyEntropyFloor: -1,
          noveltyResonanceCeiling: 5,
        },
      }),
    ).rejects.toThrow(/linearTeamKey is required/);
  });

  it('forwards labels and a custom title verbatim to Linear', async () => {
    const linear = mockLinearClient();
    const slack = mockSlackClient();
    const linearSpy = jest.spyOn(linear, 'createIssue');
    const adapter = new LinearSlackOrchestratorAdapter({
      ...baseTriad(),
      linear,
      slack,
      defaultLinearTeamKey: 'MCOP',
      defaultSlackChannel: '#mcop-oncall',
    });
    await adapter.dispatchOptimizedAlert('force-linear-event', {
      linearLabels: ['oncall', 'p1'],
      linearTitle: 'Custom incident title',
      router: {
        slackOnlyResonanceFloor: 5,
        linearOnlyEntropyFloor: -1,
        noveltyResonanceCeiling: 5,
      },
    });
    expect(linearSpy).toHaveBeenCalledTimes(1);
    const args = linearSpy.mock.calls[0]![0];
    expect(args.title).toBe('Custom incident title');
    expect(args.labels).toEqual(['oncall', 'p1']);
    expect(args.teamKey).toBe('MCOP');
  });
});

describe('RegulatedProvenanceAdapter', () => {
  it('emits FHIR and ISO 20022 provenance mappings with human-primacy scope notes', async () => {
    const adapter = new RegulatedProvenanceAdapter({
      ...baseTriad(),
      custodianOrg: 'KULLAI-LABS',
    });

    const response = await adapter.generate({
      prompt: 'risk-review decision support trace',
      domain: 'finance',
      payload: {
        target: 'both',
        subjectId: 'case-123',
        operatorId: 'human-reviewer-7',
        sourceInstitutionId: 'BANK-A',
        receiverInstitutionId: 'AUDITOR-B',
      },
    });

    expect(response.result.verificationStatus).toBe('SEALED');
    expect(response.result.fhir?.resourceType).toBe('Provenance');
    expect(response.result.fhir?.target[0].reference).toBe('DocumentReference/case-123');
    expect(response.result.fhir?.entity.map((entry) => entry.what.identifier.system)).toEqual(
      expect.arrayContaining([
        'https://github.com/Kuonirad/MCOP-Framework-2.0/provenance/tensorHash',
        'https://github.com/Kuonirad/MCOP-Framework-2.0/provenance/etchHash',
      ]),
    );
    expect(response.result.iso20022?.AppHdr.Fr.FIId.FinInstnId.Othr.Id).toBe('BANK-A');
    expect(response.result.iso20022?.Document.MCOPrvnc.PrvcRoot).toBe(response.merkleRoot);
    expect(response.result.disclaimer).toContain('process integrity');
    expect(response.result.disclaimer).toContain('do not certify clinical correctness');
  });

  it('maps standalone provenance metadata to a FHIR-only UNVERIFIED resource', () => {
    const fhir = mapProvenanceToFHIR(
      {
        tensorHash: 'not-a-hex-root',
        resonanceScore: 0.4,
        etchHash: 'missing-root',
        etchDelta: 0,
        refinedPrompt: 'review only',
        timestamp: '2026-05-06T00:00:00.000Z',
      },
      { subjectId: 'patient/with/slashes' },
    );

    expect(fhir.id).toBe('mcop-missing-root');
    expect(fhir.target[0].reference).toBe('DocumentReference/patient-with-slashes');
    expect(fhir.extension).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ valueCode: 'UNVERIFIED' }),
      ]),
    );
  });
});
