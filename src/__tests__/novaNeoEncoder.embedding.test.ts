import * as fs from 'node:fs';
import * as path from 'node:path';

import { NovaNeoEncoder, UniversalEncoder, NovaNeoWeb, getUniversalCryptoRuntime, sha256Hex } from '../core';
import { HashingTrickBackend, defaultEmbeddingBackend } from '../core/embeddingEngine';
import logger from '../utils/logger';

// Cosine similarity helper for semantic tests
function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let magA = 0;
  let magB = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  return dot / (Math.sqrt(magA) * Math.sqrt(magB) || 1);
}

describe('NOVA-NEO Embedding Backend (HashingTrick)', () => {
  it('produces deterministic output for identical inputs', () => {
    const encoder = new NovaNeoEncoder({ dimensions: 64, normalize: true, backend: 'embedding' });
    const a = encoder.encode('crystalline entropy');
    const b = encoder.encode('crystalline entropy');

    expect(a).toEqual(b);
    expect(a).toHaveLength(64);
  });

  it('produces normalised vectors when normalize=true', () => {
    const encoder = new NovaNeoEncoder({ dimensions: 32, normalize: true, backend: 'embedding' });
    const vec = encoder.encode('test normalisation');

    const magnitude = Math.sqrt(vec.reduce((acc, v) => acc + v * v, 0));
    expect(magnitude).toBeCloseTo(1, 5);
  });

  it('produces unnormalised vectors when normalize=false', () => {
    const encoder = new NovaNeoEncoder({ dimensions: 32, normalize: false, backend: 'embedding' });
    const vec = encoder.encode('test normalisation');

    const magnitude = Math.sqrt(vec.reduce((acc, v) => acc + v * v, 0));
    expect(magnitude).toBeGreaterThan(0);
    expect(magnitude).not.toBeCloseTo(1, 1); // unlikely to be exactly 1 without normalisation
  });

  it('estimates entropy above the configured floor', () => {
    const encoder = new NovaNeoEncoder({ dimensions: 64, normalize: true, entropyFloor: 0.05, backend: 'embedding' });
    const vec = encoder.encode('dialectical synthesis');
    const entropy = encoder.estimateEntropy(vec);

    expect(entropy).toBeGreaterThanOrEqual(0.05);
    expect(entropy).toBeLessThanOrEqual(1);
  });

  it('captures semantic similarity between related phrases', () => {
    const encoder = new NovaNeoEncoder({ dimensions: 128, normalize: true, backend: 'embedding' });

    const catSat = encoder.encode('the cat sat on the mat');
    const catSits = encoder.encode('a cat sits on a mat');
    const unrelated = encoder.encode('quantum chromodynamics theory');

    const simRelated = cosine(catSat, catSits);
    const simUnrelated = cosine(catSat, unrelated);

    // Related phrases should be noticeably more similar than unrelated
    expect(simRelated).toBeGreaterThan(simUnrelated);
    expect(simRelated).toBeGreaterThan(0.3); // at least modest overlap
  });

  it('produces different vectors than the hash backend for the same text', () => {
    const hashEnc = new NovaNeoEncoder({ dimensions: 64, normalize: true, backend: 'hash' });
    const embedEnc = new NovaNeoEncoder({ dimensions: 64, normalize: true, backend: 'embedding' });

    const hashVec = hashEnc.encode('stigmergic resonance');
    const embedVec = embedEnc.encode('stigmergic resonance');

    expect(hashVec).not.toEqual(embedVec);
  });

  it('defaults to hash backend when backend is omitted', () => {
    const defaultEnc = new NovaNeoEncoder({ dimensions: 64, normalize: true });
    const hashEnc = new NovaNeoEncoder({ dimensions: 64, normalize: true, backend: 'hash' });

    const a = defaultEnc.encode('default behaviour check');
    const b = hashEnc.encode('default behaviour check');

    expect(a).toEqual(b);
  });

  it('emits debug provenance including backend field', () => {
    const originalLevel = logger.level;
    logger.level = 'debug';
    const debugSpy = jest.spyOn(logger, 'debug').mockImplementation(() => {});

    try {
      const encoder = new NovaNeoEncoder({ dimensions: 16, backend: 'embedding' });
      encoder.encode('debug-provenance');

      expect(debugSpy).toHaveBeenCalled();
      const firstCall = debugSpy.mock.calls[0][0] as {
        msg: string;
        provenance: { dimensions: number; backend: string };
      };
      expect(firstCall.msg).toMatch(/NOVA-NEO/);
      expect(firstCall.provenance.dimensions).toBe(16);
      expect(firstCall.provenance.backend).toBe('embedding');
    } finally {
      debugSpy.mockRestore();
      logger.level = originalLevel;
    }
  });

  it('throws on non-positive dimensions (same guard as hash backend)', () => {
    expect(() => new NovaNeoEncoder({ dimensions: 0, backend: 'embedding' })).toThrow(/dimensions/);
    expect(() => new NovaNeoEncoder({ dimensions: -1, backend: 'embedding' })).toThrow(/dimensions/);
  });

  it('handles empty strings without crashing', () => {
    const encoder = new NovaNeoEncoder({ dimensions: 32, normalize: true, backend: 'embedding' });
    const vec = encoder.encode('');

    expect(vec).toHaveLength(32);
    expect(vec.every((v) => Number.isFinite(v))).toBe(true);

    // Empty input → zero vector → zero entropy
    expect(encoder.estimateEntropy(vec)).toBe(0);
  });

  it('handles very long strings without overflow', () => {
    const encoder = new NovaNeoEncoder({ dimensions: 64, normalize: true, backend: 'embedding' });
    const longText = 'word '.repeat(10000);
    const vec = encoder.encode(longText);

    expect(vec).toHaveLength(64);
    expect(vec.every((v) => Number.isFinite(v))).toBe(true);

    const magnitude = Math.sqrt(vec.reduce((acc, v) => acc + v * v, 0));
    expect(magnitude).toBeCloseTo(1, 5);
  });

  it('is stable across repeated calls (no hidden state)', () => {
    const encoder = new NovaNeoEncoder({ dimensions: 64, normalize: true, backend: 'embedding' });

    const runs: number[][] = [];
    for (let i = 0; i < 5; i++) {
      runs.push(encoder.encode('determinism check'));
    }

    for (let i = 1; i < runs.length; i++) {
      expect(runs[i]).toEqual(runs[0]);
    }
  });
});

