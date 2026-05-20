/**
 * @jest-environment node
 */

import {
  HolographicEtch,
  NovaNeoEncoder,
  StigmergyV5,
} from '../core';
import {
  ClaudeMCOPAdapter,
  DeepSeekMCOPAdapter,
  KimiMCOPAdapter,
  defaultClaudeClient,
  defaultDeepSeekClient,
  defaultKimiClient,
  type ClaudeClient,
  type DeepSeekClient,
  type KimiClient,
} from '../adapters';

const baseTriad = () => ({
  encoder: new NovaNeoEncoder({ dimensions: 32, normalize: true }),
  stigmergy: new StigmergyV5({ resonanceThreshold: 0.3 }),
  etch: new HolographicEtch({ confidenceFloor: 0, auditLog: true }),
});

describe('ClaudeMCOPAdapter', () => {
  it('dispatches the MCOP-refined prompt through the Anthropic message surface', async () => {
    const createMessage = jest.fn(async () => ({
      model: 'claude-sonnet-4-6',
      content: 'claude response',
      stopReason: 'end_turn',
      usage: { inputTokens: 12, outputTokens: 4 },
      raw: { id: 'msg_test' },
    }));
    const client: ClaudeClient = { createMessage };
    const adapter = new ClaudeMCOPAdapter({ ...baseTriad(), client });

    const response = await adapter.generateOptimizedCompletion('plan the proof', {
      systemPrompt: 'Be terse.',
      maxTokens: 256,
    });

    expect(response.result.content).toBe('claude response');
    expect(createMessage).toHaveBeenCalledTimes(1);
    const calls = createMessage.mock.calls as unknown as Array<[
      Parameters<ClaudeClient['createMessage']>[0],
    ]>;
    const call = calls[0][0];
    expect(call.system).toBe('Be terse.');
    expect(call.messages).toEqual([
      expect.objectContaining({ role: 'user', content: expect.stringContaining('plan the proof') }),
    ]);
    expect(response.provenance.tensorHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('defaultClaudeClient posts to Anthropic Messages API with required headers', async () => {
    const fetchImpl = jest.fn(async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toBe('https://api.anthropic.com/v1/messages');
      expect(init?.method).toBe('POST');
      expect(init?.headers).toMatchObject({
        'content-type': 'application/json',
        'x-api-key': 'anthropic-key',
        'anthropic-version': '2023-06-01',
      });
      const body = JSON.parse(String(init?.body));
      expect(body).toMatchObject({
        model: 'claude-sonnet-4-6',
        max_tokens: 64,
        system: 'system line',
        messages: [{ role: 'user', content: 'hello' }],
      });
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({
          model: 'claude-sonnet-4-6',
          content: [{ type: 'text', text: 'hello back' }],
          stop_reason: 'end_turn',
          usage: { input_tokens: 4, output_tokens: 2 },
        }),
      } as Response;
    }) as unknown as typeof fetch;

    const client = defaultClaudeClient({ apiKey: 'anthropic-key', fetchImpl });
    await expect(client.createMessage({
      system: 'system line',
      messages: [{ role: 'user', content: 'hello' }],
      options: { model: 'claude-sonnet-4-6', maxTokens: 64 },
    })).resolves.toMatchObject({
      model: 'claude-sonnet-4-6',
      content: 'hello back',
      usage: { inputTokens: 4, outputTokens: 2 },
    });
  });
});

describe('DeepSeekMCOPAdapter and KimiMCOPAdapter', () => {
  it('dispatches DeepSeek through the shared OpenAI-compatible chat surface', async () => {
    const createCompletion = jest.fn(async () => ({
      model: 'deepseek-v4-flash',
      content: 'deepseek response',
      finishReason: 'stop',
      usage: { promptTokens: 5, completionTokens: 3, totalTokens: 8 },
      raw: {},
    }));
    const client: DeepSeekClient = { createCompletion };
    const adapter = new DeepSeekMCOPAdapter({ ...baseTriad(), client });

    const response = await adapter.generateOptimizedCompletion('solve shard routing');

    expect(response.result.content).toBe('deepseek response');
    expect(createCompletion).toHaveBeenCalledWith(expect.objectContaining({
      messages: [expect.objectContaining({ role: 'user', content: expect.stringContaining('solve shard routing') })],
      options: expect.objectContaining({ model: 'deepseek-v4-flash' }),
    }));
  });

  it('dispatches Kimi through the shared OpenAI-compatible chat surface', async () => {
    const createCompletion = jest.fn(async () => ({
      model: 'kimi-k2.6',
      content: 'kimi response',
      finishReason: 'stop',
      usage: { promptTokens: 6, completionTokens: 3, totalTokens: 9 },
      raw: {},
    }));
    const client: KimiClient = { createCompletion };
    const adapter = new KimiMCOPAdapter({ ...baseTriad(), client });

    const response = await adapter.generateOptimizedCompletion('draft long context memo');

    expect(response.result.content).toBe('kimi response');
    expect(createCompletion).toHaveBeenCalledWith(expect.objectContaining({
      messages: [expect.objectContaining({ role: 'user', content: expect.stringContaining('draft long context memo') })],
      options: expect.objectContaining({ model: 'kimi-k2.6' }),
    }));
  });

  it('defaultDeepSeekClient posts to the official OpenAI-compatible endpoint', async () => {
    const fetchImpl = jest.fn(async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toBe('https://api.deepseek.com/chat/completions');
      expect(init?.headers).toMatchObject({ Authorization: 'Bearer deepseek-key' });
      const body = JSON.parse(String(init?.body));
      expect(body.model).toBe('deepseek-v4-pro');
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({
          model: 'deepseek-v4-pro',
          choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        }),
      } as Response;
    }) as unknown as typeof fetch;

    const client = defaultDeepSeekClient({ apiKey: 'deepseek-key', fetchImpl });
    await expect(client.createCompletion({
      messages: [{ role: 'user', content: 'hello' }],
      options: { model: 'deepseek-v4-pro' },
    })).resolves.toMatchObject({ content: 'ok', model: 'deepseek-v4-pro' });
  });

  it('defaultKimiClient posts to the Moonshot/Kimi OpenAI-compatible endpoint', async () => {
    const fetchImpl = jest.fn(async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toBe('https://api.moonshot.ai/v1/chat/completions');
      expect(init?.headers).toMatchObject({ Authorization: 'Bearer kimi-key' });
      const body = JSON.parse(String(init?.body));
      expect(body.model).toBe('kimi-k2.6');
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({
          model: 'kimi-k2.6',
          choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        }),
      } as Response;
    }) as unknown as typeof fetch;

    const client = defaultKimiClient({ apiKey: 'kimi-key', fetchImpl });
    await expect(client.createCompletion({
      messages: [{ role: 'user', content: 'hello' }],
      options: { model: 'kimi-k2.6' },
    })).resolves.toMatchObject({ content: 'ok', model: 'kimi-k2.6' });
  });
});
