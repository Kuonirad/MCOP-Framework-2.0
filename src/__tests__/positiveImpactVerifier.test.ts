// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Kevin John Kull (Kuonirad) and KullAILABS MCOP Framework contributors
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import {
  buildAttestation,
  verifyPositiveImpact,
  CANONICAL_CHECK_MATRIX,
  type PositiveImpactAttestation,
} from '@/audit/positiveImpactVerifier';

const FIXED_NOW = () => new Date('2026-05-25T00:00:00.000Z');

async function freshAttestation(): Promise<PositiveImpactAttestation> {
  return buildAttestation(CANONICAL_CHECK_MATRIX, {}, FIXED_NOW);
}

// Deep clone so a tamper in one test never leaks into another.
function clone(att: PositiveImpactAttestation): PositiveImpactAttestation {
  return JSON.parse(JSON.stringify(att));
}

describe('verifyPositiveImpact', () => {
  it('verifies an untampered attestation (full byte-for-byte replay)', async () => {
    const attestation = await freshAttestation();
    const result = await verifyPositiveImpact(attestation);
    expect(result.mismatches).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('passes even with a different wall-clock (generatedAt is not evidence)', async () => {
    const attestation = await freshAttestation();
    attestation.audit.generatedAt = '1999-01-01T00:00:00.000Z';
    const result = await verifyPositiveImpact(attestation);
    expect(result.ok).toBe(true);
  });

  it('detects a tampered metric', async () => {
    const attestation = clone(await freshAttestation());
    attestation.audit.metrics.contributorJoy = 0.123;
    const result = await verifyPositiveImpact(attestation);
    expect(result.ok).toBe(false);
    expect(result.mismatches.some((m) => m.includes('metrics.contributorJoy'))).toBe(true);
  });

  it('detects a tampered etch hash (citation forgery)', async () => {
    const attestation = clone(await freshAttestation());
    const target = attestation.audit.checks.find((c) => c.etchAccepted);
    expect(target).toBeDefined();
    target!.etchHash = 'deadbeef'.repeat(8);
    const result = await verifyPositiveImpact(attestation);
    expect(result.ok).toBe(false);
    expect(result.mismatches.some((m) => m.includes('etchHash'))).toBe(true);
  });

  it('detects a tampered Proteome substrate Merkle root', async () => {
    const attestation = clone(await freshAttestation());
    expect(attestation.audit.substrate).toBeDefined();
    attestation.audit.substrate!.merkleRoot = '0'.repeat(64);
    const result = await verifyPositiveImpact(attestation);
    expect(result.ok).toBe(false);
    expect(result.mismatches.some((m) => m.includes('substrate.merkleRoot'))).toBe(true);
  });

  it('detects a tampered input duration (output no longer reproduces)', async () => {
    const attestation = clone(await freshAttestation());
    // Change a recorded input without recomputing the recorded outputs: the
    // replay now produces different hashes than the (stale) claimed ones.
    attestation.audit.checks[0].durationMs = 59_999;
    const result = await verifyPositiveImpact(attestation);
    expect(result.ok).toBe(false);
  });

  it('detects a forged citation', async () => {
    const attestation = clone(await freshAttestation());
    attestation.audit.citations.push({
      kernel: 'HolographicEtch',
      signal: 'eudaimonic-etch',
      hash: 'f'.repeat(64),
      backs: 'a check that was never scored',
    });
    const result = await verifyPositiveImpact(attestation);
    expect(result.ok).toBe(false);
    expect(result.mismatches.some((m) => m.includes('citations.length'))).toBe(true);
  });
});

/**
 * Attestation generation hook (mirrors `benchmark:refresh`). Run via
 * `pnpm positive:attest` to refresh the committed drift-lock fixture.
 */
const ATTEST = process.env.POSITIVE_IMPACT_ATTEST === '1';
const VERIFY = process.env.POSITIVE_IMPACT_VERIFY === '1';
const repoRoot = join(__dirname, '..', '..');
const attestationPath = join(repoRoot, 'audit', 'positive-impact-attestation.json');

(ATTEST ? it : it.skip)('regenerates the committed positive-impact attestation', async () => {
  const attestation = await buildAttestation();
  mkdirSync(dirname(attestationPath), { recursive: true });
  writeFileSync(attestationPath, `${JSON.stringify(attestation, null, 2)}\n`);
  const result = await verifyPositiveImpact(attestation);
  expect(result.ok).toBe(true);
});

/**
 * CI gate (`pnpm positive:verify`): the committed attestation MUST replay
 * byte-for-byte. A failure here means a primitive's scoring math drifted or the
 * report's cited evidence was edited without regenerating.
 */
(VERIFY ? it : it.skip)('committed attestation reproduces byte-for-byte', async () => {
  expect(existsSync(attestationPath)).toBe(true);
  const attestation = JSON.parse(readFileSync(attestationPath, 'utf8')) as PositiveImpactAttestation;
  const result = await verifyPositiveImpact(attestation);
  if (!result.ok) {
    throw new Error(
      `Positive-impact attestation failed to reproduce:\n- ${result.mismatches.join('\n- ')}`,
    );
  }
  expect(result.ok).toBe(true);
});
