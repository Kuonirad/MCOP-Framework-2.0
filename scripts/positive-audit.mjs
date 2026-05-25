#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const checks = [
  ['TypeScript app resonance', ['pnpm', ['exec', 'tsc', '-p', 'tsconfig.json', '--pretty', 'false']]],
  ['TypeScript core resonance', ['pnpm', ['--filter', '@kullailabs/mcop-core', 'exec', 'tsc', '-p', 'tsconfig.json', '--pretty', 'false']]],
  ['Lint resonance', ['pnpm', ['lint']]],
  ['Test resonance', ['pnpm', ['test', '--', '--runInBand']]],
  ['Parity resonance', ['pnpm', ['parity:check']]],
  ['Documentation resonance', ['pnpm', ['docs:guard']]],
  ['Placement resonance', ['pnpm', ['audit:placement']]],
  ['SBOM generation resonance', ['pnpm', ['sbom']]],
  ['SBOM validation resonance', ['pnpm', ['sbom:validate']]],
];

const checksPath = join(root, 'audit', 'positive-audit-checks.json');
const signalsPath = join(root, 'audit', 'positive-impact-signals.json');
const reportPath = join(root, 'docs', 'POSITIVE_IMPACT_REPORT.md');
const badgePath = join(root, 'docs', 'badges', 'positive-impact.svg');

function runAudit() {
  const startedAt = new Date().toISOString();
  const results = [];

  for (const [label, [command, args]] of checks) {
    const started = Date.now();
    const result = spawnSync(command, args, {
      cwd: root,
      env: { ...process.env, POSITIVE_AUDIT_CHILD: '1' },
      encoding: 'utf8',
      stdio: 'pipe',
    });
    const durationMs = Date.now() - started;
    const passed = result.status === 0;
    results.push({
      label,
      command: `${command} ${args.join(' ')}`,
      passed,
      durationMs,
      output: [result.stdout, result.stderr].filter(Boolean).join('\n').slice(-4000),
    });
    process.stdout.write(`${passed ? '✨' : '⚠️'} ${label} (${durationMs}ms)\n`);
    if (!passed) {
      process.stdout.write(results.at(-1).output + '\n');
      writePositiveImpactReport(results, startedAt);
      process.exit(result.status ?? 1);
    }
  }

  writePositiveImpactReport(results, startedAt);
  process.stdout.write('🌱 Positive Impact Report generated.\n');
}

function writePositiveImpactReport(checkResults, capturedAt) {
  const passed = checkResults.filter((result) => result.passed).length;
  const total = checkResults.length;
  const score = total === 0 ? 0 : Math.round((passed / total) * 100);

  // Phase 1 of the operational positive-impact recursion: route the live
  // check results through the MCOP kernels (NOVA-NEO, Holographic Etch,
  // PositiveResonanceAmplifier, Proteome) and let the report cite the actual
  // scoring events it was generated from. The auditor is TypeScript, so we
  // execute it through Jest — the same vehicle `benchmark:refresh` uses to run
  // typed code at script time without a separate build pipeline.
  const audit = generateImpactSignals(checkResults, capturedAt);

  mkdirSync(dirname(reportPath), { recursive: true });
  mkdirSync(dirname(badgePath), { recursive: true });
  writeFileSync(reportPath, renderReport({ capturedAt, score, checkResults, audit }));
  writeFileSync(badgePath, renderBadge(score));
}

/**
 * Captures the live check matrix, runs the Impact Auditor over it via Jest,
 * and returns the primitive-derived signals. Returns `null` (and the report
 * falls back to a verification-only view) if the auditor cannot run — we never
 * fabricate metrics.
 */
function generateImpactSignals(checkResults, capturedAt) {
  try {
    mkdirSync(dirname(checksPath), { recursive: true });
    writeFileSync(
      checksPath,
      `${JSON.stringify(
        {
          capturedAt,
          checks: checkResults.map(({ label, command, passed, durationMs }) => ({
            label,
            command,
            passed,
            durationMs,
          })),
        },
        null,
        2,
      )}\n`,
    );

    const jestBin = join(root, 'node_modules', 'jest', 'bin', 'jest.js');
    if (!existsSync(jestBin)) return null;
    const gen = spawnSync(
      process.execPath,
      [jestBin, '--runInBand', '--silent', '--testPathPatterns', 'impactAuditor'],
      {
        cwd: root,
        env: { ...process.env, POSITIVE_IMPACT_GENERATE: '1', POSITIVE_AUDIT_CHILD: '1' },
        encoding: 'utf8',
        stdio: 'pipe',
      },
    );
    if (gen.status !== 0 || !existsSync(signalsPath)) return null;
    return JSON.parse(readFileSync(signalsPath, 'utf8'));
  } catch {
    return null;
  }
}

