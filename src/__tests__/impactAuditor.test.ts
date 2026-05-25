// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Kevin John Kull (Kuonirad) and KullAILABS MCOP Framework contributors
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import {
  auditPositiveImpact,
  classifyDomain,
  type VerificationCheckInput,
} from '@/audit/impactAuditor';

const FIXED_NOW = () => new Date('2026-05-25T00:00:00.000Z');

const SAMPLE_CHECKS: VerificationCheckInput[] = [
  { label: 'TypeScript app resonance', command: 'tsc -p tsconfig.json', passed: true, durationMs: 1200 },
  { label: 'Lint resonance', command: 'pnpm lint', passed: true, durationMs: 4200 },
  { label: 'Test resonance', command: 'pnpm test', passed: true, durationMs: 18000 },
  { label: 'Parity resonance', command: 'pnpm parity:check', passed: true, durationMs: 3000 },
  { label: 'Documentation resonance', command: 'pnpm docs:guard', passed: false, durationMs: 800 },
  { label: 'SBOM validation resonance', command: 'pnpm sbom:validate', passed: true, durationMs: 5000 },
];

describe('classifyDomain', () => {
  it('maps known check labels onto distinct growth domains', () => {
    expect(classifyDomain('TypeScript app resonance')).toBe('determinism');
    expect(classifyDomain('Test resonance')).toBe('determinism');
    expect(classifyDomain('Lint resonance')).toBe('identity');
    expect(classifyDomain('Parity resonance')).toBe('provenance');
    expect(classifyDomain('Documentation resonance')).toBe('doc-code-sync');
    expect(classifyDomain('Placement resonance')).toBe('link-integrity');
    expect(classifyDomain('SBOM validation resonance')).toBe('dependency-hygiene');
  });

  it('falls back to joy for unrecognised labels', () => {
    expect(classifyDomain('something entirely new')).toBe('joy');
  });
});

