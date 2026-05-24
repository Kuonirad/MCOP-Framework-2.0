/**
 * Tests for organelle merge utilities.
 * Covers validation, hint reconstruction, trace conversion, and merge orchestration.
 */
import {
  ORGANELLE_PROTOCOL_VERSION,
  validateOrganelleArtifacts,
  reconstructContextFromHint,
  createOrganelleReconstructionContext,
  modelTraceToPheromoneTrace,
  mergeOrganelleTraces,
  mergeOrganelleEtch,
  mergeOrganelleResponse,
  type OrganelleArtifacts,
  type OrganelleMergeOptions,
} from '../utils/organelleMerge';
import { NovaNeoEncoder } from '../core/novaNeoEncoder';
import { StigmergyV5 } from '../core/stigmergyV5';
import { HolographicEtch } from '../core/holographicEtch';

function makeArtifacts(overrides: Partial<OrganelleArtifacts> = {}): OrganelleArtifacts {
  return {
    synthesizedInsight: 'A synthesis insight from the remote organelle.',
    internalTraces: [
      { id: 't1', resonance: 0.9, summary: 'first trace' },
      { id: 't2', resonance: 0.6, summary: 'second trace' },
    ],
    proposedEtchDelta: 0.12,
    resonanceScores: { overall: 0.8 },
    organelleNotes: 'note',
    organelleProtocolVersion: ORGANELLE_PROTOCOL_VERSION,
    modelInternalMerkleRoot: 'remote-root-1',
    ...overrides,
  };
}

function makeOptions(overrides: Partial<OrganelleMergeOptions> = {}): OrganelleMergeOptions {
  return {
    remoteModel: 'grok-4.3',
    sourceCallId: 'call-1',
    duplicateStrategy: 'always-add',
    minResonanceToMerge: 0.5,
    ...overrides,
  };
}

describe('validateOrganelleArtifacts', () => {
  it('returns null for non-objects', () => {
    expect(validateOrganelleArtifacts(null)).toBeNull();
    expect(validateOrganelleArtifacts(undefined)).toBeNull();
    expect(validateOrganelleArtifacts('a string')).toBeNull();
    expect(validateOrganelleArtifacts(42)).toBeNull();
  });

  it('returns null when required fields are missing or wrong type', () => {
    expect(validateOrganelleArtifacts({})).toBeNull();
    expect(validateOrganelleArtifacts({
      synthesizedInsight: 1,
      internalTraces: [],
      proposedEtchDelta: 0,
      organelleNotes: '',
    })).toBeNull();
    expect(validateOrganelleArtifacts({
      synthesizedInsight: '',
      internalTraces: 'not-array',
      proposedEtchDelta: 0,
      organelleNotes: '',
    })).toBeNull();
    expect(validateOrganelleArtifacts({
      synthesizedInsight: '',
      internalTraces: [],
      proposedEtchDelta: 'not-number',
      organelleNotes: '',
    })).toBeNull();
  });

  it('parses a valid artifact object', () => {
    const result = validateOrganelleArtifacts({
      synthesizedInsight: 's',
      internalTraces: [{ id: 'a', resonance: 0.5, summary: 'sum' }],
      proposedEtchDelta: 0.1,
      resonanceScores: { x: 1 },
      organelleNotes: 'note',
      organelleProtocolVersion: 'v1',
      modelInternalMerkleRoot: 'root',
    });
    expect(result).toEqual({
      synthesizedInsight: 's',
      internalTraces: [
        { id: 'a', resonance: 0.5, summary: 'sum', contextTensorHint: undefined },
      ],
      proposedEtchDelta: 0.1,
      resonanceScores: { x: 1 },
      organelleNotes: 'note',
      organelleProtocolVersion: 'v1',
      modelInternalMerkleRoot: 'root',
    });
  });

  it('filters invalid traces and defaults missing optional fields', () => {
    const result = validateOrganelleArtifacts({
      synthesizedInsight: 's',
      internalTraces: [
        { id: 'a', resonance: 0.5 },
        { id: 1, resonance: 0.5 },
        { id: 'c', resonance: 'bad' },
        null,
        { id: 'd', resonance: 0.8, contextTensorHint: '[1,2,3]' },
      ],
      proposedEtchDelta: 0.1,
      organelleNotes: 'note',
    });
    expect(result?.internalTraces).toEqual([
      { id: 'a', resonance: 0.5, summary: '', contextTensorHint: undefined },
      { id: 'd', resonance: 0.8, summary: '', contextTensorHint: '[1,2,3]' },
    ]);
    expect(result?.resonanceScores).toEqual({});
    expect(result?.organelleProtocolVersion).toBe('unknown');
    expect(result?.modelInternalMerkleRoot).toBeUndefined();
  });
});

