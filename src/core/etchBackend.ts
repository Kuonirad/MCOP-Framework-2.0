/**
 * EtchStorageBackend — pluggable persistence for HolographicEtch.
 *
 * Allows durable storage of EtchRecords (and optionally the growth ledger)
 * so that organelle merges and normal confidence etches survive restarts.
 */

import type { EtchRecord } from './types';
import type { PositiveGrowthEvent } from './positiveResonanceAmplifier';
import type { EtchSnapshot, MerkleVerificationError, SnapshotMetadata } from './snapshotTypes';
import { canonicalDigest } from './canonicalEncoding';

export interface EtchStorageBackend {
  appendEtch(record: EtchRecord): Promise<void> | void;
  appendAudit?(record: EtchRecord): Promise<void> | void;

  loadRecentEtches(limit: number): Promise<EtchRecord[]> | EtchRecord[];
  loadAudit?(limit: number): Promise<EtchRecord[]> | EtchRecord[];

  appendGrowthEvent?(event: PositiveGrowthEvent): Promise<void> | void;
  loadGrowthEvents?(limit: number): Promise<PositiveGrowthEvent[]> | PositiveGrowthEvent[];

  /**
   * Create a versioned snapshot of the etch state (including growth ledger if present).
   */
  createSnapshot?(options?: { note?: string; source?: 'organelle' | 'normal' | 'mixed' }): Promise<EtchSnapshot> | EtchSnapshot;

  /**
   * Restore from a versioned EtchSnapshot.
   * Implementations should perform integrity checks (hash chain / root verification).
   */
  restoreFromSnapshot?(snapshot: EtchSnapshot): Promise<void> | void;

  clear?(): Promise<void> | void;
}

export class InMemoryEtchBackend implements EtchStorageBackend {
  private etches: EtchRecord[] = [];
  private audit: EtchRecord[] = [];
  private growth: PositiveGrowthEvent[] = [];

  appendEtch(record: EtchRecord): void {
    this.etches.push(record);
  }

  appendAudit(record: EtchRecord): void {
    this.audit.push(record);
  }

  loadRecentEtches(limit: number): EtchRecord[] {
    return this.etches.slice(-limit).reverse();
  }

  loadAudit(limit: number): EtchRecord[] {
    return this.audit.slice(-limit).reverse();
  }

  appendGrowthEvent(event: PositiveGrowthEvent): void {
    this.growth.push(event);
  }

  loadGrowthEvents(limit: number): PositiveGrowthEvent[] {
    return this.growth.slice(-limit).reverse();
  }

  clear(): void {
    this.etches = [];
    this.audit = [];
    this.growth = [];
  }
}

/**
 * Simple file-based durable backend using JSONL.
 */
export class FileEtchBackend implements EtchStorageBackend {
  private readonly etchPath: string;
  private readonly auditPath?: string;
  private readonly growthPath?: string;
  private readonly fs = require('fs');
  private readonly path = require('path');

  constructor(basePath: string, options: { audit?: boolean; growthLedger?: boolean } = {}) {
    this.etchPath = basePath.endsWith('.jsonl') ? basePath : basePath + '.etches.jsonl';
    if (options.audit) {
      this.auditPath = basePath.replace(/\.jsonl$/, '') + '.audit.jsonl';
    }
    if (options.growthLedger) {
      this.growthPath = basePath.replace(/\.jsonl$/, '') + '.growth.jsonl';
    }

    const dir = this.path.dirname(this.etchPath);
    if (!this.fs.existsSync(dir)) {
      this.fs.mkdirSync(dir, { recursive: true });
    }
  }

  appendEtch(record: EtchRecord): void {
    this.fs.appendFileSync(this.etchPath, JSON.stringify(record) + '\n', 'utf8');
  }

  appendAudit(record: EtchRecord): void {
    if (this.auditPath) {
      this.fs.appendFileSync(this.auditPath, JSON.stringify(record) + '\n', 'utf8');
    }
  }

  loadRecentEtches(limit: number): EtchRecord[] {
    if (!this.fs.existsSync(this.etchPath)) return [];
    const lines = this.fs.readFileSync(this.etchPath, 'utf8').trim().split('\n').filter(Boolean);
    const all = lines.map((l: string) => JSON.parse(l));
    return all.slice(-limit).reverse();
  }

  loadAudit(limit: number): EtchRecord[] {
    if (!this.auditPath || !this.fs.existsSync(this.auditPath)) return [];
    const lines = this.fs.readFileSync(this.auditPath, 'utf8').trim().split('\n').filter(Boolean);
    const all = lines.map((l: string) => JSON.parse(l));
    return all.slice(-limit).reverse();
  }

  appendGrowthEvent(event: PositiveGrowthEvent): void {
    if (this.growthPath) {
      this.fs.appendFileSync(this.growthPath, JSON.stringify(event) + '\n', 'utf8');
    }
  }

  loadGrowthEvents(limit: number): PositiveGrowthEvent[] {
    if (!this.growthPath || !this.fs.existsSync(this.growthPath)) return [];
    const lines = this.fs.readFileSync(this.growthPath, 'utf8').trim().split('\n').filter(Boolean);
    return lines.map((l: string) => JSON.parse(l)).slice(-limit).reverse();
  }

  createSnapshot(options: { note?: string; source?: 'organelle' | 'normal' | 'mixed' } = {}): EtchSnapshot {
    const etches = this.loadRecentEtches(Number.MAX_SAFE_INTEGER);
    const audit = this.auditPath ? this.loadAudit(Number.MAX_SAFE_INTEGER) : undefined;
    const growth = this.growthPath ? this.loadGrowthEvents(Number.MAX_SAFE_INTEGER) : undefined;

    const metadata: SnapshotMetadata = {
      version: 1,
      createdAt: new Date().toISOString(),
      source: options.source ?? 'mixed',
      note: options.note,
    };

    return {
      metadata,
      etches,
      audit,
      growthEvents: growth,
    };
  }

  restoreFromSnapshot(snapshot: EtchSnapshot): void {
    if (snapshot.metadata.version !== 1) {
      throw new Error(`Unsupported etch snapshot version: ${snapshot.metadata.version}`);
    }

    // Basic integrity check on accepted etches
    for (const record of snapshot.etches) {
      if (record.hash) {
        // We don't have the original context here, so we do a lighter check.
        // Full verification would require storing the payload used for hashing.
        if (!record.hash || record.hash.length < 10) {
          throw new Error(`Invalid etch hash detected during restore: ${record.hash}`);
        }
      }
    }

    this.clear();

    for (const r of snapshot.etches) this.appendEtch(r);
    if (snapshot.audit) {
      for (const r of snapshot.audit) this.appendAudit?.(r);
    }
    if (snapshot.growthEvents) {
      for (const e of snapshot.growthEvents) this.appendGrowthEvent?.(e);
    }
  }

  clear(): void {
    [this.etchPath, this.auditPath, this.growthPath].forEach(p => {
      if (p && this.fs.existsSync(p)) this.fs.writeFileSync(p, '', 'utf8');
    });
  }
}
