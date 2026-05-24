/**
 * StigmergyStorageBackend — pluggable persistence for StigmergyV5.
 *
 * This enables durable (cross-session) pheromone memory for organelle merges
 * and normal MCOP operation.
 *
 * Design goals:
 * - Append-only friendly (good for Merkle chains)
 * - Support for bounded + unbounded retention
 * - Easy to implement over files, SQLite, Redis, Postgres, etc.
 */

import type { PheromoneTrace } from './types';
import type { StigmergySnapshot, SnapshotMetadata } from './snapshotTypes';
import { canonicalDigest } from './canonicalEncoding';

export interface StigmergyStorageBackend {
  /**
   * Append a new trace. Implementations should be durable.
   */
  appendTrace(trace: PheromoneTrace): Promise<void> | void;

  /**
   * Load the most recent traces (newest first), up to `limit`.
   */
  loadRecentTraces(limit: number): Promise<PheromoneTrace[]> | PheromoneTrace[];

  /**
   * Return the current Merkle root (hash of the last trace in the chain).
   */
  getCurrentMerkleRoot?(): Promise<string | undefined> | string | undefined;

  /**
   * Create a versioned snapshot of the current state.
   * Should include enough data to fully restore the trace forest.
   */
  createSnapshot?(options?: { note?: string; source?: 'organelle' | 'normal' | 'mixed' }): Promise<StigmergySnapshot> | StigmergySnapshot;

  /**
   * Restore from a versioned snapshot.
   * Implementations MUST verify the Merkle root before accepting the data.
   * Should throw `MerkleVerificationError` on mismatch.
   */
  restoreFromSnapshot?(snapshot: StigmergySnapshot): Promise<void> | void;

  /**
   * Optional: clear all data (mainly for tests).
   */
  clear?(): Promise<void> | void;
}

/**
 * Simple in-memory backend (the historical default behavior).
 */
export class InMemoryStigmergyBackend implements StigmergyStorageBackend {
  private traces: PheromoneTrace[] = [];

  appendTrace(trace: PheromoneTrace): void {
    this.traces.push(trace);
  }

  loadRecentTraces(limit: number): PheromoneTrace[] {
    return this.traces.slice(-limit).reverse();
  }

  getCurrentMerkleRoot(): string | undefined {
    return this.traces.length > 0 ? this.traces[this.traces.length - 1].hash : undefined;
  }

  clear(): void {
    this.traces = [];
  }
}

/**
 * File-based durable backend using JSONL (one trace per line).
 * Simple, human-readable, and works well for single-process or shared-disk scenarios.
 *
 * Not suitable for high-concurrency without additional locking.
 */
export class FileStigmergyBackend implements StigmergyStorageBackend {
  private readonly filePath: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly fs: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly path: any;

  constructor(filePath: string) {
    // Dynamic require keeps these Node-only modules out of the browser/Edge bundle.
    const dynamicRequire: NodeRequire = eval('require');
    this.fs = dynamicRequire('fs');
    this.path = dynamicRequire('path');

    this.filePath = filePath;
    // mkdirSync with recursive: true is idempotent and does not throw if dir exists
    const dir = this.path.dirname(filePath);
    this.fs.mkdirSync(dir, { recursive: true });
  }

  appendTrace(trace: PheromoneTrace): void {
    const line = JSON.stringify(trace) + '\n';
    this.fs.appendFileSync(this.filePath, line, 'utf8');
  }

  loadRecentTraces(limit: number): PheromoneTrace[] {
    let content: string;
    try {
      content = this.fs.readFileSync(this.filePath, 'utf8');
    } catch (err: unknown) {
      const code = (err as NodeJS.ErrnoException)?.code;
      if (code === 'ENOENT') return [];
      throw err;
    }
    const lines = content.trim().split('\n').filter(Boolean);
    const all = lines.map((l: string) => JSON.parse(l) as PheromoneTrace);
    return all.slice(-limit).reverse();
  }

  getCurrentMerkleRoot(): string | undefined {
    const recent = this.loadRecentTraces(1);
    return recent.length > 0 ? recent[0].hash : undefined;
  }

  createSnapshot(options: { note?: string; source?: 'organelle' | 'normal' | 'mixed' } = {}): StigmergySnapshot {
    const allTraces = this.loadRecentTraces(Number.MAX_SAFE_INTEGER);
    const merkleRoot = allTraces.length > 0 ? allTraces[allTraces.length - 1].hash : '';

    const metadata: SnapshotMetadata = {
      version: 1,
      createdAt: new Date().toISOString(),
      source: options.source ?? 'mixed',
      note: options.note,
    };

    return {
      metadata,
      traces: allTraces,
      merkleRoot,
      totalTracesWritten: allTraces.length,
    };
  }

  restoreFromSnapshot(snapshot: StigmergySnapshot): void {
    if (snapshot.metadata.version !== 1) {
      throw new Error(`Unsupported snapshot version: ${snapshot.metadata.version}`);
    }

    // Verify Merkle root integrity
    let computedRoot = '';
    for (const trace of snapshot.traces) {
      // Recompute the chain to verify
      const payload = {
        id: trace.id,
        context: trace.context,
        synthesisVector: trace.synthesisVector,
        metadata: trace.metadata,
        weight: trace.weight,
      };
      const expectedHash = canonicalDigest({ payload, parentHash: computedRoot || null });
      if (trace.hash !== expectedHash) {
        throw new Error(`Merkle verification failed at trace ${trace.id}`);
      }
      computedRoot = trace.hash;
    }

    if (computedRoot !== snapshot.merkleRoot) {
      throw new Error(`Merkle root mismatch on restore. Expected ${snapshot.merkleRoot}, got ${computedRoot}`);
    }

    // Clear and restore
    this.clear();
    for (const trace of snapshot.traces) {
      this.appendTrace(trace);
    }
  }

  clear(): void {
    try {
      this.fs.writeFileSync(this.filePath, '', 'utf8');
    } catch (err: unknown) {
      const code = (err as NodeJS.ErrnoException)?.code;
      if (code !== 'ENOENT') throw err;
    }
  }
}