describe('HashingTrickBackend standalone', () => {
  it('implements IEmbeddingBackend interface', () => {
    const backend = new HashingTrickBackend();
    const vec = backend.encode('standalone test', 32, true);

    expect(vec).toHaveLength(32);
    expect(typeof vec[0]).toBe('number');
  });

  it('defaultEmbeddingBackend is exported and functional', () => {
    const vec = defaultEmbeddingBackend.encode('singleton reuse', 16, false);
    expect(vec).toHaveLength(16);
    expect(vec.every((v) => Number.isFinite(v))).toBe(true);
  });
});

describe('UniversalEncoder and NovaNeoWeb portability', () => {
  it('keeps NovaNeoWeb byte-identical to hash backend without node crypto imports', () => {
    const hashEnc = new NovaNeoEncoder({ dimensions: 32, normalize: true, backend: 'hash' });
    const webEnc = new NovaNeoEncoder({ dimensions: 32, normalize: true, backend: 'novaNeoWeb' });
    expect(webEnc.encode('edge-native flourishing')).toEqual(hashEnc.encode('edge-native flourishing'));
  });

  it('UniversalEncoder exposes the browser/edge facade as first-class API', () => {
    const web = new UniversalEncoder({ dimensions: 16, normalize: true });
    const alias = new NovaNeoWeb({ dimensions: 16, normalize: true });
    expect(web.encode('universal mcop')).toEqual(alias.encode('universal mcop'));
    expect(getUniversalCryptoRuntime()).toMatch(/node|web|portable/);
  });

  it('HashingTrickBackend self-heals dimension=0 to a safe power-of-2', () => {
    const backend = new HashingTrickBackend();
    const vec = backend.encode('dimension bloom', 0, true);
    expect(vec).toHaveLength(1);
    expect(vec.every((v) => Number.isFinite(v))).toBe(true);
    expect(backend.getLastDimensionHealing()).toMatchObject({
      requestedDimensions: 0,
      healedDimensions: 1,
      reason: 'non-positive',
    });
  });

  it('NovaNeoEncoder can opt into SelfHealingDimension for invalid configs', () => {
    const encoder = new NovaNeoEncoder({ dimensions: 0, backend: 'novaNeoWeb', selfHealDimensions: true });
    expect(encoder.encode('self healing dimension')).toHaveLength(1);
  });
});

describe('portable SHA-256 substrate', () => {
  it('matches the SHA-256 reference digest for abc', () => {
    expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});


describe('browser bundle guardrails', () => {
  it('keeps encoder and embedding sources free of static node crypto and Buffer usage', () => {
    const files = [
      path.join(__dirname, '..', 'core', 'novaNeoEncoder.ts'),
      path.join(__dirname, '..', 'core', 'embeddingEngine.ts'),
    ];
    for (const file of files) {
      const source = fs.readFileSync(file, 'utf8');
      expect(source).not.toMatch(/from ['"]node:crypto['"]|from ['"]crypto['"]/);
      expect(source).not.toMatch(/\bBuffer\b/);
    }
  });
});
