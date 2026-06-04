// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Kevin John Kull (Kuonirad) and KullAILABS MCOP Framework contributors
/**
 * @fileoverview HotPathRouter — one provenance-attached accelerator boundary
 * for the five hot-path operations.
 *
 * Before this, each hot-path operation lived in its own module and reached the
 * accelerator (or didn't) on its own terms: NOVA-NEO encoded inline, Stigmergy
 * recalled with its own cosine, the Holographic Etch wrote directly, the tuner
 * dispatched `meta-dry-run`, and the proteome applied homeostasis in-loop. The
 * provenance story was therefore per-module and uneven — exactly the kind of
 * fan-out that makes a conformance spec impossible to write and a second
 * maintainer impossible to onboard.
 *
 * This router unifies them. **Encode, recall, etch, evolve, and homeostasis**
 * all flow through a single {@link HotPathRouter.dispatch} boundary that:
 *
 *   1. routes to the wired {@link Accelerator} (CUDA microservice / ONNX /
 *      native) when one is in CUDA mode, or runs the deterministic CPU
 *      reference kernel otherwise;
 *   2. attaches uniform {@link AcceleratorProvenance} to every result; and
 *   3. appends a Merkle-chained entry to one hot-path provenance log, so the
 *      entire hot path is a single auditable, replayable stream.
 *
 * The chain hash is built from deterministic fields only (op, kernel, device,
 * mode, output) — never the wall-clock timestamp — so `getHotPathRoot()` is
 * reproducible across runs for the same inputs and accelerator.
 */

import { canonicalDigest } from '../core/canonicalEncoding';
import {
  CPUFallback,
  attachAcceleratorProvenance,
  type AcceleratedOperation,
  type AcceleratedResult,
  type Accelerator,
} from './Accelerator';
import {
  cosineRecallKernel,
  encodeKernel,
  evolveScoreKernel,
  holographicUpdateKernel,
  homeostasisKernel,
  type EncodePayload,
  type EncodeResult,
  type EtchPayload,
  type EtchResult,
  type EvolvePayload,
  type EvolveResult,
  type HomeostasisPayload,
  type HomeostasisResult,
  type RecallPayload,
  type RecallResult,
} from './referenceKernels';

/** The five logical hot-path operations. */
export type HotPathOp = 'encode' | 'recall' | 'etch' | 'evolve' | 'homeostasis';

/** Canonical {@link AcceleratedOperation} each hot-path op dispatches as. */
export const HOT_PATH_KERNEL: Readonly<Record<HotPathOp, AcceleratedOperation>> = Object.freeze({
  encode: 'nova-neo-encode',
  recall: 'cosine-recall',
  etch: 'holographic-write',
  evolve: 'nova-evolve-score',
  homeostasis: 'homeostasis',
});

export interface HotPathProvenanceEntry {
  /** Monotonic index within this router's lifetime. */
  index: number;
  op: HotPathOp;
  kernel: AcceleratedOperation;
  device: string;
  mode: 'cpu' | 'cuda';
  fallback: boolean;
  /** Merkle root of the per-call accelerator provenance (includes timestamp). */
  provenanceRoot: string;
  /** Deterministic chain hash over {parent, op, kernel, device, mode, output}. */
  hash: string;
}

export interface HotPathStats {
  calls: number;
  byOp: Record<HotPathOp, number>;
  fallbacks: number;
  /** Root of the deterministic hot-path chain (last entry hash). */
  hotPathRoot: string | undefined;
}

export interface HotPathRouterOptions {
  /** Accelerator to route through. Defaults to a {@link CPUFallback}. */
  accelerator?: Accelerator;
}

export class HotPathRouter {
  private readonly accelerator: Accelerator;
  private readonly log: HotPathProvenanceEntry[] = [];
  private chainHead: string | undefined;
  private readonly counts: Record<HotPathOp, number> = {
    encode: 0,
    recall: 0,
    etch: 0,
    evolve: 0,
    homeostasis: 0,
  };
  private fallbacks = 0;

  constructor(options: HotPathRouterOptions = {}) {
    this.accelerator = options.accelerator ?? new CPUFallback();
  }

  encode(payload: EncodePayload): Promise<AcceleratedResult<EncodeResult>> {
    return this.dispatch('encode', payload, encodeKernel);
  }

  recall(payload: RecallPayload): Promise<AcceleratedResult<RecallResult>> {
    return this.dispatch('recall', payload, cosineRecallKernel);
  }

  etch(payload: EtchPayload): Promise<AcceleratedResult<EtchResult>> {
    return this.dispatch('etch', payload, holographicUpdateKernel);
  }

  evolve(payload: EvolvePayload): Promise<AcceleratedResult<EvolveResult>> {
    return this.dispatch('evolve', payload, evolveScoreKernel);
  }

  homeostasis(payload: HomeostasisPayload): Promise<AcceleratedResult<HomeostasisResult>> {
    return this.dispatch('homeostasis', payload, homeostasisKernel);
  }

  /**
   * The single boundary. Routes to the accelerator when it is in CUDA mode,
   * otherwise runs the deterministic CPU reference kernel; either way attaches
   * uniform provenance and appends a Merkle-chained log entry.
   */
  private async dispatch<P, R extends object>(
    op: HotPathOp,
    payload: P,
    compute: (payload: P) => R,
  ): Promise<AcceleratedResult<R>> {
    const kernel = HOT_PATH_KERNEL[op];

    let result: AcceleratedResult<R>;
    if (this.accelerator.mode === 'cuda') {
      // GPU (or microservice) computes the result and seals its own provenance.
      result = await this.accelerator.accelerate<R>(kernel, payload);
    } else {
      // Deterministic CPU reference path; seal provenance at the boundary.
      const computed = compute(payload);
      result = attachAcceleratorProvenance<R>(computed, {
        op: kernel,
        mode: 'cpu',
        device: this.accelerator.device,
        provider: 'HotPathRouter:cpu-reference',
        fallback: true,
        fallbackReason: 'cpu-reference-kernel',
      });
    }

    const prov = result._provenance;
    const fallback = prov.fallback === true;
    // Deterministic chain over the result body (provenance/_device stripped) so
    // the hot-path root replays identically regardless of wall-clock time.
    const body = stripAcceleratorFields(result);
    const hash = canonicalDigest({
      parent: this.chainHead ?? null,
      op,
      kernel,
      device: prov.device,
      mode: prov.mode,
      output: body,
    });
    this.chainHead = hash;
    this.counts[op] += 1;
    if (fallback && this.accelerator.mode === 'cuda') this.fallbacks += 1;
    this.log.push({
      index: this.log.length,
      op,
      kernel,
      device: prov.device,
      mode: prov.mode,
      fallback,
      provenanceRoot: prov.merkleRoot,
      hash,
    });
    return result;
  }

  /** The full hot-path provenance log, in call order. */
  getProvenanceLog(): HotPathProvenanceEntry[] {
    return this.log.map((entry) => ({ ...entry }));
  }

  /** Root of the deterministic hot-path Merkle chain (last entry hash). */
  getHotPathRoot(): string | undefined {
    return this.chainHead;
  }

  getStats(): HotPathStats {
    return {
      calls: this.log.length,
      byOp: { ...this.counts },
      fallbacks: this.fallbacks,
      hotPathRoot: this.chainHead,
    };
  }
}

function stripAcceleratorFields<R extends object>(result: AcceleratedResult<R>): R {
  const { _device, _provenance, ...rest } = result as Record<string, unknown>;
  void _device;
  void _provenance;
  return rest as R;
}
