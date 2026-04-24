/**
 * BaseAdapter — abstract scaffolding that wires the MCOP triad
 * (NOVA-NEO Encoder, Stigmergy v5, Holographic Etch) plus the dialectical
 * synthesizer into a uniform pipeline. Concrete adapters subclass this and
 * implement `callPlatform` to dispatch the refined prompt to a vendor SDK.
 *
 * The pipeline is deterministic and side-effect-free outside of the
 * `callPlatform` hook, which makes it trivial to unit-test adapters
 * without mocking the entire MCOP stack.
 */

import crypto from 'crypto';

import { HolographicEtch } from '../core/holographicEtch';
import { NovaNeoEncoder } from '../core/novaNeoEncoder';
import { StigmergyV5 } from '../core/stigmergyV5';
import type {
  ContextTensor,
  PheromoneTrace,
  ResonanceResult,
} from '../core/types';
import { DialecticalSynthesizer } from './dialecticalSynthesizer';
import {
  AdapterCapabilities,
  AdapterRequest,
  AdapterResponse,
  IDialecticalSynthesizer,
  IMCOPAdapter,
  ProvenanceMetadata,
} from './types';

export interface BaseAdapterDeps {
  encoder: NovaNeoEncoder;
  stigmergy: StigmergyV5;
  etch: HolographicEtch;
  dialectical?: IDialecticalSynthesizer;
}

export interface PreparedDispatch {
  refinedPrompt: string;
  tensor: ContextTensor;
  resonance: ResonanceResult;
  trace: PheromoneTrace;
  etchHash: string;
  etchDelta: number;
  provenance: ProvenanceMetadata;
}

export abstract class BaseAdapter<
  TRequest extends AdapterRequest = AdapterRequest,
  TResult = unknown,
> implements IMCOPAdapter<TRequest, TResult>
{
  protected readonly encoder: NovaNeoEncoder;
  protected readonly stigmergy: StigmergyV5;
  protected readonly etch: HolographicEtch;
  protected readonly dialectical: IDialecticalSynthesizer;

  constructor(deps: BaseAdapterDeps) {
    this.encoder = deps.encoder;
    this.stigmergy = deps.stigmergy;
    this.etch = deps.etch;
    this.dialectical = deps.dialectical ?? new DialecticalSynthesizer();
  }

  /** Concrete adapters return their platform metadata. */
  abstract getCapabilities(): Promise<AdapterCapabilities>;

  /**
   * Concrete adapters dispatch the refined prompt to the vendor SDK and
   * return the platform-native payload. The framework wraps this call in
   * provenance + etch handling.
   */
  protected abstract callPlatform(
    dispatch: PreparedDispatch,
    request: TRequest,
  ): Promise<TResult>;

  /**
   * Default platform identifier exposed in provenance metadata. Override
   * when the platform name differs from the class name.
   */
  protected platformName(): string {
    return this.constructor.name;
  }

  async generate(input: TRequest): Promise<AdapterResponse<TResult>> {
    const dispatch = this.prepare(input);
    const result = await this.callPlatform(dispatch, input);
    return {
      result,
      merkleRoot: dispatch.etchHash,
      provenance: dispatch.provenance,
    };
  }

  /**
   * Run the deterministic MCOP pipeline (encode → resonance → dialectical
   * synthesis → etch) without dispatching to any platform. Useful for
   * dry-runs, capability negotiation, and unit tests.
   */
  prepare(input: TRequest): PreparedDispatch {
    if (typeof input.prompt !== 'string' || input.prompt.length === 0) {
      throw new Error(`${this.platformName()}: prompt must be a non-empty string`);
    }

    const tensor = this.encoder.encode(input.prompt);
    const tensorHash = hashTensor(tensor);

    const styleAnchor = input.styleContext ?? tensor;

    // Step 1: query resonance against PRIOR traces. Recording happens
    // after the dispatch so the current call never self-resonates.
    const resonance = this.stigmergy.getResonance(tensor);

    // Step 2: dialectical refinement (human-in-the-loop).
    const refinedPrompt = this.dialectical.synthesize(
      input.prompt,
      resonance,
      input.humanFeedback,
    );

    // Step 3: etch the rank-1 confidence delta — provenance for replay.
    const etchNote = `${this.platformName()}:${input.domain ?? 'generic'}`;
    const etchRecord = this.etch.applyEtch(tensor, styleAnchor, etchNote);

    // Step 4: record the trace so future calls can resonate against it.
    const traceMetadata = {
      ...(input.metadata ?? {}),
      platform: this.platformName(),
      domain: input.domain ?? 'generic',
      ...(input.entropyTarget !== undefined
        ? { entropyTarget: input.entropyTarget }
        : {}),
    };
    const trace = this.stigmergy.recordTrace(
      tensor,
      styleAnchor,
      traceMetadata,
    );

    const provenance: ProvenanceMetadata = {
      tensorHash,
      traceId: trace.id,
      traceHash: trace.hash,
      resonanceScore: resonance.score,
      etchHash: etchRecord.hash,
      etchDelta: etchRecord.deltaWeight,
      refinedPrompt,
      timestamp: new Date().toISOString(),
    };

    return {
      refinedPrompt,
      tensor,
      resonance,
      trace,
      etchHash: etchRecord.hash,
      etchDelta: etchRecord.deltaWeight,
      provenance,
    };
  }
}

function hashTensor(tensor: ContextTensor): string {
  const buf = Buffer.from(new Float64Array(tensor).buffer);
  return crypto.createHash('sha256').update(buf).digest('hex');
}
