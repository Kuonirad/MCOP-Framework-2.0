/**
 * Multi-Provider Entropy / Resonance Router — Grok vs. Qwen.
 *
 * Generalises the single-provider routers `chooseProviderByEntropyResonance`
 * (Grok) and `chooseQwenByEntropyResonance` (Qwen) into a single decision
 * function that returns *both* the routing target (`'grok' | 'qwen' |
 * 'local' | 'human-review'`) AND, when a remote provider is chosen, a
 * concrete model id drawn from that provider's production catalog.
 *
 * The router is pure: given the same entropy/resonance signals and the
 * same config it always returns the same decision, and it never mutates
 * the supplied config. Orchestrators are expected to call this once per
 * dispatch and feed the result into the matching adapter
 * (`GrokMCOPAdapter` / `QwenMCOPAdapter`).
 *
 * Decision tree (in order):
 *
 *   1. `resonance >= highResonanceCeiling`
 *      → `local`  (cache hit; no remote call)
 *
 *   2. `entropy >= noveltyEntropyFloor && resonance < lowResonanceFloor`
 *      → `human-review`  (novel AND low-confidence; escalate)
 *
 *   3. `entropy < noveltyEntropyFloor`
 *      → `local`  (familiar prompt; serve from triad)
 *
 *   4. otherwise (novel + confident enough): pick provider + model:
 *      - if `preferredProvider !== 'auto'` AND that provider is not in
 *        `unavailableProviders` → use it
 *      - else pick by `costPreference` + entropy band:
 *          - `'cost'`     → cheapest Qwen tier (flash)
 *          - `'quality'`  → highest-capability tier (Qwen3-Max for med,
 *                           Grok flagship reasoning for very-high entropy)
 *          - `'balanced'` → Qwen3.5-Plus by default; promote to Qwen3-Max
 *                           past `highEntropyBand`
 *      - if the chosen provider is in `unavailableProviders`, fall back
 *        to the other provider
 *      - if BOTH providers are unavailable → `local` with a clear reason
 *
 * The router knows about the production-catalog defaults exposed by
 * `MAPPING_GROK_PRODUCTION_PROFILE` and `MAPPING_QWEN_PRODUCTION_PROFILE`;
 * it never invents model ids. Callers can override any concrete pick by
 * passing `preferredProvider` plus `preferredModel`.
 */

import type { GrokModel } from './grokAdapter';
import {
  GROK_MODEL_MAPPINGS,
  MAPPING_GROK_PRODUCTION_PROFILE,
} from './grokAdapter';
import type { QwenModel } from './qwenAdapter';
import {
  MAPPING_QWEN_PRODUCTION_PROFILE,
  QWEN_MODEL_MAPPINGS,
} from './qwenAdapter';

/** Cross-provider router name. */
export type MultiProviderName = 'grok' | 'qwen';

/** Cost / latency preference hint used to pick a specific model tier. */
export type MultiProviderCostPreference = 'cost' | 'balanced' | 'quality';

/** Result of a single routing call. */
export type MultiProviderRoutingDecision =
  | { readonly provider: 'grok'; readonly model: GrokModel; readonly reason: string }
  | { readonly provider: 'qwen'; readonly model: QwenModel; readonly reason: string }
  | { readonly provider: 'local'; readonly reason: string }
  | { readonly provider: 'human-review'; readonly reason: string };

export interface MultiProviderRouterConfig {
  /**
   * Above this entropy the prompt is "novel" enough to merit a remote
   * call. Default `0.55` — same calibration as the single-provider
   * routers so behaviour is comparable.
   */
  readonly noveltyEntropyFloor?: number;
  /**
   * Above this resonance the prompt strongly matches an existing trace
   * and is cheap to satisfy locally. Default `0.7`.
   */
  readonly highResonanceCeiling?: number;
  /**
   * Below this resonance AND above {@link noveltyEntropyFloor} the
   * router escalates to human review instead of silently dispatching
   * a low-confidence remote call. Default `0.15`.
   */
  readonly lowResonanceFloor?: number;
  /**
   * Above this entropy band the router promotes the chosen provider to
   * its flagship reasoning tier. Default `0.75`.
   */
  readonly highEntropyBand?: number;
  /**
   * Cost / latency preference hint. Default `'balanced'`.
   */
  readonly costPreference?: MultiProviderCostPreference;
  /**
   * Explicit provider preference. Default `'auto'`, which lets the
   * router pick by {@link costPreference} and entropy band.
   */
  readonly preferredProvider?: MultiProviderName | 'auto';
  /**
   * Explicit model preference. Only honoured when
   * {@link preferredProvider} is `'grok'` or `'qwen'` AND that provider
   * is not in {@link unavailableProviders}. The model is forwarded
   * verbatim even if it isn't in the local catalog so callers can pin
   * fine-tuned deployment ids.
   */
  readonly preferredModel?: string;
  /**
   * Providers the orchestrator has marked as currently unavailable
   * (e.g. an open circuit-breaker, exhausted quota, regional outage).
   * The router will skip them and fall back to the other provider; if
   * BOTH are listed, the decision degrades to `'local'`.
   */
  readonly unavailableProviders?: ReadonlyArray<MultiProviderName>;
}

