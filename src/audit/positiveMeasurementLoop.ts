// SPDX-License-Identifier: BUSL-1.1
// Copyright (c) 2026 Kevin John Kull (Kuonirad) and KullAILABS MCOP Framework contributors
import { createHash } from 'node:crypto';

export interface PositiveLoopMetric {
  id: string;
  label: string;
  value: number;
  unit: '%' | 'score';
  signal: string;
  evidence: string;
  badgeFile: string;
}

export interface PositiveLoopSnapshot {
  version: 1;
  capturedAt: string;
  commitHash: string;
  evidenceHash: string;
  metrics: PositiveLoopMetric[];
}

interface AuditLike {
  positiveImpactScore?: number;
  metrics?: {
    contributorJoy?: number;
    adoptionVelocity?: number;
    beneficialOutcomeAmplification?: number;
    merkleRoot?: string | null;
  };
  citations?: Array<{ kernel: string; signal: string; hash: string; backs: string }>;
}

export interface BuildPositiveLoopSnapshotInput {
  capturedAt: string;
  commitHash: string;
  score: number;
  audit: AuditLike | null;
}

export interface ShieldsEndpoint {
  schemaVersion: 1;
  label: string;
  message: string;
  color: string;
}

export function buildPositiveLoopSnapshot({
  capturedAt,
  commitHash,
  score,
  audit,
}: BuildPositiveLoopSnapshotInput): PositiveLoopSnapshot {
  const metrics: PositiveLoopMetric[] = [
    {
      id: 'positive-impact-score',
      label: 'Positive impact score',
      value: finite(score),
      unit: '%',
      signal: `${finite(score)}%`,
      evidence: audit?.metrics?.merkleRoot
        ? `PositiveResonanceAmplifier Merkle root ${audit.metrics.merkleRoot}`
        : 'verification matrix score',
      badgeFile: 'positive-impact-score.json',
    },
    {
      id: 'contributor-joy',
      label: 'Contributor joy',
      value: round3(audit?.metrics?.contributorJoy ?? 0),
      unit: 'score',
      signal: round3(audit?.metrics?.contributorJoy ?? 0).toFixed(3),
      evidence: 'ImpactAuditor contributorJoy metric',
      badgeFile: 'positive-contributor-joy.json',
    },
    {
      id: 'adoption-velocity',
      label: 'Adoption velocity',
      value: round3(audit?.metrics?.adoptionVelocity ?? 0),
      unit: 'score',
      signal: round3(audit?.metrics?.adoptionVelocity ?? 0).toFixed(3),
      evidence: 'ImpactAuditor adoptionVelocity metric',
      badgeFile: 'positive-adoption-velocity.json',
    },
    {
      id: 'beneficial-outcome-amplification',
      label: 'Beneficial outcome amplification',
      value: round3(audit?.metrics?.beneficialOutcomeAmplification ?? 0),
      unit: 'score',
      signal: round3(audit?.metrics?.beneficialOutcomeAmplification ?? 0).toFixed(3),
      evidence: 'ImpactAuditor beneficialOutcomeAmplification metric',
      badgeFile: 'positive-beneficial-outcome-amplification.json',
    },
  ];

  const evidenceHash = createHash('sha256')
    .update(
      JSON.stringify({
        capturedAt,
        commitHash,
        metrics,
        citations: audit?.citations ?? [],
      }),
    )
    .digest('hex');

  return {
    version: 1,
    capturedAt,
    commitHash,
    evidenceHash,
    metrics,
  };
}

export function appendMeasurementLoopToReport(
  baseReport: string,
  snapshot: PositiveLoopSnapshot,
  previousSnapshot: PositiveLoopSnapshot | null,
): string {
  const existingDeltas = extractSection(baseReport, '## Measurement Loop Deltas');
  const reportWithoutDeltas = existingDeltas
    ? baseReport.slice(0, baseReport.indexOf('## Measurement Loop Deltas')).trimEnd()
    : baseReport.trimEnd();
  const deltaLog = existingDeltas
    ? `${existingDeltas.trimEnd()}\n\n${renderReportDelta(snapshot, previousSnapshot)}`
    : `## Measurement Loop Deltas\n\n${renderReportDelta(snapshot, previousSnapshot)}`;

  return `${reportWithoutDeltas}\n\n${deltaLog.trimEnd()}\n`;
}

