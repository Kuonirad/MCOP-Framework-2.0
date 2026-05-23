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

export type DeepSeekModel =
  | 'deepseek-v4-flash'
  | 'deepseek-v4-pro'
  | 'deepseek-chat'
  | 'deepseek-reasoner'
  | (string & {});

export type DeepSeekCompletionOptions = OpenAICompatibleCompletionOptions & {
  model?: DeepSeekModel;
};
export type DeepSeekRequest = OpenAICompatibleRequest;
export type DeepSeekClient = OpenAICompatibleChatClient;
export type DeepSeekCompletionResult = OpenAICompatibleCompletionResult;

export interface DeepSeekAdapterConfig extends BaseAdapterDeps {
  client: DeepSeekClient;
  defaultModel?: DeepSeekModel;
  defaultEntropyTarget?: number;
}

export const DEEPSEEK_MODEL_MAPPINGS: Readonly<Record<string, {
  readonly model: DeepSeekModel;
  readonly tier: 'flagship' | 'fast' | 'legacy';
  readonly useCases: ReadonlyArray<string>;
}>> = Object.freeze({
  'deepseek-v4-flash': Object.freeze({
    model: 'deepseek-v4-flash',
    tier: 'fast',
    useCases: ['cost-aware-reasoning', 'agentic-routing', 'batch-completions'],
  }),
  'deepseek-v4-pro': Object.freeze({
    model: 'deepseek-v4-pro',
    tier: 'flagship',
    useCases: ['hard-reasoning', 'verification', 'coding'],
  }),
  'deepseek-chat': Object.freeze({
    model: 'deepseek-chat',
    tier: 'legacy',
    useCases: ['compatibility'],
  }),
  'deepseek-reasoner': Object.freeze({
    model: 'deepseek-reasoner',
    tier: 'legacy',
    useCases: ['compatibility', 'reasoning'],
  }),
});

export const DEEPSEEK_PRODUCTION_PROFILE = Object.freeze({
  id: 'mapping_deepseek',
  adapter: 'deepseek',
  defaultModel: 'deepseek-v4-flash' as DeepSeekModel,
  entropyTarget: 0.18,
});

export class DeepSeekMCOPAdapter extends OpenAICompatibleMCOPAdapter {
  constructor(config: DeepSeekAdapterConfig) {
    super({
      ...config,
      platform: 'deepseek',
      version: '2026-05',
      models: Object.keys(DEEPSEEK_MODEL_MAPPINGS),
      defaultModel: config.defaultModel ?? DEEPSEEK_PRODUCTION_PROFILE.defaultModel,
      defaultEntropyTarget: config.defaultEntropyTarget ?? DEEPSEEK_PRODUCTION_PROFILE.entropyTarget,
      features: [
        'openai-compatible-chat-completions',
        'system-prompt',
        'temperature-control',
        'usage-metering',
        'mcop-triad-refinement',
        'human-veto',
      ],
      notes: 'DeepSeek OpenAI-compatible adapter. Uses https://api.deepseek.com by default.',
    });
  }
}

export function defaultDeepSeekClient(
  config: Partial<DefaultOpenAICompatibleClientConfig> = {},
): DeepSeekClient {
  return createOpenAICompatibleChatClient({
    ...config,
    providerName: 'defaultDeepSeekClient',
    baseUrl: config.baseUrl ?? 'https://api.deepseek.com',
    defaultModel: config.defaultModel ?? DEEPSEEK_PRODUCTION_PROFILE.defaultModel,
    apiKeyEnvNames: config.apiKeyEnvNames ?? ['DEEPSEEK_API_KEY'],
  });
}