const DEFAULTS = Object.freeze({
  noveltyEntropyFloor: 0.55,
  highResonanceCeiling: 0.7,
  lowResonanceFloor: 0.15,
  highEntropyBand: 0.75,
  costPreference: 'balanced' as MultiProviderCostPreference,
  preferredProvider: 'auto' as MultiProviderName | 'auto',
});

/** Production-catalog model ids the router can choose from per (provider × cost × band). */
export const MULTI_PROVIDER_MODEL_PICKS = Object.freeze({
  qwen: Object.freeze({
    cost: 'qwen3.5-flash' as QwenModel,
    balanced: MAPPING_QWEN_PRODUCTION_PROFILE.defaultModel,
    balancedHigh: 'qwen3-max' as QwenModel,
    quality: 'qwen3-max' as QwenModel,
    qualityVeryHigh: 'qwen3-max-preview' as QwenModel,
  }),
  grok: Object.freeze({
    cost: 'grok-4-1-fast-non-reasoning' as GrokModel,
    balanced: MAPPING_GROK_PRODUCTION_PROFILE.defaultModel,
    balancedHigh: 'grok-4.20-0309-non-reasoning' as GrokModel,
    quality: 'grok-4.3' as GrokModel,
    qualityVeryHigh: 'grok-4.20-0309-reasoning' as GrokModel,
  }),
});

function isAvailable(
  provider: MultiProviderName,
  unavailable: ReadonlyArray<MultiProviderName>,
): boolean {
  return !unavailable.includes(provider);
}

function pickQwenModel(
  costPreference: MultiProviderCostPreference,
  entropy: number,
  highEntropyBand: number,
): QwenModel {
  if (costPreference === 'cost') {
    return MULTI_PROVIDER_MODEL_PICKS.qwen.cost;
  }
  if (costPreference === 'quality') {
    return entropy >= highEntropyBand
      ? MULTI_PROVIDER_MODEL_PICKS.qwen.qualityVeryHigh
      : MULTI_PROVIDER_MODEL_PICKS.qwen.quality;
  }
  return entropy >= highEntropyBand
    ? MULTI_PROVIDER_MODEL_PICKS.qwen.balancedHigh
    : MULTI_PROVIDER_MODEL_PICKS.qwen.balanced;
}

function pickGrokModel(
  costPreference: MultiProviderCostPreference,
  entropy: number,
  highEntropyBand: number,
): GrokModel {
  if (costPreference === 'cost') {
    return MULTI_PROVIDER_MODEL_PICKS.grok.cost;
  }
  if (costPreference === 'quality') {
    return entropy >= highEntropyBand
      ? MULTI_PROVIDER_MODEL_PICKS.grok.qualityVeryHigh
      : MULTI_PROVIDER_MODEL_PICKS.grok.quality;
  }
  return entropy >= highEntropyBand
    ? MULTI_PROVIDER_MODEL_PICKS.grok.balancedHigh
    : MULTI_PROVIDER_MODEL_PICKS.grok.balanced;
}

function defaultAutoProvider(
  costPreference: MultiProviderCostPreference,
  entropy: number,
  highEntropyBand: number,
): MultiProviderName {
  // Heuristic for `auto`:
  //   - `'cost'`  → always pick Qwen (Qwen3.5-Flash is currently the
  //     cheapest production-class tier in the multi-provider matrix).
  //   - `'quality'` + very-high entropy → pick Grok flagship reasoning
  //     for cross-provider verification.
  //   - `'quality'` otherwise → Qwen3-Max (best Qwen flagship).
  //   - `'balanced'` → Qwen by default (broader catalog, longer context
  //     window on the production default, comparable cost).
  if (costPreference === 'cost') return 'qwen';
  if (costPreference === 'quality' && entropy >= highEntropyBand) return 'grok';
  return 'qwen';
}

/**
 * Pick a routing target across the Grok and Qwen providers.
 *
 * @param signals - Encoder/stigmergy signals for the current prompt.
 * @param config  - Routing policy. All fields are optional; defaults
 *                  match the single-provider routers so existing
 *                  configurations transfer.
 *
 * @returns A {@link MultiProviderRoutingDecision} carrying the routing
 * target, the concrete model id when a remote provider is chosen, and a
 * human-readable `reason` field so audit logs can explain the pick.
 */
