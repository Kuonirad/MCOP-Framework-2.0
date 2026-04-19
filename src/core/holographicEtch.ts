import crypto from 'crypto';
import { ContextTensor, EtchRecord } from './types';

export interface HolographicEtchConfig {
  confidenceFloor?: number;
  auditLog?: boolean;
}

export class HolographicEtch {
  private readonly confidenceFloor: number;
  private readonly auditLog: boolean;
  private etches: EtchRecord[] = [];

  constructor(config: HolographicEtchConfig = {}) {
    this.confidenceFloor = config.confidenceFloor ?? 0.8;
    this.auditLog = config.auditLog ?? true;
  }

  applyEtch(context: ContextTensor, synthesisVector: number[], note?: string): EtchRecord {
    const minLen = Math.min(context.length, synthesisVector.length);
    let deltaWeight = 0;
    for (let i = 0; i < minLen; i++) {
      deltaWeight += context[i] * synthesisVector[i];
    }

    const normalizedDelta = deltaWeight / (minLen || 1);
    if (normalizedDelta < this.confidenceFloor && !this.auditLog) {
      return {
        hash: '',
        deltaWeight: 0,
        note: 'skipped-low-confidence',
        timestamp: new Date().toISOString(),
      };
    }

    const payload = { context, synthesisVector, normalizedDelta, note };
    const hash = crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
    const record: EtchRecord = {
      hash,
      deltaWeight: normalizedDelta,
      note,
      timestamp: new Date().toISOString(),
    };

    this.etches.push(record);
    return record;
  }

  recent(limit = 5): EtchRecord[] {
    return this.etches.slice(-limit).reverse();
  }
}
