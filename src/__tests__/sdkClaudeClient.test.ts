// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Kevin John Kull (Kuonirad) and KullAILABS MCOP Framework contributors
/**
 * @jest-environment node
 */

import Anthropic from '@anthropic-ai/sdk';

import {
  HolographicEtch,
  NovaNeoEncoder,
  StigmergyV5,
} from '../core';
import {
  ClaudeMCOPAdapter,
  sdkClaudeClient,
  SDK_CLAUDE_DEFAULT_MODEL,
} from '../adapters';

const baseTriad = () => ({
  encoder: new NovaNeoEncoder({ dimensions: 32, normalize: true }),
  stigmergy: new StigmergyV5({ resonanceThreshold: 0.3 }),
  etch: new HolographicEtch({ confidenceFloor: 0, auditLog: true }),
});

interface FakeMessageOverrides {
  model?: string;
  content?: Array<{ type: string; text?: string; thinking?: string }>;
  stop_reason?: string | null;
  usage?: Record<string, number | null>;
}

function fakeMessage(overrides: FakeMessageOverrides = {}) {
  return {
    id: 'msg_test',
    model: overrides.model ?? SDK_CLAUDE_DEFAULT_MODEL,
    content: overrides.content ?? [{ type: 'text', text: 'sdk response' }],
    stop_reason: overrides.stop_reason ?? 'end_turn',
    usage: overrides.usage ?? {
      input_tokens: 12,
      output_tokens: 4,
      cache_read_input_tokens: 9,
      cache_creation_input_tokens: 0,
    },
  };
}

/** Build a fake SDK `messages` surface with jest spies for create + stream. */
function fakeSdk(message = fakeMessage()) {
  const create = jest.fn(async (_params: unknown) => message);
  const finalMessage = jest.fn(async () => message);
  const stream = jest.fn((_params: unknown) => ({ finalMessage }));
  const client = { messages: { create, stream } } as unknown as Pick<Anthropic, 'messages'>;
  return { client, create, stream, finalMessage };
}

