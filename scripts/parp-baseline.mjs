#!/usr/bin/env node
/**
 * Phoenix Audit & Remediation Protocol — L0 baseline runner.
 *
 * Encapsulates the L0 audit sequence defined in docs/audits/PARP-v1.0.md so
 * future executions are reproducible from a single command:
 *
 *   pnpm audit:parp-baseline
 *
 * Side effects:
 *   - Captures stdout/stderr of every audit command into ./artefacts/L0-*.log
 *   - Snapshots open + dismissed GitHub Code Scanning alerts into
 *     ./artefacts/L1-code-scanning-alerts-{open,dismissed}.json (skipped if
 *     `gh` is unavailable or unauthenticated; emits a friendly note instead).
 *   - Runs a debt-marker grep sweep into ./artefacts/L1-debt-markers*.txt
 *
 * Exit codes:
 *   0 — every audit command exited cleanly (or only with documented baseline
 *       warnings such as `audit:claims` claim-drift WARNs).
 *   1 — at least one audit command failed unexpectedly.
 *
 * This script does NOT remediate findings. Remediation goes in focused
 * `fix/parp-<id>-*` PRs per PARP §1 L5.
 */

import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(process.cwd());
const ARTEFACTS = resolve(ROOT, 'artefacts');
mkdirSync(ARTEFACTS, { recursive: true });

function logHeader(label) {
  process.stdout.write(`\n=== PARP L0 :: ${label} ===\n`);
}

