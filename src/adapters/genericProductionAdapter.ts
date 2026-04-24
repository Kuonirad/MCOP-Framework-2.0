/**
 * Generic production adapter — a 20-line scaffold for wiring any
 * REST/MCP/HTTP creative pipeline into the MCOP triad. Copy this file
 * and override `dispatch`, `platform` and (optionally) `domainDefaults`
 * to bind a new vendor.
 */

import {
  BaseAdapter,
  BaseAdapterDeps,
  PreparedDispatch,
} from './baseAdapter';
import {
  AdapterCapabilities,
  AdapterRequest,
} from './types';

export type GenericDispatchFn<TResult> = (args: {
  refinedPrompt: string;
  request: AdapterRequest;
  dispatch: PreparedDispatch;
}) => Promise<TResult>;

export interface GenericProductionAdapterConfig<TResult>
  extends BaseAdapterDeps {
  /** Stable platform identifier surfaced in provenance + capabilities. */
  platform: string;
  /** Vendor dispatch function — typically a thin SDK wrapper. */
  dispatch: GenericDispatchFn<TResult>;
  /** Optional capability descriptor. Defaults to a placeholder. */
  capabilities?: Partial<AdapterCapabilities>;
}

export class GenericProductionAdapter<TResult = unknown> extends BaseAdapter<
  AdapterRequest,
  TResult
> {
  private readonly platform: string;
  private readonly dispatchFn: GenericDispatchFn<TResult>;
  private readonly capabilities: AdapterCapabilities;

  constructor(config: GenericProductionAdapterConfig<TResult>) {
    super(config);
    this.platform = config.platform;
    this.dispatchFn = config.dispatch;
    this.capabilities = {
      platform: config.platform,
      version: config.capabilities?.version ?? 'unknown',
      models: config.capabilities?.models ?? [],
      supportsAudit: config.capabilities?.supportsAudit ?? true,
      features: config.capabilities?.features,
      maxResolution: config.capabilities?.maxResolution,
      notes:
        config.capabilities?.notes ??
        'Generic adapter: extend GenericProductionAdapter for stronger typing.',
    };
  }

  protected platformName(): string {
    return this.platform;
  }

  async getCapabilities(): Promise<AdapterCapabilities> {
    return this.capabilities;
  }

  protected async callPlatform(
    dispatch: PreparedDispatch,
    request: AdapterRequest,
  ): Promise<TResult> {
    return this.dispatchFn({
      refinedPrompt: dispatch.refinedPrompt,
      request,
      dispatch,
    });
  }
}