function renderReport({ capturedAt, score, checkResults, audit }) {
  const verificationRows = checkResults
    .map((result) => {
      const signal = audit?.checks?.find((c) => c.label === result.label);
      const hint = signal ? signal.propagationHint : '—';
      const domain = signal ? signal.domain : '—';
      return `| ${result.label} | ${result.passed ? 'Radiating' : 'Needs positive attention'} | ${domain} | ${hint} | \`${result.command}\` | ${result.durationMs} |`;
    })
    .join('\n');

  const header =
    `# Positive Impact Report\n\n` +
    `Generated: ${capturedAt}\n\n` +
    `This report is Positive Building of reproducible trust. It records the local\n` +
    `suite that keeps MCOP-Framework-2.0 joyful, adoptable, and provenance-rich.\n\n`;

  const metricsBlock = audit
    ? renderPrimitiveMetrics(audit, score)
    : renderFallbackMetrics(score);

  const verificationBlock =
    `## Verification resonance\n\n` +
    `| Layer | State | Domain | Propagation | Command | Duration ms |\n` +
    `|:---|:---|:---|:---|:---|---:|\n${verificationRows}\n`;

  const citationsBlock = audit ? renderCitations(audit) : '';

  return header + metricsBlock + verificationBlock + citationsBlock;
}

function renderPrimitiveMetrics(audit, score) {
  const m = audit.metrics;
  const substrate = audit.substrate
    ? `| Substrate equilibrium (Proteome) | ${round(audit.substrate.equilibriumScore)} |\n`
    : '';
  return (
    `These metrics are **executed by MCOP primitives**, not declared. The live\n` +
    `verification results were encoded by NOVA-NEO, scored as eudaimonic etches by\n` +
    `Holographic Etch, recorded as Merkle-chained growth events by the\n` +
    `PositiveResonanceAmplifier, and conditioned a Proteome substrate. See the\n` +
    `MCOP kernel citations below for the exact scoring events.\n\n` +
    `| Metric | Value |\n|:---|---:|\n` +
    `| Positive impact score | ${score}% |\n` +
    `| Contributor joy | ${round(m.contributorJoy)} |\n` +
    `| Adoption velocity | ${round(m.adoptionVelocity)} |\n` +
    `| Beneficial outcome amplification | ${round(m.beneficialOutcomeAmplification)} |\n` +
    `| Growth events | ${m.growthEvents} |\n` +
    substrate +
    `| Growth ledger Merkle root | \`${m.merkleRoot ?? 'n/a'}\` |\n\n`
  );
}

function renderFallbackMetrics(score) {
  return (
    `> ⚠️ Primitive-derived signals were unavailable this run (the Impact Auditor\n` +
    `> could not be executed). Only the verification resonance below is reported;\n` +
    `> no impact metrics are fabricated.\n\n` +
    `| Metric | Value |\n|:---|---:|\n` +
    `| Positive impact score | ${score}% |\n\n`
  );
}

function renderCitations(audit) {
  if (!Array.isArray(audit.citations) || audit.citations.length === 0) return '';
  const rows = audit.citations
    .map((c) => `| ${c.kernel} | ${c.signal} | \`${shortHash(c.hash)}\` | ${c.backs} |`)
    .join('\n');
  return (
    `\n## MCOP kernel citations\n\n` +
    `Each row is operational evidence — a real scoring event or Merkle root the\n` +
    `report above was generated from.\n\n` +
    `| Kernel | Signal | Hash | Backs |\n|:---|:---|:---|:---|\n${rows}\n`
  );
}

function shortHash(hash) {
  if (typeof hash !== 'string') return 'n/a';
  return hash.length > 20 ? `${hash.slice(0, 16)}…${hash.slice(-4)}` : hash;
}

function renderBadge(score) {
  const label = 'positive impact';
  const value = `${score}%`;
  const labelWidth = 104;
  const valueWidth = 48;
  const width = labelWidth + valueWidth;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="20" role="img" aria-label="${label}: ${value}">\n` +
    `<linearGradient id="s" x2="0" y2="100%"><stop offset="0" stop-color="#bbb" stop-opacity=".1"/><stop offset="1" stop-opacity=".1"/></linearGradient>\n` +
    `<clipPath id="r"><rect width="${width}" height="20" rx="3" fill="#fff"/></clipPath>\n` +
    `<g clip-path="url(#r)"><rect width="${labelWidth}" height="20" fill="#0d1117"/><rect x="${labelWidth}" width="${valueWidth}" height="20" fill="#00ff88"/><rect width="${width}" height="20" fill="url(#s)"/></g>\n` +
    `<g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" text-rendering="geometricPrecision" font-size="110">\n` +
    `<text aria-hidden="true" x="${labelWidth * 5}" y="150" fill="#010101" fill-opacity=".3" transform="scale(.1)" textLength="${(labelWidth - 10) * 10}">${label}</text>\n` +
    `<text x="${labelWidth * 5}" y="140" transform="scale(.1)" fill="#fff" textLength="${(labelWidth - 10) * 10}">${label}</text>\n` +
    `<text aria-hidden="true" x="${(labelWidth + valueWidth / 2) * 10}" y="150" fill="#010101" fill-opacity=".3" transform="scale(.1)" textLength="${(valueWidth - 10) * 10}">${value}</text>\n` +
    `<text x="${(labelWidth + valueWidth / 2) * 10}" y="140" transform="scale(.1)" fill="#0d1117" textLength="${(valueWidth - 10) * 10}">${value}</text>\n` +
    `</g>\n</svg>\n`;
}

function round(value) {
  return Math.round(value * 1000) / 1000;
}

export { renderReport, renderBadge };

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  runAudit();
}