export function renderPositiveLedger(
  existingLedger: string,
  snapshot: PositiveLoopSnapshot,
): string {
  const previousSnapshot = readLatestSnapshot(existingLedger);
  const header = `# Positive Resonance Ledger

This ledger is the holographic-etch style audit trail for MCOP's positive measurement loop. Each entry cites the commit hash, ImpactAuditor-derived metrics, and evidence hash that produced the report and shields.io endpoints.
`;
  const body = existingLedger.trim() ? existingLedger.trimEnd() : header.trimEnd();

  return `${body}\n\n${renderLedgerEntry(snapshot, previousSnapshot).trimEnd()}\n`;
}

export function renderShieldsEndpoints(
  snapshot: PositiveLoopSnapshot,
): Record<string, ShieldsEndpoint> {
  return Object.fromEntries(
    snapshot.metrics.map((metric) => [
      metric.badgeFile,
      {
        schemaVersion: 1,
        label: metric.label.toLowerCase(),
        message: metric.signal,
        color: badgeColor(metric),
      },
    ]),
  );
}

export function readLatestSnapshot(content: string): PositiveLoopSnapshot | null {
  const matches = Array.from(
    content.matchAll(/<!-- mcop-positive-snapshot ([\s\S]*?) -->/g),
  );
  const latest = matches.at(-1)?.[1];
  if (!latest) return null;

  try {
    return JSON.parse(latest) as PositiveLoopSnapshot;
  } catch {
    return null;
  }
}

function renderReportDelta(
  snapshot: PositiveLoopSnapshot,
  previousSnapshot: PositiveLoopSnapshot | null,
): string {
  const basis = previousSnapshot
    ? `Compared with previous snapshot \`${shortHash(previousSnapshot.evidenceHash)}\` from \`${previousSnapshot.capturedAt}\`.`
    : 'No previous snapshot found; this entry establishes the measurement baseline.';

  return `### ${snapshot.capturedAt} - \`${shortHash(snapshot.commitHash)}\`

- Commit: \`${snapshot.commitHash}\`
- Evidence hash: \`${snapshot.evidenceHash}\`
- Delta basis: ${basis}

| Metric | Current signal | Delta |
|:---|:---|---:|
${renderDeltaRows(snapshot, previousSnapshot)}
`;
}

function renderLedgerEntry(
  snapshot: PositiveLoopSnapshot,
  previousSnapshot: PositiveLoopSnapshot | null,
): string {
  return `## Etch ${snapshot.capturedAt} - \`${shortHash(snapshot.evidenceHash)}\`

- etch-mode: \`holographic-etch positive-resonance ledger\`
- commit-hash: \`${snapshot.commitHash}\`
- evidence-hash: \`${snapshot.evidenceHash}\`

| Metric | Current signal | Delta |
|:---|:---|---:|
${renderDeltaRows(snapshot, previousSnapshot)}

<!-- mcop-positive-snapshot ${JSON.stringify(snapshot)} -->
`;
}

function renderDeltaRows(
  snapshot: PositiveLoopSnapshot,
  previousSnapshot: PositiveLoopSnapshot | null,
): string {
  return snapshot.metrics
    .map((metric) => {
      const previous = previousSnapshot?.metrics.find((candidate) => candidate.id === metric.id);
      const delta = previous ? formatDelta(metric.value - previous.value, metric.unit) : 'baseline';
      return `| ${metric.label} | ${metric.signal} | ${delta} |`;
    })
    .join('\n');
}

function extractSection(content: string, heading: string): string {
  const start = content.indexOf(heading);
  return start === -1 ? '' : content.slice(start);
}

function formatDelta(delta: number, unit: PositiveLoopMetric['unit']): string {
  if (!Number.isFinite(delta)) return 'n/a';
  if (delta === 0) return unit === '%' ? '0%' : '0.000';
  const sign = delta > 0 ? '+' : '';
  return unit === '%' ? `${sign}${delta}%` : `${sign}${delta.toFixed(3)}`;
}

function badgeColor(metric: PositiveLoopMetric): string {
  if (metric.unit === '%') {
    if (metric.value >= 90) return 'brightgreen';
    if (metric.value >= 75) return 'green';
    if (metric.value >= 50) return 'yellow';
    return 'orange';
  }
  if (metric.value >= 0.8) return 'brightgreen';
  if (metric.value >= 0.6) return 'green';
  if (metric.value >= 0.4) return 'yellow';
  return 'orange';
}

function finite(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

function round3(value: number): number {
  return Math.round(finite(value) * 1000) / 1000;
}

function shortHash(hash: string): string {
  return hash.slice(0, 12);
}
