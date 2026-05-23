import { ISubstrateBridge } from './interfaces';
import { HazardConfigBlock, L1SpecificationResetBlock, PeirceanMatrixEvolutionBlock } from './types';
import logger from '../utils/logger';

type DynamicSurface = Record<string, unknown>;

export class SubstrateAdapter implements ISubstrateBridge {
  private readonly etch: DynamicSurface;
  private readonly substrate: DynamicSurface;
  private readonly driftSentinel: DynamicSurface;

  constructor(
    holographicEtchInstance: DynamicSurface,
    stigmergySubstrateInstance: DynamicSurface,
    driftSentinelInstance: DynamicSurface,
  ) {
    if (!holographicEtchInstance || !stigmergySubstrateInstance || !driftSentinelInstance) {
      throw new Error('[SubstrateAdapter] Fatal initialization error: All core substrate dependencies must be non-null.');
    }

    this.etch = holographicEtchInstance;
    this.substrate = stigmergySubstrateInstance;
    this.driftSentinel = driftSentinelInstance;
  }

  public async getLedgerHeadHash(): Promise<string> {
    try {
      const result = await this.callFirst<string>(this.etch, [
        'getHeadHash',
        'getLatestBlockHash',
        'getLatestBlockConfigurationHash',
      ]);
      if (typeof result === 'string') return result;

      logger.warn('[SubstrateAdapter] Naming collision alert: No matching head hash retrieval method located.');
      return zeroHash();
    } catch (error) {
      logger.error({ err: error }, '[SubstrateAdapter] Critical exception intercepted during ledger head hash query.');
      return zeroHash();
    }
  }

  public async calculateStressAreaIntegral(): Promise<number> {
    try {
      const result = await this.callFirst<number>(this.etch, [
        'getAccumulatedStressArea',
        'calculateStressArea',
        'getTotalStressArea',
        'getAccumulatedStressAreaSum',
      ]);
      return typeof result === 'number' && Number.isFinite(result) ? result : 0.0;
    } catch (error) {
      logger.error({ err: error }, '[SubstrateAdapter] Dynamic calculation of stress area integral aborted.');
      return 0.0;
    }
  }

  public async fetchHistoricalTraceMatrix(windowSize: number): Promise<number[][]> {
    try {
      const result = await this.callFirst<unknown>(this.etch, [
        'getRecentTraceMatrix',
        'extractRecentProxyTimeTrace',
        'getAnomalousTraceMatrix',
      ], windowSize);
      return normalizeMatrix(result);
    } catch (error) {
      logger.error({ err: error }, '[SubstrateAdapter] Failed to extract time-series proxy tracking matrix.');
      return [];
    }
  }

  public async commitResetBlock(block: L1SpecificationResetBlock): Promise<void> {
    await this.commitBlock(block, '[SubstrateAdapter] Fatal state tracking exception: Commitment of L1 reset block rejected.');
  }

  public async getPheromoneDensityMetric(): Promise<number> {
    try {
      const result = await this.callFirst<number>(this.substrate, ['getLocalDensity', 'getLocalizedTraceDensity']);
      return typeof result === 'number' && Number.isFinite(result) ? result : 0.0;
    } catch (error) {
      logger.error({ err: error }, '[SubstrateAdapter] Environmental trace tracking lookup failed.');
      return 0.0;
    }
  }

  public async emitAttenuationMask(traceId: string, blockId: string, mask: Float32Array): Promise<void> {
    const tracePayload = {
      traceId,
      signatureType: 'SYSTEMIC_MANIFOLD_RESET',
      originatingBlockId: blockId,
      attenuationMask: mask,
      initialIntensity: 1.0,
      timestamp: new Date().toISOString(),
    };

    try {
      if (await this.hasAndCall(this.substrate, 'emitTrace', tracePayload)) return;
      if (await this.hasAndCall(this.substrate, 'injectTrace', tracePayload)) return;
    } catch (error) {
      logger.error({ err: error }, '[SubstrateAdapter] Environmental pheromone trace emission rejected.');
      throw error;
    }

    throw new Error('[SubstrateAdapter] Stigmergic substrate injection methods are structurally absent.');
  }

  public async pullActiveSentinelEvents(): Promise<Array<{ timestamp: string; deltaValue: number; severity: string }>> {
    try {
      const events = await this.callFirst<unknown>(this.driftSentinel, ['getUncachedDivergenceLogs']);
      if (!Array.isArray(events)) return [];

      return events.map((event) => {
        const ev = isRecord(event) ? event : {};
        const timestamp = stringOrFallback(ev.recordedAt, stringOrFallback(ev.timestamp, new Date().toISOString()));
        const deltaValue =
          typeof ev.calculatedDelta === 'number'
            ? ev.calculatedDelta
            : typeof ev.deltaValue === 'number'
              ? ev.deltaValue
              : 0.0;
        const severity = stringOrFallback(ev.logSeverity, stringOrFallback(ev.severity, 'NOMINAL'));

        return { timestamp, deltaValue, severity };
      });
    } catch (error) {
      logger.error({ err: error }, '[SubstrateAdapter] Failed to pull live tracking records from DriftSentinel.');
      return [];
    }
  }

  public async commitMatrixEvolution(evolutionBlock: PeirceanMatrixEvolutionBlock): Promise<void> {
    await this.commitBlock(evolutionBlock, '[SubstrateAdapter] Ledger update failed: Matrix evolution block rejected.');
  }

  public async commitPolicyConfiguration(policyBlock: HazardConfigBlock): Promise<void> {
    await this.commitBlock(policyBlock, '[SubstrateAdapter] Ledger update failed: Hazard configuration block rejected.');
  }

  private async commitBlock(block: unknown, errorMessage: string): Promise<void> {
    try {
      if (await this.hasAndCall(this.etch, 'appendEntry', block)) return;
      if (await this.hasAndCall(this.etch, 'writeStructuralStateMutationBlock', block)) return;

      throw new Error('[SubstrateAdapter] Ledger write append target methods are structurally absent.');
    } catch (error) {
      logger.error({ err: error }, errorMessage);
      throw error;
    }
  }

  private async callFirst<T>(target: DynamicSurface, names: string[], ...args: unknown[]): Promise<T | undefined> {
    for (const name of names) {
      const fn = target[name];
      if (typeof fn === 'function') {
        return (await (fn as (...innerArgs: unknown[]) => T | Promise<T>)(...args)) as T;
      }
    }
    return undefined;
  }

  private async hasAndCall(target: DynamicSurface, name: string, ...args: unknown[]): Promise<boolean> {
    const fn = target[name];
    if (typeof fn !== 'function') return false;
    await (fn as (...innerArgs: unknown[]) => unknown | Promise<unknown>)(...args);
    return true;
  }
}

function zeroHash(): string {
  return '0x0000000000000000000000000000000000000000000000000000000000000000';
}

function normalizeMatrix(value: unknown): number[][] {
  if (!Array.isArray(value)) return [];

  return value
    .filter((row): row is unknown[] => Array.isArray(row))
    .map((row) => row.filter((item): item is number => typeof item === 'number' && Number.isFinite(item)));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function stringOrFallback(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}
