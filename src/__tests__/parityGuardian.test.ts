/**
 * @jest-environment node
 *
 * Locks fingerprints from the actual publishable core implementation. The
 * cross-language process test lives in `scripts/parity-guardian.mjs`; this
 * suite prevents a duplicated helper from becoming the TypeScript oracle.
 */

import { createHash } from 'node:crypto';

import { HolographicEtch } from '../../packages/core/src/holographicEtch';
import { NovaNeoEncoder } from '../../packages/core/src/novaNeoEncoder';
import { StigmergyV5 } from '../../packages/core/src/stigmergyV5';
import { TRIAD_PROTOCOL_VERSION } from '../../packages/core/src/triadProtocol';
import { TRIAD_PROTOCOL_VERSION as APP_TRIAD_PROTOCOL_VERSION } from '@/core/triadProtocol';

function tensorSha256(tensor: number[]): string {
  const bytes = Buffer.allocUnsafe(tensor.length * 8);
  for (let i = 0; i < tensor.length; i++) bytes.writeDoubleLE(tensor[i], i * 8);
  return createHash('sha256').update(bytes).digest('hex');
}

function encoderFingerprint(text: string, dimensions: number, normalize: boolean): string {
  const encoder = new NovaNeoEncoder({ dimensions, normalize, backend: 'hash' });
  return tensorSha256(encoder.encode(text));
}

describe('Cross-Language Parity Guardian (publishable npm implementation)', () => {
  it('exports one explicit protocol version from both TypeScript surfaces', () => {
    expect(TRIAD_PROTOCOL_VERSION).toBe('2.4.0');
    expect(APP_TRIAD_PROTOCOL_VERSION).toBe(TRIAD_PROTOCOL_VERSION);
  });

  it('locks the normalized 16-dimension reference', () => {
    expect(encoderFingerprint('hello triad', 16, true)).toBe(
      '5b5443c7cfae197f7b7eb1cafa8b078f215fdc093676feab672271f7a9850c2d',
    );
  });

  it('locks the raw 16-dimension reference', () => {
    expect(encoderFingerprint('hello triad', 16, false)).toBe(
      '13a79080e74dc24c83abbbd68a3749d1a455d47db0436e8eb309b9ddb20aadc7',
    );
  });

  it('locks the >32-dimension normalization path that previously escaped parity checks', () => {
    expect(encoderFingerprint('crystalline entropy', 64, true)).toBe(
      '7da1b986757f0b617250ac0421daef95417f985c47e590e3ea331132accb9211',
    );
  });

  it('uses TextEncoder replacement semantics for lone surrogates', () => {
    expect(encoderFingerprint('\ud800', 8, false)).toBe(
      '7a8030750bfbf66bef7cd5c633cb37c30e9ae07ba5054330b8d2527af72e627c',
    );
    expect(encoderFingerprint('\ud800', 8, false)).toBe(
      encoderFingerprint('\ufffd', 8, false),
    );
  });

  it('locks the deterministic embedding backend cross-runtime fixture', () => {
    const encoder = new NovaNeoEncoder({ dimensions: 16, normalize: true, backend: 'embedding' });
    expect(tensorSha256(encoder.encode('Semantic café 😀'))).toBe(
      '10e5669983d500f37347383f02b198ee5b76126d6610b140ec411266cc7008bd',
    );
  });

  it('makes the full triad fixture replayable with a caller-supplied trace id', () => {
    const context = [0.25, -0.5, 0.75, 1.0];
    const synthesis = [0.5, -0.25, 0.75, 0.5];
    const metadata = { stage: 'cross-language-parity', sequence: 1 };
    const traceId = '123e4567-e89b-42d3-a456-426614174000';

    const makeTrace = () => {
      const memory = new StigmergyV5({
        resonanceThreshold: 0.25,
        adaptiveThreshold: false,
        maxTraces: 8,
      });
      const trace = memory.recordTrace(context, synthesis, metadata, { traceId });
      return { memory, trace };
    };
    const first = makeTrace();
    const second = makeTrace();
    expect(first.trace.id).toBe(traceId);
    expect(first.trace.hash).toBe(second.trace.hash);
    expect(first.memory.getMerkleRoot()).toBe(first.trace.hash);
    expect(first.memory.getResonance(context).trace?.id).toBe(traceId);

    const ledger = new HolographicEtch({ confidenceFloor: 0, maxEtches: 8 });
    const etch = ledger.applyEtch(context, synthesis, 'cross-language-parity');
    expect(etch.hash).toMatch(/^[a-f0-9]{64}$/);
    expect(etch.propagationHint).toMatch(/^(seed|bloom|radiate)$/);
  });
});
