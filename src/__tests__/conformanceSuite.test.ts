// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Kevin John Kull (Kuonirad) and KullAILABS MCOP Framework contributors
import {
  BUILTIN_CONTRACTS,
  runConformanceSuite,
  type ConformanceContract,
} from '../conformance';

const FIXED = () => new Date('2026-05-29T00:00:00.000Z');

describe('conformance suite', () => {
  it('reports conformant when every built-in contract passes', async () => {
    const report = await runConformanceSuite({ now: FIXED });
    expect(report.kind).toBe('mcop-conformance-report');
    expect(report.verdict).toBe('conformant');
    expect(report.passed).toBe(report.total);
    expect(report.total).toBe(BUILTIN_CONTRACTS.length);
    expect(report.merkleRoot).toHaveLength(64);
    for (const c of report.contracts) {
      expect(c.passed).toBe(true);
    }
  });

  it('covers the three load-bearing guarantees', async () => {
    const report = await runConformanceSuite({ now: FIXED });
    const ids = report.contracts.map((c) => c.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        'canonical-digest-determinism',
        'hot-path-parity',
        'hot-path-provenance',
        'approved-changeset-gate',
      ]),
    );
  });

  it('goes non-conformant if any contract fails, and isolates a throwing contract', async () => {
    const failing: ConformanceContract = {
      id: 'always-fails',
      description: 'intentionally failing contract',
      check: () => ({ id: 'always-fails', description: 'x', passed: false, detail: 'nope' }),
    };
    const throwing: ConformanceContract = {
      id: 'always-throws',
      description: 'intentionally throwing contract',
      check: () => {
        throw new Error('boom');
      },
    };
    const report = await runConformanceSuite({
      now: FIXED,
      contracts: [...BUILTIN_CONTRACTS, failing, throwing],
    });
    expect(report.verdict).toBe('non-conformant');
    expect(report.passed).toBe(BUILTIN_CONTRACTS.length);
    expect(report.contracts.find((c) => c.id === 'always-throws')?.detail).toMatch(/contract threw: boom/);
  });

  it('seals a deterministic report root for the same contract set', async () => {
    const a = await runConformanceSuite({ now: FIXED });
    const b = await runConformanceSuite({ now: FIXED });
    expect(a.merkleRoot).toBe(b.merkleRoot);
  });
});
