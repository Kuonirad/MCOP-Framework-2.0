import {
  BaseAdapter,
  BaseAdapterDeps,
  PreparedDispatch,
} from './baseAdapter';
import {
  AdapterCapabilities,
  AdapterRequest,
} from './types';
import type {
  OpenAICompatibleChatClient,
  OpenAICompatibleCompletionOptions,
  OpenAICompatibleCompletionResult,
} from './openAICompatibleChatClient';

export interface OpenAICompatibleRequest extends AdapterRequest {
  payload?: {
    options?: OpenAICompatibleCompletionOptions;
  };
}

export interface OpenAICompatibleAdapterConfig extends BaseAdapterDeps {
  client: OpenAICompatibleChatClient;
  platform: string;
  version: string;
  models: ReadonlyArray<string>;
  defaultModel: string;
  defaultEntropyTarget?: number;
  features?: ReadonlyArray<string>;
  notes?: string;
}

export class OpenAICompatibleMCOPAdapter extends BaseAdapter<
  OpenAICompatibleRequest,
  OpenAICompatibleCompletionResult
> {
  private readonly client: OpenAICompatibleChatClient;
  private readonly platform: string;
  private readonly version: string;
  private readonly models: ReadonlyArray<string>;
  private readonly defaultModel: string;
  private readonly defaultEntropyTarget: number;
  private readonly features: ReadonlyArray<string>;
  private readonly notes: string | undefined;

  constructor(config: OpenAICompatibleAdapterConfig) {
    super(config);
    this.client = config.client;
    this.platform = config.platform;
    this.version = config.version;
    this.models = config.models;
    this.defaultModel = config.defaultModel;
    this.defaultEntropyTarget = config.defaultEntropyTarget ?? 0.18;
    this.features = config.features ?? [
      'chat-completions',
      'system-prompt',
      'temperature-control',
      'usage-metering',
      'mcop-triad-refinement',
      'human-veto',
    ];
    this.notes = config.notes;
  }

  protected platformName(): string {
    return this.platform;
  }

  async getCapabilities(): Promise<AdapterCapabilities> {
    return {
      platform: this.platform,
      version: this.version,
      models: [...this.models],
      supportsAudit: true,
      features: [...this.features],
      notes: this.notes,
    };
  }

  async generateOptimizedCompletion(
    prompt: string,
    options: OpenAICompatibleCompletionOptions = {},
    extras: Pick<OpenAICompatibleRequest, 'styleContext' | 'humanFeedback' | 'metadata' | 'entropyTarget'> = {},
  ) {
    return this.generate({
      prompt,
      domain: 'narrative',
      entropyTarget: extras.entropyTarget ?? this.defaultEntropyTarget,
      styleContext: extras.styleContext,
      humanFeedback: extras.humanFeedback,
      metadata: {
        ...(extras.metadata ?? {}),
        assetKind: 'completion',
        model: options.model ?? this.defaultModel,
      },
      payload: { options },
    });
  }

  protected async callPlatform(
    dispatch: PreparedDispatch,
    request: OpenAICompatibleRequest,
  ): Promise<OpenAICompatibleCompletionResult> {
    const rawOptions = request.payload?.options ?? {};
    const options: OpenAICompatibleCompletionOptions = {
      ...rawOptions,
      model: rawOptions.model ?? this.defaultModel,
    };
    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [];
    if (options.systemPrompt && options.systemPrompt.trim().length > 0) {
      messages.push({ role: 'system', content: options.systemPrompt.trim() });
    }
    messages.push({ role: 'user', content: dispatch.refinedPrompt });
    return this.client.createCompletion({ messages, options });
  }
}
