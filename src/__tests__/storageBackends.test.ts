/**
 * Tests for pluggable storage backends (in-memory + file-based).
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  InMemoryStigmergyBackend,
  FileStigmergyBackend,
} from '../core/stigmergyBackend';
import {
  InMemoryEtchBackend,
  FileEtchBackend,
} from '../core/etchBackend';
import type { PheromoneTrace, EtchRecord } from '../core/types';

function tempPath(prefix = 'mcop-test-'): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function makeTrace(id: string, hash: string): PheromoneTrace {
  return {
    id,
    hash,
    context: [0.1, 0.2, 0.3],
    synthesisVector: [0.4, 0.5, 0.6],
    weight: 0.7,
    timestamp: new Date().toISOString(),
  };
}

function makeEtch(hash: string): EtchRecord {
  return {
    hash,
    deltaWeight: 0.1,
    note: 'note',
    timestamp: new Date().toISOString(),
  };
}

describe('InMemoryStigmergyBackend', () => {
  it('appends and loads recent traces in reverse order', () => {
    const backend = new InMemoryStigmergyBackend();
    backend.appendTrace(makeTrace('a', 'ha'));
    backend.appendTrace(makeTrace('b', 'hb'));
    backend.appendTrace(makeTrace('c', 'hc'));
    const out = backend.loadRecentTraces(2);
    expect(out).toHaveLength(2);
    expect(out[0].id).toBe('c');
  });

  it('exposes the current Merkle root and supports clear', () => {
    const backend = new InMemoryStigmergyBackend();
    expect(backend.getCurrentMerkleRoot()).toBeUndefined();
    backend.appendTrace(makeTrace('a', 'ha'));
    expect(backend.getCurrentMerkleRoot()).toBe('ha');
    backend.clear();
    expect(backend.getCurrentMerkleRoot()).toBeUndefined();
  });
});

describe('FileStigmergyBackend', () => {
  let dir: string;
  let filePath: string;
  beforeEach(() => {
    dir = tempPath();
    filePath = path.join(dir, 'traces.jsonl');
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('creates the directory and returns empty when the file is missing', () => {
    const backend = new FileStigmergyBackend(filePath);
    expect(backend.loadRecentTraces(10)).toEqual([]);
  });

  it('persists appended traces across instances', () => {
    const a = new FileStigmergyBackend(filePath);
    a.appendTrace(makeTrace('a', 'ha'));
    a.appendTrace(makeTrace('b', 'hb'));

    const b = new FileStigmergyBackend(filePath);
    const loaded = b.loadRecentTraces(10);
    expect(loaded.map(t => t.id)).toEqual(['b', 'a']);
  });

  it('clear() empties the file', () => {
    const backend = new FileStigmergyBackend(filePath);
    backend.appendTrace(makeTrace('a', 'ha'));
    backend.clear?.();
    expect(backend.loadRecentTraces(10)).toEqual([]);
  });

  it('createSnapshot returns metadata + empty traces when storage is empty', () => {
    const backend = new FileStigmergyBackend(filePath);
    const snap = backend.createSnapshot?.({ note: 'unit', source: 'mixed' });
    expect(snap).toBeDefined();
    expect(snap!.traces).toEqual([]);
    expect(snap!.merkleRoot).toBe('');
    expect(snap!.metadata.version).toBe(1);
  });

  it('restoreFromSnapshot rejects unknown versions', () => {
    const backend = new FileStigmergyBackend(filePath);
    const badSnap = {
      metadata: { version: 99 as 1, createdAt: '', source: 'mixed' as const },
      traces: [],
      merkleRoot: '',
      totalTracesWritten: 0,
    };
    expect(() => backend.restoreFromSnapshot?.(badSnap)).toThrow(/Unsupported snapshot version/);
  });

  it('restoreFromSnapshot rejects tampered traces', () => {
    const backend = new FileStigmergyBackend(filePath);
    const badSnap = {
      metadata: { version: 1 as const, createdAt: '', source: 'mixed' as const },
      traces: [{ ...makeTrace('a', 'tampered'), hash: 'wrong-hash' }],
      merkleRoot: 'wrong-hash',
      totalTracesWritten: 1,
    };
    expect(() => backend.restoreFromSnapshot?.(badSnap)).toThrow(/Merkle verification failed/);
  });

  it('getCurrentMerkleRoot returns undefined when empty', () => {
    const backend = new FileStigmergyBackend(filePath);
    expect(backend.getCurrentMerkleRoot?.()).toBeUndefined();
  });

  it('persists multiple StigmergyV5 traces via the storage backend', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { StigmergyV5 } = require('../core/stigmergyV5');
    const backend = new FileStigmergyBackend(filePath);
    const stig = new StigmergyV5({
      maxTraces: 16,
      resonanceThreshold: 0.3,
      storage: backend,
    });
    stig.recordTrace([0.1, 0.2, 0.3], [0.4, 0.5, 0.6], { source: 'unit' });
    stig.recordTrace([0.2, 0.1, 0.4], [0.5, 0.3, 0.4], { source: 'unit' });
    const snap = backend.createSnapshot?.({ source: 'mixed' });
    expect(snap).toBeDefined();
    expect(snap!.traces.length).toBe(2);
    expect(snap!.merkleRoot).toBe(snap!.traces[snap!.traces.length - 1].hash);
  });
});

describe('InMemoryEtchBackend', () => {
  it('persists etch records and audit records separately', () => {
    const backend = new InMemoryEtchBackend();
    backend.appendEtch(makeEtch('h1'));
    backend.appendAudit(makeEtch('a1'));
    expect(backend.loadRecentEtches(5)).toHaveLength(1);
    expect(backend.loadAudit(5)).toHaveLength(1);
  });

  it('supports growth events', () => {
    const backend = new InMemoryEtchBackend();
    backend.appendGrowthEvent?.({
      id: 'g1',
      hash: 'h-growth',
      domain: 'joy',
      title: 'evt',
      timestamp: new Date().toISOString(),
      positiveBuilding: '',
      resonanceDelta: 0.1,
      resonanceScore: 0.5,
    });
    expect(backend.loadGrowthEvents?.(5)).toHaveLength(1);
  });

  it('clears all stores', () => {
    const backend = new InMemoryEtchBackend();
    backend.appendEtch(makeEtch('h1'));
    backend.appendAudit(makeEtch('a1'));
    backend.clear?.();
    expect(backend.loadRecentEtches(5)).toHaveLength(0);
    expect(backend.loadAudit(5)).toHaveLength(0);
  });
});

describe('FileEtchBackend', () => {
  let dir: string;
  let basePath: string;
  beforeEach(() => {
    dir = tempPath();
    basePath = path.join(dir, 'etch');
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('persists etches across instances and returns empty when missing', () => {
    const a = new FileEtchBackend(basePath, { audit: true });
    expect(a.loadRecentEtches(10)).toEqual([]);
    a.appendEtch(makeEtch('h1'));
    a.appendAudit(makeEtch('a1'));
    const b = new FileEtchBackend(basePath, { audit: true });
    expect(b.loadRecentEtches(10).map(r => r.hash)).toEqual(['h1']);
    expect(b.loadAudit(10).map(r => r.hash)).toEqual(['a1']);
  });

  it('creates snapshots and restores from them', () => {
    const backend = new FileEtchBackend(basePath, { audit: true });
    backend.appendEtch({ ...makeEtch('hash-long-enough'), hash: 'hash-long-enough' });
    const snap = backend.createSnapshot({ note: 'unit-test', source: 'mixed' });
    backend.clear?.();
    expect(backend.loadRecentEtches(10)).toEqual([]);
    backend.restoreFromSnapshot?.(snap);
    expect(backend.loadRecentEtches(10).map(r => r.hash)).toEqual(['hash-long-enough']);
  });

  it('supports growth ledger writes and reads', () => {
    const backend = new FileEtchBackend(basePath, { audit: true, growthLedger: true });
    backend.appendGrowthEvent?.({
      id: 'g1',
      hash: 'g-hash',
      domain: 'joy',
      title: 'evt',
      timestamp: new Date().toISOString(),
      positiveBuilding: '',
      resonanceDelta: 0.1,
      resonanceScore: 0.5,
    });
    expect(backend.loadGrowthEvents?.(5)).toHaveLength(1);
  });

  it('createSnapshot with growth ledger returns growth events', () => {
    const backend = new FileEtchBackend(basePath, { audit: true, growthLedger: true });
    backend.appendEtch({ ...makeEtch('hash-long-enough'), hash: 'hash-long-enough' });
    backend.appendGrowthEvent?.({
      id: 'g1',
      hash: 'g-hash',
      domain: 'joy',
      title: 'evt',
      timestamp: new Date().toISOString(),
      positiveBuilding: '',
      resonanceDelta: 0.1,
      resonanceScore: 0.5,
    });
    const snap = backend.createSnapshot({ source: 'mixed' });
    expect(snap.audit).toBeDefined();
    expect(snap.growthEvents).toBeDefined();
    expect(snap.growthEvents!.length).toBe(1);
  });

  it('restoreFromSnapshot rejects unknown versions', () => {
    const backend = new FileEtchBackend(basePath);
    const bad = {
      metadata: { version: 99 as 1, createdAt: '', source: 'mixed' as const },
      etches: [],
    };
    expect(() => backend.restoreFromSnapshot?.(bad)).toThrow(/Unsupported etch snapshot version/);
  });

  it('restoreFromSnapshot rejects short hashes', () => {
    const backend = new FileEtchBackend(basePath);
    const bad = {
      metadata: { version: 1 as const, createdAt: '', source: 'mixed' as const },
      etches: [{ hash: 'short', deltaWeight: 0, timestamp: 't' }],
    };
    expect(() => backend.restoreFromSnapshot?.(bad)).toThrow(/Invalid etch hash/);
  });
});
