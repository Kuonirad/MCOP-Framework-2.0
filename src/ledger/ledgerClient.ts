/**
 * LedgerClient — MCOP-side adapter for the Hosted Provenance Ledger.
 *
 * The client exposes the same surface as {@link LedgerService} but is
 * transport-agnostic — it talks to an HTTP endpoint, a self-hosted
 * instance, an embedded in-memory ledger, or falls back gracefully to
 * a local-only mode when the hosted ledger is unreachable.
 *
 * Configuration is intentionally minimal so the one-line integration
 * recipe from the v3.0 roadmap stays one line:
 *
 * ```ts
 * const ledger = LedgerClient.fromConfig({
 *   type: 'hosted',
 *   endpoint: 'https://ledger.mcop.ai',
 *   apiKey: process.env.MCOP_LEDGER_KEY,
 * });
 * ```
 *
 * Fallback behaviour: when `type: 'hosted'` cannot reach the endpoint,
 * the client transparently switches to an in-process
 * {@link LedgerService} backed by {@link InMemoryStorageAdapter} and
 * annotates every receipt's metadata with `source: 'local-fallback'`
 * so the audit log can distinguish hosted vs locally-mirrored
 * etches.
 */

import {
  LedgerService,
  InMemoryStorageAdapter,
} from './ledgerService';
import type {
  EtchReceipt,
  EtchRequest,
  LedgerExportBundle,
  LedgerQueryFilters,
  LedgerQueryResult,
  VerifyResult,
} from './types';

export type LedgerSource = 'hosted' | 'self-host' | 'embedded' | 'local-fallback';

export interface LedgerClientConfig {
  type: LedgerSource;
  endpoint?: string;
  apiKey?: string;
  /**
   * When true, network failures silently fall back to an in-process
   * ledger so the MCOP host stays operational. Defaults to true.
   */
  fallback?: boolean;
  /** Test hook: replace the global fetch with a local implementation. */
  fetchImpl?: typeof fetch;
  /** Test hook: pre-built {@link LedgerService} (for `type: 'embedded'`). */
  embedded?: LedgerService;
}

export interface LedgerClient {
  readonly source: LedgerSource;
  etch(request: EtchRequest): Promise<EtchReceipt>;
  query(filters: LedgerQueryFilters): Promise<LedgerQueryResult>;
  verifyReceipt(receipt: EtchReceipt): Promise<VerifyResult>;
  exportFullLedger(tenantId: string): Promise<LedgerExportBundle>;
}

class EmbeddedClient implements LedgerClient {
  readonly source: LedgerSource = 'embedded';
  constructor(private readonly service: LedgerService) {}
  etch(request: EtchRequest): Promise<EtchReceipt> {
    return this.service.etch(request);
  }
  query(filters: LedgerQueryFilters): Promise<LedgerQueryResult> {
    return this.service.query(filters);
  }
  verifyReceipt(receipt: EtchReceipt): Promise<VerifyResult> {
    return this.service.verifyReceipt(receipt);
  }
  exportFullLedger(tenantId: string): Promise<LedgerExportBundle> {
    return this.service.exportFullLedger(tenantId);
  }
}

class HttpClient implements LedgerClient {
  readonly source: LedgerSource;
  private readonly endpoint: string;
  private readonly apiKey: string | undefined;
  private readonly fetchImpl: typeof fetch;
  private readonly fallback: LedgerService | undefined;
  /**
   * The "operational" source after the most recent request. Stays
   * `'hosted'`/`'self-host'` while the endpoint is reachable;
   * transitions to `'local-fallback'` on the first network failure
   * (and back again on the next successful round-trip).
   */
  private lastSource: LedgerSource;

  constructor(source: 'hosted' | 'self-host', config: LedgerClientConfig) {
    if (!config.endpoint) {
      throw new TypeError(`LedgerClient: endpoint is required for type='${source}'`);
    }
    this.source = source;
    this.lastSource = source;
    this.endpoint = config.endpoint.replace(/\/$/, '');
    this.apiKey = config.apiKey;
    this.fetchImpl = config.fetchImpl ?? fetch;
    this.fallback = config.fallback === false ? undefined : new LedgerService({ storage: new InMemoryStorageAdapter() });
  }

  /** Returns the most recent operational source for diagnostics. */
  getEffectiveSource(): LedgerSource {
    return this.lastSource;
  }

  async etch(request: EtchRequest): Promise<EtchReceipt> {
    return this.callOr(
      () => this.post<EtchReceipt>('/etch', request),
      () => this.fallback!.etch({ ...request, metadata: { ...(request.metadata ?? {}), source: 'local-fallback' } }),
    );
  }

  async query(filters: LedgerQueryFilters): Promise<LedgerQueryResult> {
    return this.callOr(
      () => this.post<LedgerQueryResult>('/query', filters),
      () => this.fallback!.query(filters),
    );
  }

  async verifyReceipt(receipt: EtchReceipt): Promise<VerifyResult> {
    return this.callOr(
      () => this.post<VerifyResult>('/verify', receipt),
      () => this.fallback!.verifyReceipt(receipt),
    );
  }

  async exportFullLedger(tenantId: string): Promise<LedgerExportBundle> {
    return this.callOr(
      () => this.post<LedgerExportBundle>('/export', { tenantId }),
      () => this.fallback!.exportFullLedger(tenantId),
    );
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const response = await this.fetchImpl(`${this.endpoint}${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(this.apiKey ? { 'x-mcop-ledger-api-key': this.apiKey } : {}),
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      throw new Error(`LedgerClient: ${path} returned HTTP ${response.status}`);
    }
    return (await response.json()) as T;
  }

  private async callOr<T>(remote: () => Promise<T>, local: () => Promise<T>): Promise<T> {
    try {
      const result = await remote();
      this.lastSource = this.source;
      return result;
    } catch (err) {
      if (!this.fallback) throw err;
      this.lastSource = 'local-fallback';
      return local();
    }
  }
}

export const LedgerClientFactory = {
  fromConfig(config: LedgerClientConfig): LedgerClient {
    if (config.type === 'embedded') {
      const service = config.embedded ?? new LedgerService({ storage: new InMemoryStorageAdapter() });
      return new EmbeddedClient(service);
    }
    if (config.type === 'hosted' || config.type === 'self-host') {
      return new HttpClient(config.type, config);
    }
    if (config.type === 'local-fallback') {
      return new EmbeddedClient(new LedgerService({ storage: new InMemoryStorageAdapter() }));
    }
    throw new TypeError(`LedgerClient: unknown source type '${(config as { type: string }).type}'`);
  },
} as const;

export function createLedgerClient(config: LedgerClientConfig): LedgerClient {
  return LedgerClientFactory.fromConfig(config);
}
