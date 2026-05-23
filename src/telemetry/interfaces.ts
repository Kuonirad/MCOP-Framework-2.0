import {
  HazardConfigBlock,
  L1SpecificationResetBlock,
  PeirceanMatrixEvolutionBlock,
} from './types';

export interface ISubstrateBridge {
  getLedgerHeadHash(): Promise<string>;
  calculateStressAreaIntegral(): Promise<number>;
  pullActiveSentinelEvents(): Promise<Array<{ timestamp: string; deltaValue: number; severity: string }>>;
  getPheromoneDensityMetric(): Promise<number>;
  fetchHistoricalTraceMatrix(windowSize: number): Promise<number[][]>;
  commitResetBlock(block: L1SpecificationResetBlock): Promise<void>;
  emitAttenuationMask(traceId: string, blockId: string, mask: Float32Array): Promise<void>;
  commitMatrixEvolution(evolutionBlock: PeirceanMatrixEvolutionBlock): Promise<void>;
  commitPolicyConfiguration(policyBlock: HazardConfigBlock): Promise<void>;
}
