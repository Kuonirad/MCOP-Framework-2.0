// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Kevin John Kull (Kuonirad) and KullAILABS MCOP Framework contributors
/**
 * @fileoverview Positive-Impact Verifier — Phase 2 of the operational
 * positive-impact recursion.
 *
 * Phase 1 made the Positive Impact Report *cite* real scoring events (etch
 * hashes, growth Merkle roots, a Proteome substrate root). Phase 2 makes those
 * citations **falsifiable**: it replays a committed attestation through the
 * same MCOP primitives and asserts that every cited hash, root, and metric
 * reproduces byte-for-byte.
 *
 * This is the repo's "falsify first" ethos turned inward — the framework
 * verifies its own impact claims with the same deterministic mechanisms it
 * offers users. If any primitive's scoring math drifts (e.g. a change to the
 * EudaimonicEtch flourishing formula or the amplifier's metric blend), the
 * committed attestation stops reproducing and `pnpm positive:verify` fails.
 *
 * The auditor is deterministic given its inputs (only `generatedAt` is a
 * wall-clock value, and it never feeds a hash or metric), so verification is a
 * pure replay-and-compare: no network, no environment dependence.
 */

import {
  auditPositiveImpact,
  type PositiveImpactAudit,
  type VerificationCheckInput,
} from './impactAuditor';

export interface AttestationOptions {
  dimensions: number;
  confidenceFloor: number;
  durationBudgetMs: number;
  proteomeSteps: number;
  proteomeNodeCount: number;
}

export interface PositiveImpactAttestation {
  schemaVersion: 1;
  kind: 'mcop-positive-impact-attestation';
  /** Exact auditor options used, so replay is parameter-identical. */
  options: AttestationOptions;
  /** The full audit being attested — inputs (checks) plus cited outputs. */
  audit: PositiveImpactAudit;
}

export interface VerificationResult {
  ok: boolean;
  /** Human-readable description of each field that failed to reproduce. */
  mismatches: string[];
}

export const DEFAULT_ATTESTATION_OPTIONS: AttestationOptions = {
  dimensions: 32,
  confidenceFloor: 0.65,
  durationBudgetMs: 60_000,
  proteomeSteps: 16,
  proteomeNodeCount: 96,
};

/**
 * The canonical check matrix the committed attestation snapshots. The labels
 * mirror those exercised by `scripts/positive-audit.mjs`; the inputs are fixed
 * so the committed attestation is a stable, drift-locking fixture. A live
 * `pnpm positive:audit` run overwrites the attestation with its own results,
 * but those remain self-reproducing under the same verifier.
 */
export const CANONICAL_CHECK_MATRIX: readonly VerificationCheckInput[] = Object.freeze([
  { label: 'TypeScript app resonance', command: 'pnpm exec tsc -p tsconfig.json', passed: true, durationMs: 1500 },
  { label: 'TypeScript core resonance', command: 'pnpm --filter @kullailabs/mcop-core exec tsc', passed: true, durationMs: 1200 },
  { label: 'Lint resonance', command: 'pnpm lint', passed: true, durationMs: 4000 },
  { label: 'Test resonance', command: 'pnpm test', passed: true, durationMs: 20000 },
  { label: 'Parity resonance', command: 'pnpm parity:check', passed: true, durationMs: 3000 },
  { label: 'Documentation resonance', command: 'pnpm docs:guard', passed: true, durationMs: 2000 },
  { label: 'Placement resonance', command: 'pnpm audit:placement', passed: true, durationMs: 1800 },
  { label: 'SBOM generation resonance', command: 'pnpm sbom', passed: true, durationMs: 6000 },
  { label: 'SBOM validation resonance', command: 'pnpm sbom:validate', passed: true, durationMs: 2500 },
]);

/** Builds an attestation by running the real auditor over `checks`. */
export async function buildAttestation(
  checks: readonly VerificationCheckInput[] = CANONICAL_CHECK_MATRIX,
  options: Partial<AttestationOptions> = {},
  now?: () => Date,
): Promise<PositiveImpactAttestation> {
  const opts: AttestationOptions = { ...DEFAULT_ATTESTATION_OPTIONS, ...options };
  const audit = await auditPositiveImpact(checks, { ...opts, now });
  return {
    schemaVersion: 1,
    kind: 'mcop-positive-impact-attestation',
    options: opts,
    audit,
  };
}

/**
 * Replays the attested inputs through the primitives and confirms every cited
 * hash, root, and metric reproduces. `generatedAt` is intentionally excluded —
 * it is the only non-deterministic surface and never feeds the evidence.
 */