describe('sdkClaudeClient', () => {
  it('defaults to Opus 4.8 with adaptive thinking, a cached system prefix, and streaming', async () => {
    const { client, create, stream } = fakeSdk();
    const sdk = sdkClaudeClient({ client });

    const result = await sdk.createMessage({
      system: 'Be precise.',
      messages: [{ role: 'user', content: 'plan the proof' }],
      options: {}, // no model/maxTokens → defaults apply
    });

    // Default maxTokens (16000) >= stream threshold → streaming path.
    expect(stream).toHaveBeenCalledTimes(1);
    expect(create).not.toHaveBeenCalled();

    const params = stream.mock.calls[0][0] as Record<string, unknown>;
    expect(params.model).toBe('claude-opus-4-8');
    expect(params.thinking).toEqual({ type: 'adaptive' });
    // System prompt becomes a cached text block.
    expect(params.system).toEqual([
      { type: 'text', text: 'Be precise.', cache_control: { type: 'ephemeral' } },
    ]);
    // Adaptive-only model: no sampling params leak through.
    expect(params).not.toHaveProperty('temperature');
    expect(params).not.toHaveProperty('top_p');

    expect(result.content).toBe('sdk response');
    expect(result.model).toBe('claude-opus-4-8');
    expect(result.usage).toEqual({
      inputTokens: 12,
      outputTokens: 4,
      cacheReadInputTokens: 9,
      cacheCreationInputTokens: 0,
    });
  });

  it('strips temperature/top_p for Opus 4.7/4.8 even when callers pass them', async () => {
    const { client, stream } = fakeSdk();
    const sdk = sdkClaudeClient({ client });

    await sdk.createMessage({
      messages: [{ role: 'user', content: 'hi' }],
      options: { model: 'claude-opus-4-7', temperature: 0.7, topP: 0.9 },
    });

    const params = stream.mock.calls[0][0] as Record<string, unknown>;
    expect(params).not.toHaveProperty('temperature');
    expect(params).not.toHaveProperty('top_p');
    expect(params.thinking).toEqual({ type: 'adaptive' });
  });

  it('forwards sampling params for legacy models when thinking is disabled (unary path)', async () => {
    const { client, create, stream } = fakeSdk(fakeMessage({ model: 'claude-3-7-sonnet-20250219' }));
    const sdk = sdkClaudeClient({ client });

    await sdk.createMessage({
      messages: [{ role: 'user', content: 'hi' }],
      options: {
        model: 'claude-3-7-sonnet-20250219',
        maxTokens: 1024, // below stream threshold → unary create()
        thinking: 'disabled',
        temperature: 0.4,
        topP: 0.8,
        stopSequences: ['STOP'],
        effort: 'medium',
        metadata: { user_id: 'user-123', ignored: 'field' },
      },
    });

    expect(create).toHaveBeenCalledTimes(1);
    expect(stream).not.toHaveBeenCalled();

    const params = create.mock.calls[0][0] as Record<string, unknown>;
    expect(params).not.toHaveProperty('thinking');
    expect(params.temperature).toBe(0.4);
    expect(params.top_p).toBe(0.8);
    expect(params.stop_sequences).toEqual(['STOP']);
    expect(params.output_config).toEqual({ effort: 'medium' });
    // Only the SDK-recognized user_id survives; arbitrary keys are dropped.
    expect(params.metadata).toEqual({ user_id: 'user-123' });
  });

  it('opts out of system-prompt caching when cacheSystemPrompt is false', async () => {
    const { client, stream } = fakeSdk();
    const sdk = sdkClaudeClient({ client });

    await sdk.createMessage({
      system: 'plain system',
      messages: [{ role: 'user', content: 'hi' }],
      options: { cacheSystemPrompt: false },
    });

    const params = stream.mock.calls[0][0] as Record<string, unknown>;
    expect(params.system).toBe('plain system');
  });

  it('captures thinking output and maps it onto the result', async () => {
    const { client } = fakeSdk(
      fakeMessage({
        content: [
          { type: 'thinking', thinking: 'step one' },
          { type: 'text', text: 'final answer' },
        ],
      }),
    );
    const sdk = sdkClaudeClient({ client });

    const result = await sdk.createMessage({
      messages: [{ role: 'user', content: 'hi' }],
      options: {},
    });

    expect(result.content).toBe('final answer');
    expect(result.thinking).toBe('step one');
  });

  it('wraps Anthropic.APIError into ClaudeApiError preserving status', async () => {
    const apiError = new Anthropic.APIError(
      429,
      { type: 'rate_limit_error', message: 'slow down' },
      'rate limited',
      undefined,
    );
    const create = jest.fn(async (_params: unknown) => {
      throw apiError;
    });
    const client = {
      messages: { create, stream: jest.fn() },
    } as unknown as Pick<Anthropic, 'messages'>;
    const sdk = sdkClaudeClient({ client });

    await expect(
      sdk.createMessage({
        messages: [{ role: 'user', content: 'hi' }],
        options: { maxTokens: 512 }, // unary path
      }),
    ).rejects.toMatchObject({
      name: 'ClaudeApiError',
      status: 429,
    });
  });

  it('throws a clear error when no API key is available and no client is injected', () => {
    const original = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    try {
      expect(() => sdkClaudeClient()).toThrow(/ANTHROPIC_API_KEY/);
    } finally {
      if (original !== undefined) process.env.ANTHROPIC_API_KEY = original;
    }
  });

  it('drives the MCOP triad end-to-end through ClaudeMCOPAdapter', async () => {
    const { client, stream } = fakeSdk();
    const adapter = new ClaudeMCOPAdapter({
      ...baseTriad(),
      client: sdkClaudeClient({ client }),
      defaultModel: 'claude-opus-4-8',
    });

    const response = await adapter.generateOptimizedCompletion('refine this plan', {
      systemPrompt: 'Be terse.',
    });

    expect(response.result.content).toBe('sdk response');
    expect(response.provenance.tensorHash).toMatch(/^[0-9a-f]{64}$/);
    // The MCOP-refined prompt — not the raw prompt — is what reaches Claude.
    const params = stream.mock.calls[0][0] as { messages: Array<{ content: string }> };
    expect(params.messages[0].content).toContain('refine this plan');
  });
});