describe('auditPositiveImpact', () => {
  it('derives report metrics from the real PositiveResonanceAmplifier', async () => {
    const audit = await auditPositiveImpact(SAMPLE_CHECKS, { now: FIXED_NOW });

    // 5 of 6 checks passed.
    expect(audit.passed).toBe(5);
    expect(audit.total).toBe(6);
    expect(audit.positiveImpactScore).toBe(83);

    // Metrics come straight from the amplifier and must be valid probabilities.
    expect(audit.metrics.growthEvents).toBe(6);
    for (const value of [
      audit.metrics.contributorJoy,
      audit.metrics.adoptionVelocity,
      audit.metrics.beneficialOutcomeAmplification,
    ]) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
    // A predominantly-passing suite should radiate non-trivial joy.
    expect(audit.metrics.contributorJoy).toBeGreaterThan(0.5);
    expect(audit.metrics.merkleRoot).toMatch(/^[0-9a-f]{64}$/);
  });

  it('accepts passing checks as eudaimonic etches and skips failing ones', async () => {
    const audit = await auditPositiveImpact(SAMPLE_CHECKS, { now: FIXED_NOW });

    const passing = audit.checks.filter((c) => c.passed);
    const failing = audit.checks.filter((c) => !c.passed);

    for (const check of passing) {
      expect(check.etchAccepted).toBe(true);
      expect(check.etchHash).toMatch(/^[0-9a-f]{64}$/);
      expect(check.flourishingScore).toBeGreaterThan(0.5);
      expect(['bloom', 'radiate']).toContain(check.propagationHint);
    }
    for (const check of failing) {
      expect(check.etchAccepted).toBe(false);
      expect(check.etchHash).toBeNull();
      expect(check.flourishingScore).toBeLessThan(0.5);
      expect(check.propagationHint).toBe('seed');
    }
  });

  it('emits a Proteome substrate-stability signal with a Merkle root', async () => {
    const audit = await auditPositiveImpact(SAMPLE_CHECKS, {
      now: FIXED_NOW,
      proteomeSteps: 8,
      proteomeNodeCount: 48,
    });

    expect(audit.substrate).toBeDefined();
    expect(audit.substrate?.kernel).toBe('ProteomeOrchestrator');
    expect(audit.substrate?.steps).toBe(8);
    expect(audit.substrate?.nodeCount).toBe(48);
    expect(audit.substrate?.equilibriumScore).toBeGreaterThanOrEqual(0);
    expect(audit.substrate?.equilibriumScore).toBeLessThanOrEqual(1);
    expect(audit.substrate?.merkleRoot).toMatch(/^[0-9a-f]{64}$/);
  });

  it('cites the specific kernels and scoring events backing the report', async () => {
    const audit = await auditPositiveImpact(SAMPLE_CHECKS, { now: FIXED_NOW });

    const kernels = new Set(audit.citations.map((c) => c.kernel));
    expect(kernels.has('PositiveResonanceAmplifier')).toBe(true);
    expect(kernels.has('HolographicEtch')).toBe(true);
    expect(kernels.has('ProteomeOrchestrator')).toBe(true);

    // The amplifier citation must reference the same Merkle root the metrics
    // were computed from — i.e. the report cites its own evidence.
    const amplifierCitation = audit.citations.find(
      (c) => c.kernel === 'PositiveResonanceAmplifier',
    );
    expect(amplifierCitation?.hash).toBe(audit.metrics.merkleRoot);

    // Every Holographic Etch citation must reference a real accepted etch.
    const acceptedHashes = new Set(
      audit.checks.filter((c) => c.etchAccepted).map((c) => c.etchHash),
    );
    const etchCitations = audit.citations.filter((c) => c.kernel === 'HolographicEtch');
    expect(etchCitations.length).toBe(acceptedHashes.size);
    for (const citation of etchCitations) {
      expect(acceptedHashes.has(citation.hash)).toBe(true);
    }
  });

  it('is deterministic across runs (hashes and metrics are replayable)', async () => {
    const a = await auditPositiveImpact(SAMPLE_CHECKS, { now: FIXED_NOW });
    const b = await auditPositiveImpact(SAMPLE_CHECKS, { now: FIXED_NOW });

    expect(b.metrics).toEqual(a.metrics);
    expect(b.checks.map((c) => c.etchHash)).toEqual(a.checks.map((c) => c.etchHash));
    expect(b.checks.map((c) => c.growthEventHash)).toEqual(
      a.checks.map((c) => c.growthEventHash),
    );
    expect(b.substrate?.merkleRoot).toBe(a.substrate?.merkleRoot);
    expect(b.citations).toEqual(a.citations);
  });

  it('handles an empty check matrix without throwing', async () => {
    const audit = await auditPositiveImpact([], { now: FIXED_NOW });
    expect(audit.total).toBe(0);
    expect(audit.positiveImpactScore).toBe(0);
    expect(audit.metrics.growthEvents).toBe(0);
    expect(audit.substrate).toBeUndefined();
    expect(audit.citations).toEqual([]);
  });
});

/**
 * Generation hook for `scripts/positive-audit.mjs` (mirrors the
 * `benchmark:refresh` pattern). When `POSITIVE_IMPACT_GENERATE=1`, this reads
 * the live check matrix the audit script captured and writes the
 * primitive-derived signals the report renderer consumes. It is `it.skip`-ed
 * during ordinary test runs so it never performs IO or slows the suite.
 */
const GENERATE = process.env.POSITIVE_IMPACT_GENERATE === '1';
const repoRoot = join(__dirname, '..', '..');
const checksPath = join(repoRoot, 'audit', 'positive-audit-checks.json');
const signalsPath = join(repoRoot, 'audit', 'positive-impact-signals.json');

(GENERATE ? it : it.skip)(
  'generates the live positive-impact signals artifact',
  async () => {
    const raw = JSON.parse(readFileSync(checksPath, 'utf8')) as {
      capturedAt?: string;
      checks: VerificationCheckInput[];
    };
    const audit = await auditPositiveImpact(raw.checks ?? []);
    mkdirSync(dirname(signalsPath), { recursive: true });
    writeFileSync(signalsPath, `${JSON.stringify(audit, null, 2)}\n`);
    expect(audit.total).toBe((raw.checks ?? []).length);
  },
);