export async function verifyPositiveImpact(
  attestation: PositiveImpactAttestation,
): Promise<VerificationResult> {
  const mismatches: string[] = [];

  const inputs: VerificationCheckInput[] = attestation.audit.checks.map((c) => ({
    label: c.label,
    command: c.command,
    passed: c.passed,
    durationMs: c.durationMs,
  }));

  const fresh = await auditPositiveImpact(inputs, { ...attestation.options });
  const claimed = attestation.audit;

  compareScalar(mismatches, 'positiveImpactScore', claimed.positiveImpactScore, fresh.positiveImpactScore);
  compareScalar(mismatches, 'passed', claimed.passed, fresh.passed);
  compareScalar(mismatches, 'total', claimed.total, fresh.total);

  for (const key of [
    'contributorJoy',
    'adoptionVelocity',
    'beneficialOutcomeAmplification',
    'growthEvents',
    'merkleRoot',
  ] as const) {
    compareScalar(mismatches, `metrics.${key}`, claimed.metrics[key], fresh.metrics[key]);
  }

  if (claimed.checks.length !== fresh.checks.length) {
    mismatches.push(`checks.length: claimed ${claimed.checks.length} ≠ replayed ${fresh.checks.length}`);
  } else {
    claimed.checks.forEach((claimedCheck, i) => {
      const freshCheck = fresh.checks[i];
      const prefix = `checks[${i}] (${claimedCheck.label})`;
      compareScalar(mismatches, `${prefix}.domain`, claimedCheck.domain, freshCheck.domain);
      compareScalar(mismatches, `${prefix}.etchAccepted`, claimedCheck.etchAccepted, freshCheck.etchAccepted);
      compareScalar(mismatches, `${prefix}.etchHash`, claimedCheck.etchHash, freshCheck.etchHash);
      compareScalar(mismatches, `${prefix}.flourishingScore`, claimedCheck.flourishingScore, freshCheck.flourishingScore);
      compareScalar(mismatches, `${prefix}.propagationHint`, claimedCheck.propagationHint, freshCheck.propagationHint);
      compareScalar(mismatches, `${prefix}.growthEventHash`, claimedCheck.growthEventHash, freshCheck.growthEventHash);
    });
  }

  compareSubstrate(mismatches, claimed.substrate, fresh.substrate);
  compareCitations(mismatches, claimed.citations, fresh.citations);

  return { ok: mismatches.length === 0, mismatches };
}

function compareScalar(
  mismatches: string[],
  label: string,
  claimed: unknown,
  fresh: unknown,
): void {
  if (claimed !== fresh) {
    mismatches.push(`${label}: claimed ${format(claimed)} ≠ replayed ${format(fresh)}`);
  }
}

function compareSubstrate(
  mismatches: string[],
  claimed: PositiveImpactAudit['substrate'],
  fresh: PositiveImpactAudit['substrate'],
): void {
  if (!claimed && !fresh) return;
  if (!claimed || !fresh) {
    mismatches.push(`substrate: claimed ${claimed ? 'present' : 'absent'} ≠ replayed ${fresh ? 'present' : 'absent'}`);
    return;
  }
  compareScalar(mismatches, 'substrate.steps', claimed.steps, fresh.steps);
  compareScalar(mismatches, 'substrate.nodeCount', claimed.nodeCount, fresh.nodeCount);
  compareScalar(mismatches, 'substrate.equilibriumScore', claimed.equilibriumScore, fresh.equilibriumScore);
  compareScalar(mismatches, 'substrate.energyVariance', claimed.energyVariance, fresh.energyVariance);
  compareScalar(mismatches, 'substrate.merkleRoot', claimed.merkleRoot, fresh.merkleRoot);
}

function compareCitations(
  mismatches: string[],
  claimed: PositiveImpactAudit['citations'],
  fresh: PositiveImpactAudit['citations'],
): void {
  if (claimed.length !== fresh.length) {
    mismatches.push(`citations.length: claimed ${claimed.length} ≠ replayed ${fresh.length}`);
    return;
  }
  claimed.forEach((c, i) => {
    const f = fresh[i];
    if (c.kernel !== f.kernel || c.signal !== f.signal || c.hash !== f.hash || c.backs !== f.backs) {
      mismatches.push(`citations[${i}]: claimed ${format(c)} ≠ replayed ${format(f)}`);
    }
  });
}

function format(value: unknown): string {
  if (typeof value === 'string') return value.length > 24 ? `${value.slice(0, 16)}…${value.slice(-4)}` : value;
  return JSON.stringify(value);
}
