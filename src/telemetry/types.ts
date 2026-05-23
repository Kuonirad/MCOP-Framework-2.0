export enum InstabilityNature {
  TRANSIENT_SPIKE = 'TRANSIENT_SPIKE',
  PERSISTENT_FRICTION = 'PERSISTENT_FRICTION',
  SYSTEMIC_BREAKDOWN = 'SYSTEMIC_BREAKDOWN',
}

export interface TelemetryProxies {
  rho: number;
  rInstability: number;
  deltaVfe: number;
  sigma: number;
}

export interface HazardConfigBlock {
  blockType: 'HAZARD_CONFIG_POLICY';
  timestamp: string;
  gamma_beta: number;
  gamma_alpha: number;
  baseline_beta: number;
  baseline_alpha: number;
  policyHash: string;
}

export interface PeirceanMatrixEvolutionBlock {
  blockType: 'PEIRCEAN_MATRIX_EVOLUTION';
  version: number;
  parentVersionHash: string;
  timestamp: string;
  dimensions: { rows: number; cols: number };
  flattenedWeights: number[];
  evolutionMetrics: {
    lastPositiveResonanceArea: number;
    adoptionVelocity: number;
  };
  blockHash: string;
}

export interface L1SpecificationResetBlock {
  blockType: 'L1_SPECIFICATION_MANIFOLD_RESET';
  blockId: string;
  timestamp: string;
  previousEtchHash: string;
  blockHash: string;
  guardianSignature?: string;
  persistenceCounterAtTrigger: number;
  leakyIntegratorValue: number;
  mahalanobisDistance: number;
  proxySnapshotAtDecision: TelemetryProxies;
  driftSentinelEvents: Array<{ timestamp: string; deltaValue: number; severity: string }>;
  guardianGroundingIndexAtTrigger: number;
  negativePheromoneDensity: number;
  guardianArbitration: {
    decision: 'APPROVED' | 'DENIED';
    rationale: string;
    courtTimestamp: string;
    approver: string;
    provenanceHash: string;
  };
  failureProvenanceChain: {
    relevantStigmergyTraceRoots: string[];
    relevantHolographicEtchEntryHashes: string[];
    synthesisProvenanceRoot: string;
    systemicHealthMonitorLogHash: string;
  };
  failingL1Parameters: Record<string, unknown>;
  newL1Parameters: Record<string, unknown>;
  positiveResonanceAreaAtReset: number;
  resetRationale: string;
  stigmergicResetTraceId: string;
}
