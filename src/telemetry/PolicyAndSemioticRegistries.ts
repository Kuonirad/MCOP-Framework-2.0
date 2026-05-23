import * as crypto from 'node:crypto';
import { ISubstrateBridge } from './interfaces';
import { JCSUtility } from './JCSUtility';
import { HazardConfigBlock, PeirceanMatrixEvolutionBlock } from './types';

export class HardenedHazardPolicyRegistry {
  private readonly gamma_beta = 0.25;
  private readonly gamma_alpha = 0.15;
  private readonly baseline_beta = 4.0;
  private readonly baseline_alpha = 1.8;

  constructor(private readonly substrateBridge: ISubstrateBridge) {}

  public calculateAmortizedParameters(d2AreaDt2: number): { beta: number; alpha: number } {
    const acc = Math.max(0, d2AreaDt2);

    return {
      beta: this.baseline_beta * (1 + this.gamma_beta * Math.log(1 + acc)),
      alpha: this.baseline_alpha * (1 + this.gamma_alpha * Math.tanh(acc)),
    };
  }

  public async commitPolicyConfiguration(): Promise<string> {
    const policy: Omit<HazardConfigBlock, 'policyHash'> = {
      blockType: 'HAZARD_CONFIG_POLICY',
      timestamp: new Date().toISOString(),
      gamma_beta: this.gamma_beta,
      gamma_alpha: this.gamma_alpha,
      baseline_beta: this.baseline_beta,
      baseline_alpha: this.baseline_alpha,
    };
    const hash = crypto.createHash('sha256').update(JCSUtility.canonicalize(policy)).digest('hex');

    await this.substrateBridge.commitPolicyConfiguration({ ...policy, policyHash: hash });
    return hash;
  }
}

export class PeirceanProjectionRegistry {
  private readonly weights: number[][];
  private currentVersion = 0;
  private currentVersionHash = '0x0000000000000000000000000000000000000000000000000000000000000000';

  constructor(private readonly substrateBridge: ISubstrateBridge, rows = 128) {
    this.weights = Array.from({ length: rows }, (_row, i) =>
      Array.from({ length: 4 }, (_col, j) => Math.sin(i * 0.1 + j * 0.5) * 0.5),
    );
  }

  public async evolveAndCommit(
    successCentroid: number[],
    meanProxies: number[],
    alpha: number,
    resonanceArea: number,
  ): Promise<string> {
    const boundedAlpha = clamp01(alpha);

    for (let i = 0; i < this.weights.length; i++) {
      for (let j = 0; j < 4; j++) {
        const centroidValue = finiteOrZero(successCentroid[i]);
        const proxyValue = finiteOrZero(meanProxies[j]);
        this.weights[i][j] = (1 - boundedAlpha) * this.weights[i][j] + boundedAlpha * (centroidValue * proxyValue);
      }
    }

    this.currentVersion++;
    const evolutionBlock: Omit<PeirceanMatrixEvolutionBlock, 'blockHash'> = {
      blockType: 'PEIRCEAN_MATRIX_EVOLUTION',
      version: this.currentVersion,
      parentVersionHash: this.currentVersionHash,
      timestamp: new Date().toISOString(),
      dimensions: { rows: this.weights.length, cols: 4 },
      flattenedWeights: this.weights.flat(),
      evolutionMetrics: { lastPositiveResonanceArea: resonanceArea, adoptionVelocity: 1.0 },
    };
    const hash = crypto.createHash('sha256').update(JCSUtility.canonicalize(evolutionBlock)).digest('hex');

    await this.substrateBridge.commitMatrixEvolution({ ...evolutionBlock, blockHash: hash });
    this.currentVersionHash = hash;

    return hash;
  }

  public getActiveWeights(): number[][] {
    return this.weights.map((row) => [...row]);
  }
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function finiteOrZero(value: number | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}