function runCaptured(label, file, cmd, args, { failFast = false, env } = {}) {
  logHeader(label);
  const start = Date.now();
  const result = spawnSync(cmd, args, {
    cwd: ROOT,
    env: { ...process.env, ...(env ?? {}) },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const elapsedMs = Date.now() - start;
  const stdout = result.stdout ?? '';
  const stderr = result.stderr ?? '';
  const exitCode = result.status ?? -1;
  const body = [
    `# ${label}`,
    `# command: ${cmd} ${args.join(' ')}`,
    `# exit_code: ${exitCode}`,
    `# elapsed_ms: ${elapsedMs}`,
    '',
    '## stdout',
    stdout,
    '## stderr',
    stderr,
  ].join('\n');
  writeFileSync(resolve(ARTEFACTS, file), body);
  process.stdout.write(`  exit=${exitCode}  elapsed=${(elapsedMs / 1000).toFixed(1)}s  log=artefacts/${file}\n`);
  if (failFast && exitCode !== 0) {
    process.stderr.write(`\nPARP baseline aborting — ${label} exited ${exitCode}. See artefacts/${file}.\n`);
    process.exit(1);
  }
  return { exitCode, elapsedMs, stdout, stderr };
}

function runStream(label, file, cmd, args) {
  // For long-running pnpm scripts we let pnpm stream to the terminal AND we
  // re-run capturing through the spawned process. To keep this simple, we
  // capture (no live stream) — the script is intended for CI / agent use.
  return runCaptured(label, file, cmd, args);
}

// L0.00 — environment baseline
const baselineMeta = [
  `head_commit=${spawnSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).stdout.trim()}`,
  `branch=${spawnSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).stdout.trim()}`,
  `timestamp=${new Date().toISOString()}`,
  `node=${process.version}`,
  `platform=${process.platform}-${process.arch}`,
].join('\n');
writeFileSync(resolve(ARTEFACTS, 'baseline-meta.txt'), baselineMeta + '\n');
process.stdout.write(`Captured artefacts/baseline-meta.txt\n${baselineMeta}\n`);

// L0.01 — pnpm install (frozen lockfile per PARP §1 L0)
const installResult = runStream(
  'L0.01 pnpm install --frozen-lockfile',
  'L0-01-pnpm-install.log',
  'pnpm',
  ['install', '--frozen-lockfile'],
);

// L0.02 — git status snapshot
const gitStatus = spawnSync('git', ['status', '--porcelain'], { cwd: ROOT, encoding: 'utf8' });
writeFileSync(resolve(ARTEFACTS, 'L0-02-git-status.log'), gitStatus.stdout ?? '');
process.stdout.write(`Captured artefacts/L0-02-git-status.log (${(gitStatus.stdout ?? '').split('\n').length - 1} lines)\n`);

// L0.03 — pnpm verify
const verifyResult = runStream('L0.03 pnpm verify', 'L0-03-pnpm-verify.log', 'pnpm', ['verify']);

// L0.04 — pnpm positive:audit
const positiveResult = runStream('L0.04 pnpm positive:audit', 'L0-04-pnpm-positive-audit.log', 'pnpm', ['positive:audit']);

// L0.05 — pnpm self:audit
const selfResult = runStream('L0.05 pnpm self:audit', 'L0-05-pnpm-self-audit.log', 'pnpm', ['self:audit']);

// L0.06 — pnpm deps:audit
const depsResult = runStream('L0.06 pnpm deps:audit', 'L0-06-pnpm-deps-audit.log', 'pnpm', ['deps:audit']);

// L0.07 — pnpm audit:claims  (baseline FAIL for cypress:run when no dev server
// is up; this is a known infrastructure precondition documented in
// docs/audits/PARP-v1.0.md §3.)
const claimsResult = runStream('L0.07 pnpm audit:claims', 'L0-07-pnpm-audit-claims.log', 'pnpm', ['audit:claims']);

// L0.08 — GitHub Code Scanning queue snapshot
function snapshotCodeScanning() {
  logHeader('L0.08 code-scanning queue snapshot');
  const ghCheck = spawnSync('gh', ['--version'], { encoding: 'utf8' });
  if (ghCheck.status !== 0) {
    const note = '# gh CLI not available — skipping code-scanning snapshot. Install gh or run the snapshot manually:\n#   gh api /repos/Kuonirad/MCOP-Framework-2.0/code-scanning/alerts -F state=open -F per_page=100 --paginate\n';
    writeFileSync(resolve(ARTEFACTS, 'L1-code-scanning-fetch.err'), note);
    process.stdout.write(`  skipped — wrote artefacts/L1-code-scanning-fetch.err\n`);
    return { exitCode: 0, skipped: true };
  }
  for (const state of ['open', 'dismissed']) {
    const out = spawnSync(
      'gh',
      [
        'api', '-X', 'GET',
        '/repos/Kuonirad/MCOP-Framework-2.0/code-scanning/alerts',
        '-F', `state=${state}`, '-F', 'per_page=100', '--paginate',
      ],
      { encoding: 'utf8' },
    );
    const target = resolve(ARTEFACTS, `L1-code-scanning-alerts-${state}.json`);
    writeFileSync(target, out.stdout ?? '[]');
    process.stdout.write(`  ${state}: exit=${out.status} -> artefacts/L1-code-scanning-alerts-${state}.json\n`);
    if (out.status !== 0) {
      writeFileSync(
        resolve(ARTEFACTS, 'L1-code-scanning-fetch.err'),
        (out.stderr ?? '') + `\n# command failed: gh api … state=${state}\n`,
      );
    }
  }
  return { exitCode: 0, skipped: false };
}
const codeScanningResult = snapshotCodeScanning();

// L0.09 — debt-marker grep sweep (per PARP §1 L0 step 6)
function debtSweep() {
  logHeader('L0.09 debt-marker grep sweep');
  const pattern = '(TODO|FIXME|BUG|HACK|XXX|OPTIMIZE|DEPRECATED|WORKAROUND)';
  const includes = ['*.ts', '*.tsx', '*.py', '*.js', '*.mjs', '*.cjs'].flatMap(g => ['--include', g]);
  const roots = ['src/', 'tests/', 'scripts/', 'mcop_cuda_server/', 'mcop_package/', 'packages/'].filter(p => existsSync(resolve(ROOT, p)));
  const grep = spawnSync('grep', ['-rniE', pattern, ...includes, ...roots], { encoding: 'utf8' });
  const filtered = (grep.stdout ?? '')
    .split('\n')
    .filter(line => line && !/(^|\/)dist\//.test(line) && !/node_modules/.test(line))
    .join('\n');
  writeFileSync(resolve(ARTEFACTS, 'L1-debt-markers.txt'), filtered + (filtered ? '\n' : ''));
  const highSignal = filtered
    .split('\n')
    .filter(line => /\b(TODO|FIXME|XXX|HACK|WORKAROUND|DEPRECATED)\b/.test(line))
    .join('\n');
  writeFileSync(resolve(ARTEFACTS, 'L1-debt-markers-high-signal.txt'), highSignal + (highSignal ? '\n' : ''));
  const totalHits = filtered ? filtered.split('\n').length : 0;
  const highSignalHits = highSignal ? highSignal.split('\n').length : 0;
  process.stdout.write(`  total-hits=${totalHits} (artefacts/L1-debt-markers.txt)\n`);
  process.stdout.write(`  high-signal-hits=${highSignalHits} (artefacts/L1-debt-markers-high-signal.txt)\n`);
  return { totalHits, highSignalHits };
}
const debt = debtSweep();

// Roll-up
logHeader('L0 roll-up');
const steps = [
  ['L0.01 pnpm install',        installResult.exitCode],
  ['L0.03 pnpm verify',         verifyResult.exitCode],
  ['L0.04 pnpm positive:audit', positiveResult.exitCode],
  ['L0.05 pnpm self:audit',     selfResult.exitCode],
  ['L0.06 pnpm deps:audit',     depsResult.exitCode],
  ['L0.07 pnpm audit:claims',   claimsResult.exitCode],
  ['L0.08 code-scanning snapshot', codeScanningResult.exitCode],
];
const failed = steps.filter(([, code]) => code !== 0 && code !== null);
for (const [label, code] of steps) process.stdout.write(`  ${label}  exit=${code}\n`);
process.stdout.write(`  debt-markers: total=${debt.totalHits} high-signal=${debt.highSignalHits}\n`);

if (failed.length === 0) {
  process.stdout.write('\nPARP L0 baseline: clean.\n');
  process.exit(0);
}
// audit:claims is known to fail at the baseline because cypress:run needs a
// dev server; gate on whether anything ELSE failed.
const onlyAuditClaims = failed.length === 1 && failed[0][0] === 'L0.07 pnpm audit:claims';
if (onlyAuditClaims) {
  process.stdout.write('\nPARP L0 baseline: completed with documented audit:claims baseline failure (cypress:run, see docs/audits/PARP-v1.0.md §3).\n');
  process.exit(0);
}
process.stderr.write('\nPARP L0 baseline: one or more audit steps failed unexpectedly. See artefacts/ logs.\n');
process.exit(1);
