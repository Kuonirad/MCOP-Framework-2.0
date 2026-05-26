/**
 * Append-only provenance sink for accelerated runs.
 *
 * The in-process {@link CUDAHardwareLayer} emits one {@link ProvenanceLogEntry}
 * per accelerated dispatch when a sink is configured — pairing the
 * {@link AcceleratorProvenance} (the *work* digest) with the optional
 * {@link PoUWReceipt} (the *model authenticity* proof). This is the
 * non-bypassable etch hook from the unified-boundary design, kept
 * deliberately small: it is a transport, not a re-implementation of the
 * accelerator. Adapters (ledger, holographic etch, OTLP, …) implement the
 * single `append` method.
 *
 * This module imports only *types* from the accelerator + provenance
 * layers, so it adds no runtime (`node:fs`) weight to any bundle.
 */

import type { AcceleratorProvenance } from './Accelerator';
import type { PoUWReceipt } from '../provenance/pouwReceipt';

export interface ProvenanceLogEntry {
  /** Discriminator for multiplexed sinks, e.g. `'accelerator-primitive'`. */
  readonly type: string;
  /** Canonical (kebab-case) accelerated operation, e.g. `'nova-neo-encode'`. */
  readonly op: string;
  readonly device: string;
  readonly provenance: AcceleratorProvenance;
  /** Present only when the run executed an attested manifest model. */
  readonly pouwReceipt?: PoUWReceipt;
  readonly timestamp: string;
}

export interface EtchProvenanceSink {
  append(entry: ProvenanceLogEntry): void | Promise<void>;
}

/** Default sink: discards entries. Lets callers opt in without null checks. */
export class NullProvenanceSink implements EtchProvenanceSink {
  append(_entry: ProvenanceLogEntry): void {
    /* intentionally empty */
  }
}

/**
 * Bounded in-memory ring of provenance entries — an introspectable audit
 * tail for tests, dev tooling, and short-lived processes. Oldest entries
 * are evicted past `capacity`.
 */
export class InMemoryProvenanceSink implements EtchProvenanceSink {
  private readonly buffer: ProvenanceLogEntry[] = [];

  constructor(private readonly capacity = 4096) {
    if (!Number.isInteger(capacity) || capacity < 1) {
      throw new RangeError('InMemoryProvenanceSink capacity must be a positive integer');
    }
  }

  append(entry: ProvenanceLogEntry): void {
    this.buffer.push(entry);
    if (this.buffer.length > this.capacity) this.buffer.shift();
  }

  get entries(): ReadonlyArray<ProvenanceLogEntry> {
    return [...this.buffer];
  }

  get size(): number {
    return this.buffer.length;
  }

  clear(): void {
    this.buffer.length = 0;
  }
}