export function chooseProviderAcrossGrokAndQwen(
  signals: { readonly entropy: number; readonly resonance: number },
  config: MultiProviderRouterConfig = {},
): MultiProviderRoutingDecision {
  const noveltyFloor = config.noveltyEntropyFloor ?? DEFAULTS.noveltyEntropyFloor;
  const highResCeiling = config.highResonanceCeiling ?? DEFAULTS.highResonanceCeiling;
  const lowResFloor = config.lowResonanceFloor ?? DEFAULTS.lowResonanceFloor;
  const highEntropyBand = config.highEntropyBand ?? DEFAULTS.highEntropyBand;
  const costPreference = config.costPreference ?? DEFAULTS.costPreference;
  const preferredProvider = config.preferredProvider ?? DEFAULTS.preferredProvider;
  const unavailable = config.unavailableProviders ?? [];

  if (signals.resonance >= highResCeiling) {
    return { provider: 'local', reason: 'high-resonance-cache-hit' };
  }
  if (signals.entropy >= noveltyFloor && signals.resonance < lowResFloor) {
    return { provider: 'human-review', reason: 'novel-low-confidence' };
  }
  if (signals.entropy < noveltyFloor) {
    return { provider: 'local', reason: 'familiar-prompt-served-locally' };
  }

  const qwenAvailable = isAvailable('qwen', unavailable);
  const grokAvailable = isAvailable('grok', unavailable);

  if (!qwenAvailable && !grokAvailable) {
    return {
      provider: 'local',
      reason: 'all-providers-unavailable',
    };
  }

  const auto = defaultAutoProvider(costPreference, signals.entropy, highEntropyBand);
  let chosen: MultiProviderName =
    preferredProvider === 'auto' ? auto : preferredProvider;

  if (chosen === 'qwen' && !qwenAvailable) {
    chosen = 'grok';
  } else if (chosen === 'grok' && !grokAvailable) {
    chosen = 'qwen';
  }

  if (chosen === 'qwen') {
    const model =
      preferredProvider === 'qwen' && config.preferredModel
        ? (config.preferredModel as QwenModel)
        : pickQwenModel(costPreference, signals.entropy, highEntropyBand);
    return {
      provider: 'qwen',
      model,
      reason: reasonFor('qwen', costPreference, signals.entropy, highEntropyBand, preferredProvider, unavailable),
    };
  }

  const model =
    preferredProvider === 'grok' && config.preferredModel
      ? (config.preferredModel as GrokModel)
      : pickGrokModel(costPreference, signals.entropy, highEntropyBand);
  return {
    provider: 'grok',
    model,
    reason: reasonFor('grok', costPreference, signals.entropy, highEntropyBand, preferredProvider, unavailable),
  };
}

function reasonFor(
  chosen: MultiProviderName,
  costPreference: MultiProviderCostPreference,
  entropy: number,
  highEntropyBand: number,
  preferredProvider: MultiProviderName | 'auto',
  unavailable: ReadonlyArray<MultiProviderName>,
): string {
  if (preferredProvider !== 'auto' && preferredProvider !== chosen) {
    return `preferred-${preferredProvider}-unavailable-failover-${chosen}`;
  }
  if (preferredProvider === chosen) {
    return unavailable.length > 0
      ? `preferred-${chosen}-honoured-with-failover-context`
      : `preferred-${chosen}-honoured`;
  }
  if (costPreference === 'cost') {
    return `auto-cost-cheapest-${chosen}-tier`;
  }
  if (costPreference === 'quality') {
    return entropy >= highEntropyBand
      ? `auto-quality-very-high-entropy-${chosen}-reasoning-tier`
      : `auto-quality-${chosen}-flagship-tier`;
  }
  return entropy >= highEntropyBand
    ? `auto-balanced-high-entropy-${chosen}-tier-promoted`
    : `auto-balanced-${chosen}-default-tier`;
}

/**
 * Convenience: returns `true` iff the concrete model id chosen by the
 * router is present in its provider's production catalog. Useful for
 * orchestrators that want to assert on the catalog-drift invariant
 * before dispatch.
 */
export function isCatalogedDecision(
  decision: MultiProviderRoutingDecision,
): boolean {
  if (decision.provider === 'qwen') {
    return Object.prototype.hasOwnProperty.call(QWEN_MODEL_MAPPINGS, decision.model);
  }
  if (decision.provider === 'grok') {
    return Object.prototype.hasOwnProperty.call(GROK_MODEL_MAPPINGS, decision.model);
  }
  return true;
}
