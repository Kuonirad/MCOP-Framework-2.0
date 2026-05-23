import * as crypto from 'node:crypto';
import { GuardianKeyVault } from './GuardianKeyVault';
import { JCSUtility } from './JCSUtility';
import { L1SpecificationResetBlock, TelemetryProxies } from './types';

export interface ResetAuditInput {
  previousEtchHash: string;
  persistenceCounterAtTrigger: number;
  leakyIntegratorValue: number;
  mahalanobisDistance: number;
  proxySnapshotAtDecision: TelemetryProxies;
  driftSentinelEvents: Array<{ timestamp: string; deltaValue: number; severity: string }>;
  guardianGroundingIndexAtTrigger: number;
  negativePheromoneDensity: number;
  failingL1Parameters: Record<string, unknown>;
  newL1Parameters: Record<string, unknown>;
  positiveResonanceAreaAtReset: number;
  resetRationale: string;
  stigmergicResetTraceId: string;
}

export class ResetAuditor {
  constructor(private readonly keyVault: GuardianKeyVault) {}

  public createSignedResetBlock(input: ResetAuditInput): L1SpecificationResetBlock {
    const timestamp = new Date().toISOString();
    const failureProvenanceChain = {
      relevantStigmergyTraceRoots: [input.stigmergicResetTraceId],
      relevantHolographicEtchEntryHashes: [input.previousEtchHash],
      synthesisProvenanceRoot: stableHash({
        proxies: input.proxySnapshotAtDecision,
        failingL1Parameters: input.failingL1Parameters,
        newL1Parameters: input.newL1Parameters,
      }),
      systemicHealthMonitorLogHash: stableHash(input.driftSentinelEvents),
    };
    const guardianArbitration = {
      decision: 'APPROVED' as const,
      rationale: input.resetRationale,
      courtTimestamp: timestamp,
      approver: 'GUARDIAN_AUTONOMOUS_HARDENING_BOOTSTRAPPER',
      provenanceHash: stableHash(failureProvenanceChain),
    };
    const unsignedBlock: Omit<L1SpecificationResetBlock, 'blockHash' | 'guardianSignature'> = {
      blockType: 'L1_SPECIFICATION_MANIFOLD_RESET',
      blockId: `l1-reset-${stableHash({ timestamp, trace: input.stigmergicResetTraceId }).slice(0, 16)}`,
      timestamp,
      previousEtchHash: input.previousEtchHash,
      persistenceCounterAtTrigger: input.persistenceCounterAtTrigger,
      leakyIntegratorValue: input.leakyIntegratorValue,
      mahalanobisDistance: input.mahalanobisDistance,
      proxySnapshotAtDecision: input.proxySnapshotAtDecision,
      driftSentinelEvents: input.driftSentinelEvents,
      guardianGroundingIndexAtTrigger: input.guardianGroundingIndexAtTrigger,
      negativePheromoneDensity: input.negativePheromoneDensity,
      guardianArbitration,
      failureProvenanceChain,
      failingL1Parameters: input.failingL1Parameters,
      newL1Parameters: input.newL1Parameters,
      positiveResonanceAreaAtReset: input.positiveResonanceAreaAtReset,
      resetRationale: input.resetRationale,
      stigmergicResetTraceId: input.stigmergicResetTraceId,
    };
    const blockHash = stableHash(unsignedBlock);

    return {
      ...unsignedBlock,
      blockHash,
      guardianSignature: this.keyVault.signHash(blockHash),
    };
  }
}

function stableHash(payload: unknown): string {
  return crypto.createHash('sha256').update(JCSUtility.canonicalize(payload)).digest('hex');
}
