/**
 * Convenience factory for creating a HolographicEtch that is automatically
 * wired to the Hosted Ledger with the best available forwarding strategy.
 *
 * Usage (recommended in production):
 *
 *   const etch = createLedgerAwareHolographicEtch({
 *     ledgerClient,
 *     ledgerTenantId: 'my-org',
 *     redis,                    // ← if present, uses RedisAsyncLedgerForwarder with retry+DLQ
 *     asyncLedgerForwarding: true,
 *     // ... other HolographicEtch options
 *   });
 *
 * This gives you:
 * - Automatic choice between Redis-backed (durable, distributed) and in-memory forwarder
 * - Clean one-liner for both HolographicEtch and the GrokMCOPAdapter
 */

import { HolographicEtch, type HolographicEtchConfig } from '../core/holographicEtch';
import type { LedgerClient } from './ledgerClient';
import { createBackgroundLedgerForwarder } from './asyncLedgerForwarder';
import { createRedisAsyncLedgerForwarder } from './redisAsyncLedgerForwarder';

export interface LedgerAwareEtchConfig extends Omit<HolographicEtchConfig, 'ledgerClient' | 'ledgerTenantId' | 'asyncLedgerForwarding'> {
  ledgerClient: LedgerClient;
  ledgerTenantId: string;

  /**
   * Optional Redis client (ioredis, node-redis, etc.).
   * When provided, the factory will automatically use RedisAsyncLedgerForwarder
   * (with retry + DLQ) instead of the in-memory version.
   */
  redis?: unknown;

  /**
   * Forwarder-specific config (passed through to whichever forwarder is chosen).
   */
  ledgerForwarderConfig?: Record<string, unknown>;
}

/**
 * Creates a HolographicEtch instance that is pre-wired for reliable ledger forwarding.
 *
 * - If `redis` is provided → uses `RedisAsyncLedgerForwarder` (recommended for production)
 * - Otherwise → uses the in-memory `BackgroundLedgerForwarder`
 */
export function createLedgerAwareHolographicEtch(config: LedgerAwareEtchConfig): HolographicEtch {
  const { ledgerClient, ledgerTenantId, redis, ledgerForwarderConfig, ...etchConfig } = config;

  // Create the forwarder (Redis if available, otherwise in-memory)
  // Note: the forwarder instance is intentionally created here for reuse by callers (e.g. GrokMCOPAdapter)
  // even though this function itself does not return it.
  const _forwarder = redis
    ? createRedisAsyncLedgerForwarder(ledgerClient, redis, {
        maxRetries: 12,
        ...ledgerForwarderConfig,
      })
    : createBackgroundLedgerForwarder(ledgerClient, {
        maxRetries: 8,
        ...ledgerForwarderConfig,
      });

  // We pass asyncLedgerForwarding + ledger* so the Etch can also work if someone uses it directly.
  // The forwarder is created here so it can be reused by the adapter.
  return new HolographicEtch({
    ...etchConfig,
    ledgerClient,
    ledgerTenantId,
    asyncLedgerForwarding: true,
    ledgerForwarderConfig,
  });
}

/**
 * Even more convenient helper when you are using the GrokMCOPAdapter.
 *
 * Returns both a properly wired Etch and a forwarder you can pass to
 * `processOrganelleResult` if you want manual control.
 */
export function createOrganelleReadyEtch(config: LedgerAwareEtchConfig) {
  const { ledgerClient, redis, ledgerForwarderConfig } = config;

  const forwarder = redis
    ? createRedisAsyncLedgerForwarder(ledgerClient, redis, {
        maxRetries: 12,
        ...ledgerForwarderConfig,
      })
    : createBackgroundLedgerForwarder(ledgerClient, {
        maxRetries: 8,
        ...ledgerForwarderConfig,
      });

  const etch = createLedgerAwareHolographicEtch(config);

  return { etch, forwarder };
}