describe('reconstructContextFromHint', () => {
  const encoder = new NovaNeoEncoder({ dimensions: 8, normalize: false });

  it('falls back to encoding the text when hint is empty/undefined', () => {
    const fallback = encoder.encode('hello');
    expect(reconstructContextFromHint(undefined, encoder, 'hello')).toEqual(fallback);
    expect(reconstructContextFromHint('', encoder, 'hello')).toEqual(fallback);
    expect(reconstructContextFromHint('   ', encoder, 'hello')).toEqual(fallback);
  });

  it('parses a JSON array hint', () => {
    const tensor = reconstructContextFromHint('[0.1,0.2,0.3]', encoder, 'hello');
    expect(tensor.length).toBe(8);
    expect(tensor[0]).toBeCloseTo(0.1);
    expect(tensor[1]).toBeCloseTo(0.2);
    expect(tensor[2]).toBeCloseTo(0.3);
    expect(tensor[3]).toBe(0);
  });

  it('truncates long JSON arrays to the encoder dimension', () => {
    const longArray = Array.from({ length: 32 }, (_, i) => i / 32);
    const tensor = reconstructContextFromHint(JSON.stringify(longArray), encoder, 'fb');
    expect(tensor.length).toBe(8);
    expect(tensor[7]).toBeCloseTo(7 / 32);
  });

  it('parses a comma-separated list', () => {
    const tensor = reconstructContextFromHint('0.1, 0.2, 0.3', encoder, 'hello');
    expect(tensor.length).toBe(8);
    expect(tensor[0]).toBeCloseTo(0.1);
    expect(tensor[2]).toBeCloseTo(0.3);
  });

  it('falls back when hint is invalid JSON and not parseable as CSV', () => {
    const tensor = reconstructContextFromHint('{not-valid}', encoder, 'fallback-text');
    expect(tensor).toEqual(encoder.encode('fallback-text'));
  });

  it('parses base64 Float32Array hint', () => {
    const data = new Float32Array([0.1, 0.2, 0.3, 0.4]);
    const buffer = Buffer.from(data.buffer);
    const b64 = buffer.toString('base64');
    const tensor = reconstructContextFromHint(`f32:${b64}`, encoder, 'fb');
    expect(tensor.length).toBe(8);
    expect(tensor[0]).toBeCloseTo(0.1, 4);
    expect(tensor[3]).toBeCloseTo(0.4, 4);
  });
});

describe('createOrganelleReconstructionContext', () => {
  it('returns a working reconstruction context', () => {
    const encoder = new NovaNeoEncoder({ dimensions: 4, normalize: true });
    const ctx = createOrganelleReconstructionContext(encoder);
    expect(ctx.dimensions).toBe(4);
    expect(ctx.normalize).toBe(true);
    expect(ctx.backend).toBe('hash');
    const tensor = ctx.reconstruct('[1,0,0,0]', 'fallback');
    expect(tensor.length).toBe(4);
    expect(tensor[0]).toBe(1);
  });
});

describe('modelTraceToPheromoneTrace', () => {
  it('produces a PheromoneTrace with organelle metadata', () => {
    const encoder = new NovaNeoEncoder({ dimensions: 8, normalize: false });
    const trace = modelTraceToPheromoneTrace(
      { id: 'remote-1', resonance: 0.7, summary: 'summary text' },
      { remoteModel: 'grok-4.3', sourceCallId: 'call', hostEncoder: encoder }
    );
    expect(trace.id).toBe('org-grok-4.3-remote-1');
    expect(trace.context.length).toBe(8);
    expect(trace.weight).toBeCloseTo(0.7);
    expect(trace.metadata?.source).toBe('grok-organelle');
    expect(trace.metadata?.remoteModel).toBe('grok-4.3');
    expect(trace.metadata?.encoderDimensions).toBe(8);
  });
});

describe('mergeOrganelleTraces', () => {
  it('merges all traces above the minResonanceToMerge threshold', () => {
    const encoder = new NovaNeoEncoder({ dimensions: 8, normalize: true });
    const stigmergy = new StigmergyV5({ maxTraces: 64, resonanceThreshold: 0.3 });
    const artifacts = makeArtifacts();
    const out = mergeOrganelleTraces(stigmergy, artifacts, makeOptions({
      hostEncoder: encoder,
      minResonanceToMerge: 0.5,
    }));
    expect(out.length).toBe(2);
    expect(out[0].metadata?.source).toBe('grok-organelle');
  });

  it('skips traces below the minimum resonance', () => {
    const encoder = new NovaNeoEncoder({ dimensions: 8, normalize: true });
    const stigmergy = new StigmergyV5({ maxTraces: 64, resonanceThreshold: 0.3 });
    const artifacts = makeArtifacts({
      internalTraces: [{ id: 'low', resonance: 0.05, summary: 'too low' }],
    });
    const out = mergeOrganelleTraces(stigmergy, artifacts, makeOptions({
      hostEncoder: encoder,
      minResonanceToMerge: 0.5,
    }));
    expect(out).toHaveLength(0);
  });
});

describe('mergeOrganelleEtch', () => {
  it('emits an etch record with organelle metadata', () => {
    const etch = new HolographicEtch({ confidenceFloor: 0 });
    const record = mergeOrganelleEtch(etch, makeArtifacts(), makeOptions());
    expect(record).toBeDefined();
    const meta = (record as unknown as { metadata?: Record<string, unknown> }).metadata;
    expect(meta?.source).toBe('grok-organelle');
    expect(meta?.remoteModel).toBe('grok-4.3');
  });
});

describe('mergeOrganelleResponse', () => {
  it('returns traces, etch, and provenance link', () => {
    const encoder = new NovaNeoEncoder({ dimensions: 8, normalize: true });
    const stigmergy = new StigmergyV5({ maxTraces: 64, resonanceThreshold: 0.3 });
    const etch = new HolographicEtch({ confidenceFloor: 0 });
    const artifacts = makeArtifacts();
    const result = mergeOrganelleResponse(stigmergy, etch, artifacts, makeOptions({
      hostEncoder: encoder,
      minResonanceToMerge: 0.5,
    }));
    expect(result.newTraces.length).toBeGreaterThan(0);
    expect(result.etchRecord).toBeDefined();
    expect(result.provenanceLink.remoteModel).toBe('grok-4.3');
    expect(result.provenanceLink.protocolVersion).toBe(ORGANELLE_PROTOCOL_VERSION);
    expect(result.summary.tracesMerged).toBe(result.newTraces.length);
  });
});
