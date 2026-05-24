/**
 * Versioned Snapshot Types for Durable Stigmergy & Etch Backends
 *
 * These types enable cross-session persistence of organelle merges
 * with strong integrity guarantees via Merkle root verification.
 */

import type { PheromoneTrace } from './types';
import type { EtchRecord } from './types';
import type { PositiveGrowthEvent } from './positiveResonanceAmplifier';

export const SNAPSHOT_VERSION = 1 as const;

/** Base metadata present in all snapshots */
export interface SnapshotMetadata {
  version: typeof SNAPSHOT_VERSION;
  createdAt: string;           // ISO timestamp
  tenantId?: string;           // future multi-tenancy
  source: 'organelle' | 'normal' | 'mixed';
  note?: string;
}

/** Snapshot of Stigmergy state */
export interface StigmergySnapshot {
  metadata: SnapshotMetadata;
  traces: PheromoneTrace[];
  /** The Merkle root (hash of the last trace) at snapshot time */
  merkleRoot: string;
  /** Total number of traces ever written (for verification) */
  totalTracesWritten: number;
}

/** Snapshot of Holographic Etch state */
export interface EtchSnapshot {
  metadata: SnapshotMetadata;
  etches: EtchRecord[];
  audit?: EtchRecord[];
  growthEvents?: PositiveGrowthEvent[];
  /** Optional aggregate root over accepted etches */
  etchRoot?: string;
}

/** Combined snapshot for a full MCOP durable state */
export interface FullMCOPSnapshot {
  metadata: SnapshotMetadata;
  stigmergy?: StigmergySnapshot;
  etch?: EtchSnapshot;
}

/** Error thrown when Merkle verification fails during restore */
export class MerkleVerificationError extends Error {
  constructor(message: string, public readonly expectedRoot: string, public readonly actualRoot: string) {
    super(message);
    this.name = 'MerkleVerificationError';
  }
}
