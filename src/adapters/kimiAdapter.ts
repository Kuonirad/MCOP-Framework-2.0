import type { BaseAdapterDeps } from './baseAdapter';
import {
  createOpenAICompatibleChatClient,
  type DefaultOpenAICompatibleClientConfig,
  type OpenAICompatibleChatClient,
  type OpenAICompatibleCompletionOptions,
  type OpenAICompatibleCompletionResult,
} from './openAICompatibleChatClient';
import {
  OpenAICompatibleMCOPAdapter,
  type OpenAICompatibleRequest,
} from './openAICompatibleMCOPAdapter';

export type KimiModel =
  | 'kimi-k2.6'
  | 'kimi-k2.5'
  | 'moonshot-v1-8k'
  | 'moonshot-v1-32k'
  | 'moonshot-v1-128k'
  | (string & {});

export type KimiCompletionOptions = OpenAICompatibleCompletionOptions & {
  model?: KimiModel;
};
export type KimiRequest = OpenAICompatibleRequest;
export type KimiClient = OpenAICompatibleChatClient;
export type KimiCompletionResult = OpenAICompatibleCompletionResult;

export interface KimiAdapterConfig extends BaseAdapterDeps {
  client: KimiClient;
  defaultModel?: KimiModel;
  defaultEntropyTarget?: number;
}

export const KIMI_MODEL_MAPPINGS: Readonly<Record<string, {
  readonly model: KimiModel;
  readonly tier: 'flagship' | 'long-context' | 'legacy';
  readonly useCases: ReadonlyArray<string>;
}>> = Object.freeze({
  'kimi-k2.6': Object.freeze({
    model: 'kimi-k2.6',
    tier: 'flagship',
    useCases: ['agentic-coding', 'long-context-reasoning', 'tool-use'],
  }),
  'kimi-k2.5': Object.freeze({
    model: 'kimi-k2.5',
    tier: 'flagship',
    useCases: ['compatibility', 'coding', 'reasoning'],
  }),
  'moonshot-v1-128k': Object.freeze({
    model: 'moonshot-v1-128k',
    tier: 'long-context',
    useCases: ['archive-analysis', 'long-document-synthesis'],
  }),
});

export const KIMI_PRODUCTION_PROFILE = Object.freeze({
  id: 'mapping_kimi',
  adapter: 'moonshot-kimi',
  defaultModel: 'kimi-k2.6' as KimiModel,
  entropyTarget: 0.18,
});

export class KimiMCOPAdapter extends OpenAICompatibleMCOPAdapter {
  constructor(config: KimiAdapterConfig) {
    super({
      ...config,
      platform: 'moonshot-kimi',
      version: '2026-05',
      models: Object.keys(KIMI_MODEL_MAPPINGS),
      defaultModel: config.defaultModel ?? KIMI_PRODUCTION_PROFILE.defaultModel,
      defaultEntropyTarget: config.defaultEntropyTarget ?? KIMI_PRODUCTION_PROFILE.entropyTarget,
      features: [
        'openai-compatible-chat-completions',
        'system-prompt',
        'temperature-control',
        'usage-metering',
        'mcop-triad-refinement',
        'human-veto',
        'long-context',
      ],
      notes: 'Kimi/Moonshot OpenAI-compatible adapter. Uses https://api.moonshot.ai/v1 by default.',
    });
  }
}

export function defaultKimiClient(
  config: Partial<DefaultOpenAICompatibleClientConfig> = {},
): KimiClient {
  return createOpenAICompatibleChatClient({
    ...config,
    providerName: 'defaultKimiClient',
    baseUrl: config.baseUrl ?? 'https://api.moonshot.ai/v1',
    defaultModel: config.defaultModel ?? KIMI_PRODUCTION_PROFILE.defaultModel,
    apiKeyEnvNames: config.apiKeyEnvNames ?? ['KIMI_API_KEY', 'MOONSHOT_API_KEY'],
  });
}
