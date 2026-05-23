import * as crypto from 'node:crypto';
import { BurnInTraceStore } from './BurnInTraceStore';
import { GuardianKeyVault } from './GuardianKeyVault';
import { ISubstrateBridge } from './interfaces';
import { HardenedHazardPolicyRegistry, PeirceanProjectionRegistry } from './PolicyAndSemioticRegistries';
import { ProductionTensorProjectionEngine, proxiesToVector } from './ProductionTensorProjectionEngine';
import { ResetAuditor } from './ResetAuditor';
import { InstabilityNature, L1SpecificationResetBlock, TelemetryProxies } from './types';
import { JCSUtility } from './JCSUtility';

export interface CommitPipelineStageExecutionInput {
  stageId: string;
  proxies: TelemetryProxies;
  failingL1Parameters?: Record<string, unknown>;
  newL1Parameters?: Record<string, unknown>;
  resetRationale?: string;
  successCentroid?: number[];
  meanProxies?: TelemetryProxies;
}

export interface PipelineStageCommitResult {
  resetCommitted: boolean;
  resetBlock?: L1SpecificationResetBlock;
  matrixEvolutionHash?: string;
  persistenceCounter: number;
  leakyIntegratorValue: number;
  instabilityNature: InstabilityNature;
  hazardParameters: { beta: number; alpha: number };
}

export interface MCOPHardeningBootstrapperConfig {
  substrateBridge: ISubstrateBridge;
  keyVault: GuardianKeyVault;
  burnInTraceStore?: BurnInTraceStore;
  policyRegistry?: HardenedHazardPolicyRegistry;
  projectionRegistry?: PeirceanProjectionRegistry;
  tensorProjectionEngine?: ProductionTensorProjectionEngine;
  resetAuditor?: ResetAuditor;
  persistenceThreshold?: number;
}

export class MCOPHardeningBootstrapper {
  private readonly substrateBridge: ISubstrateBridge;
  private readonly burnInTraceStore: BurnInTraceStore;
  private readonly policyRegistry: HardenedHazardPolicyRegistry;
  private readonly projectionRegistry: PeirceanProjectionRegistry;
  private readonly tensorProjectionEngine: ProductionTensorProjectionEngine;
  private readonly resetAuditor: ResetAuditor;
  public readonly publicKeyHex: string;

  constructor(config: MCOPHardeningBootstrapperConfig) {
    this.substrateBridge = config.substrateBridge;
    this.burnInTraceStore =
      config.burnInTraceStore ?? new BurnInTraceStore({ persistenceThreshold: config.persistenceThreshold });
    this.policyRegistry = config.policyRegistry ?? new HardenedHazardPolicyRegistry(config.substrateBridge);
    this.projectionRegistry = config.projectionRegistry ?? new PeirceanProjectionRegistry(config.substrateBridge);
    this.tensorProjectionEngine = config.tensorProjectionEngine ?? new ProductionTensorProjectionEngine();
    this.resetAuditor = config.resetAuditor ?? new ResetAuditor(config.keyVault);
    this.publicKeyHex = config.keyVault.publicKeyHex;
  }

  public async commitStructuralConfiguration(): Promise<{ policyHash: string }> {
    return {
      policyHash: await this.policyRegistry.commitPolicyConfiguration(),
    };
  }

  public async commitPipelineStageExecution(
    input: CommitPipelineStageExecutionInput,
  ): Promise<PipelineStageCommitResult> {
    const sample = this.burnInTraceStore.record(input.proxies);
    const [stressArea, driftSentinelEvents, negativePheromoneDensity, historicalTraceMatrix, previousEtchHash] =
      await Promise.all([
        this.substrateBridge.calculateStressAreaIntegral(),
        this.substrateBridge.pullActiveSentinelEvents(),
        this.substrateBridge.getPheromoneDensityMetric(),
        this.substrateBridge.fetchHistoricalTraceMatrix(64),
        this.substrateBridge.getLedgerHeadHash(),
      ]);
    const hazardParameters = this.policyRegistry.calculateAmortizedParameters(stressArea);
    const activeWeights = this.projectionRegistry.getActiveWeights();
    const meanProxySnapshot = input.meanProxies ?? this.burnInTraceStore.getMeanProxies(16);
    const successCentroid =
      input.successCentroid ??
      this.tensorProjectionEngine.deriveSuccessCentroid(historicalTraceMatrix, activeWeights.length);
    const matrixEvolutionHash = await this.projectionRegistry.evolveAndCommit(
      successCentroid,
      proxiesToVector(meanProxySnapshot),
      Math.min(0.2, hazardParameters.alpha / 100),
      stressArea,
    );

    if (!this.burnInTraceStore.isResetRecommended()) {
      return {
        resetCommitted: false,
        matrixEvolutionHash,
        persistenceCounter: this.burnInTraceStore.getPersistenceCounter(),
        leakyIntegratorValue: this.burnInTraceStore.getLeakyIntegratorValue(),
        instabilityNature: sample.nature,
        hazardParameters,
      };
    }

    const stigmergicResetTraceId = `reset-trace-${stableHash(input.stageId).slice(0, 16)}`;
    const attenuationMask = this.tensorProjectionEngine.projectAttenuationMask(input.proxies, activeWeights);
    const resetBlock = this.resetAuditor.createSignedResetBlock({
      previousEtchHash,
      persistenceCounterAtTrigger: this.burnInTraceStore.getPersistenceCounter(),
      leakyIntegratorValue: this.burnInTraceStore.getLeakyIntegratorValue(),
      mahalanobisDistance: calculateProxyDistance(input.proxies, meanProxySnapshot),
      proxySnapshotAtDecision: input.proxies,
      driftSentinelEvents,
      guardianGroundingIndexAtTrigger: clamp01(1 - negativePheromoneDensity),
      negativePheromoneDensity,
      failingL1Parameters: input.failingL1Parameters ?? {},
      newL1Parameters: input.newL1Parameters ?? {},
      positiveResonanceAreaAtReset: stressArea,
      resetRationale:
        input.resetRationale ??
        'Persistent telemetry instability exceeded the burn-in threshold and triggered a signed L1 reset block.',
      stigmergicResetTraceId,
    });

    await this.substrateBridge.commitResetBlock(resetBlock);
    await this.substrateBridge.emitAttenuationMask(stigmergicResetTraceId, resetBlock.blockId, attenuationMask);

    return {
      resetCommitted: true,
      resetBlock,
      matrixEvolutionHash,
      persistenceCounter: this.burnInTraceStore.getPersistenceCounter(),
      leakyIntegratorValue: this.burnInTraceStore.getLeakyIntegratorValue(),
      instabilityNature: InstabilityNature.SYSTEMIC_BREAKDOWN,
      hazardParameters,
    };
  }
}

function calculateProxyDistance(current: TelemetryProxies, mean: TelemetryProxies): number {
  const currentVector = proxiesToVector(current);
  const meanVector = proxiesToVector(mean);
  const sumSquares = currentVector.reduce((sum, value, index) => sum + (value - meanVector[index]) ** 2, 0);

  return Math.sqrt(sumSquares);
}

function stableHash(payload: unknown): string {
  return crypto.createHash('sha256').update(JCSUtility.canonicalize(payload)).digest('hex');
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}
