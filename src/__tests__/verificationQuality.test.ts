// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Kevin John Kull (Kuonirad) and KullAILABS MCOP Framework contributors
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { assessVerificationQuality } from '@/audit/verificationQuality';
import {
  buildAttestation,
  CANONICAL_CHECK_MATRIX,
  type PositiveImpactAttestation,
} from '@/audit/positiveImpactVerifier';

const FIXED_NOW = () => new Date('2026-05-25T00:00:00.000Z');

// Small substrate keeps the (perturbations + 1) replays fast and deterministic.
const SMALL = { proteomeSteps: 6, proteomeNodeCount: 32 } as const;

async function smallAttestation(): Promise<PositiveImpactAttestation> {
  return buildAttestation(CANONICAL_CHECK_MATRIX, SMALL, FIXED_NOW);
}

describe('assessVerificationQuality', () => {
  it('confirms the genuine attestation verifies and the verifier catches every substrate-generated forgery', async () => {
    const attestation = await smallAttestation();
    const report = await assessVerificationQuality(attestation, {
      perturbations: 10,
      proteomeSteps: 10,
      proteomeNodeCount: 32,
      now: FIXED_NOW,
    });

    expect(report.genuineVerified).toBe(true);
    expect(report.perturbations).toBeGreaterThan(0);
    expect(report.missed).toEqual([]);
    expect(report.caught).toBe(report.perturbations);
    expect(report.sensitivity).toBe(1);
    expect(report.qualityScore).toBe(1);
    expect(report.substrateMerkleRoot).toMatch(/^[0-9a-f]{64}$/);
  }, 30_000);

  it('exercises a spread of perturbation kinds (substrate drives variety)', async () => {
    const attestation = await smallAttestation();
    const report = await assessVerificationQuality(attestation, {
      perturbations: 12,
      proteomeSteps: 12,
      proteomeNodeCount: 32,
      now: FIXED_NOW,
    });
    const kinds = new Set(report.outcomes.map((o) => o.kind));
    // The Proteome schedule should reach more than one class of forgery.
    expect(kinds.size).toBeGreaterThan(1);
  }, 30_000);

  it('is deterministic across runs (same schedule, same outcomes)', async () => {
    const attestation = await smallAttestation();
    const a = await assessVerificationQuality(attestation, { ...SMALL, perturbations: 8, now: FIXED_NOW });
    const b = await assessVerificationQuality(attestation, { ...SMALL, perturbations: 8, now: FIXED_NOW });

    expect(b.substrateMerkleRoot).toBe(a.substrateMerkleRoot);
    expect(b.outcomes).toEqual(a.outcomes);
    expect(b.qualityScore).toBe(a.qualityScore);
  }, 30_000);

  it('reports qualityScore 0 when the genuine attestation does not verify', async () => {
    const attestation = await smallAttestation();
    // Corrupt the committed evidence so the genuine attestation fails to replay.
    attestation.audit.metrics.contributorJoy = 0.001;
    const report = await assessVerificationQuality(attestation, { ...SMALL, perturbations: 6, now: FIXED_NOW });

    expect(report.genuineVerified).toBe(false);
    expect(report.qualityScore).toBe(0);
  }, 30_000);
});

/**
 * CI gate (`pnpm positive:quality`): the committed attestation must verify AND
 * the verifier must catch every Proteome-scheduled forgery against it. A
 * `missed` perturbation means the verifier has a blind spot.
 */
const QUALITY = process.env.POSITIVE_IMPACT_QUALITY === '1';
const attestationPath = join(__dirname, '..', '..', 'audit', 'positive-impact-attestation.json');

(QUALITY ? it : it.skip)('committed attestation survives substrate-driven mutation testing', async () => {
  expect(existsSync(attestationPath)).toBe(true);
  const attestation = JSON.parse(readFileSync(attestationPath, 'utf8')) as PositiveImpactAttestation;
  const report = await assessVerificationQuality(attestation, { perturbations: 12 });
  if (report.missed.length > 0) {
    throw new Error(
      `Verifier blind spots (forgeries not caught):\n- ${report.missed
        .map((m) => `${m.kind} @ ${m.target}`)
        .join('\n- ')}`,
    );
  }
  expect(report.genuineVerified).toBe(true);
  expect(report.qualityScore).toBe(1);
}, 60_000);
