import { createHash } from 'node:crypto';
import { ContextTensor } from './types';
import { canonicalDigest } from './canonicalEncoding';
import { NovaNeoEncoder } from './novaNeoEncoder';
import { StigmergyV5 } from './stigmergyV5';
import { HolographicEtch } from './holographicEtch';

/**
 * Full Synthesis Provenance Tracer — composes the MCOP triad and emits a
 * Merkle-chained audit trail for every synthesis. Each event hash covers the
 * previous root, so any tampering invalidates every subsequent entry.
 */
export interface ProvenanceEvent {
  stage: 'encode' | 'trace' | 'etch' | 'synthesize';
  timestamp: string;
  hash: string;
  parentHash?: string;
  details: Record<string, unknown>;
}

export interface SynthesisResult {
  input: string;
  tensor: ContextTensor;
  entropy: number;
  resonance: { score: number; traceId?: string };
  etchHash: string;
  etchDelta: number;
  events: ProvenanceEvent[];
  root: string;
}

export class SynthesisProvenanceTracer {
  private events: ProvenanceEvent[] = [];

  constructor(
    private readonly encoder: NovaNeoEncoder,
    private readonly stigmergy: StigmergyV5,
    private readonly etch: HolographicEtch,
  ) {}

  /** Run the triad on `input` and return a provenance-tracked synthesis. */
  synthesize(input: string, metadata?: Record<string, unknown>): SynthesisResult {
    const tensor = this.encoder.encode(input);
    const entropy = this.encoder.estimateEntropy(tensor);
    const encodeEvt = this.append('encode', {
      inputHash: sha256(input).slice(0, 16),
      dimensions: tensor.length,
      entropy,
    });

    const trace = this.stigmergy.recordTrace(tensor, tensor, metadata);
    const resonance = this.stigmergy.getResonance(tensor);
    const traceEvt = this.append('trace', {
      traceId: trace.id,
      resonance: resonance.score,
      merkleRoot: this.stigmergy.getMerkleRoot(),
    });

    const etchRecord = this.etch.applyEtch(tensor, tensor, metadata?.note as string | undefined);
    const etchEvt = this.append('etch', {
      etchHash: etchRecord.hash,
      deltaWeight: etchRecord.deltaWeight,
      note: etchRecord.note,
    });

    const synthEvt = this.append('synthesize', {
      encodeHash: encodeEvt.hash,
      traceHash: traceEvt.hash,
      etchHash: etchEvt.hash,
    });

    return {
      input,
      tensor,
      entropy,
      resonance: { score: resonance.score, traceId: resonance.trace?.id },
      etchHash: etchRecord.hash,
      etchDelta: etchRecord.deltaWeight,
      events: [encodeEvt, traceEvt, etchEvt, synthEvt],
      root: synthEvt.hash,
    };
  }

  /** Merkle root of all events seen so far, or `undefined` when empty. */
  getRoot(): string | undefined {
    return this.events.at(-1)?.hash;
  }

  /** Verify that every stored event links to its recorded parent. */
  verify(): { ok: true } | { ok: false; brokenAt: number } {
    for (let i = 0; i < this.events.length; i++) {
      const ev = this.events[i];
      const expectedParent = i === 0 ? undefined : this.events[i - 1].hash;
      if (ev.parentHash !== expectedParent) return { ok: false, brokenAt: i };
      const recomputed = merkleHash(
        { stage: ev.stage, timestamp: ev.timestamp, details: ev.details },
        ev.parentHash,
      );
      if (recomputed !== ev.hash) return { ok: false, brokenAt: i };
    }
    return { ok: true };
  }

  /** Snapshot of the event log for external inspection (e.g. dashboards). */
  getEvents(): ProvenanceEvent[] {
    return this.events.slice();
  }

  private append(stage: ProvenanceEvent['stage'], details: Record<string, unknown>): ProvenanceEvent {
    const parentHash = this.events.at(-1)?.hash;
    const timestamp = new Date().toISOString();
    const hash = merkleHash({ stage, timestamp, details }, parentHash);
    const event: ProvenanceEvent = { stage, timestamp, hash, parentHash, details };
    this.events.push(event);
    return event;
  }
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function merkleHash(payload: unknown, parentHash?: string): string {
  // RFC 8785 canonical JSON: see `canonicalEncoding.ts` for rationale.
  return canonicalDigest({ payload, parentHash: parentHash ?? null });
}
