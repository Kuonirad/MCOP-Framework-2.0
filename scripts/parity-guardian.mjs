#!/usr/bin/env node
// Cross-Language Parity Guardian
//
// Runs the built npm package and Python public triad APIs over a matrix of
// test inputs and fails loudly on any divergence. The fingerprint also
// executes a fixed Stigmergy v5 + Holographic Etch fixture, so parity means
// the advertised triad rather than canonical JSON alone.

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');

const CASES = [
  { text: 'hello triad', dimensions: 16, normalize: false },
  { text: 'hello triad', dimensions: 16, normalize: true },
  { text: 'crystalline entropy', dimensions: 64, normalize: true },
  { text: 'Merkle pheromone', dimensions: 128, normalize: true },
  { text: '', dimensions: 8, normalize: false },
];

function runTs({ text, dimensions, normalize }) {
  const args = [join(REPO_ROOT, 'scripts/triad-fingerprint.mjs'), text, '--dimensions', String(dimensions)];
  if (normalize) args.push('--normalize');
  const out = spawnSync('node', args, { encoding: 'utf8' });
  if (out.status !== 0) {
    throw new Error(`TS CLI failed (exit ${out.status}): ${out.stderr}`);
  }
  return JSON.parse(out.stdout);
}

function runPy({ text, dimensions, normalize }) {
  const args = ['-m', 'mcop.triad', text, '--dimensions', String(dimensions)];
  if (normalize) args.push('--normalize');
  // Prefer the interpreter selected on PATH on Windows. The `py` launcher can
  // legitimately point at a different installation whose site-packages do not
  // contain the hash-pinned parity dependency installed for `python`.
  const commands = process.platform === 'win32' ? ['python', 'py', 'python3'] : ['python3', 'python'];
  let lastUnavailable;
  for (const command of commands) {
    const commandArgs = command === 'py' ? ['-3', ...args] : args;
    const out = spawnSync(command, commandArgs, {
      encoding: 'utf8',
      cwd: join(REPO_ROOT, 'mcop_package'),
    });
    const unavailable =
      out.error?.code === 'ENOENT' ||
      (out.status === 9009 && /Python was not found/i.test(out.stderr));
    if (!unavailable) {
      if (out.status !== 0) {
        throw new Error(`Python CLI failed via ${command} (exit ${out.status}): ${out.stderr}`);
      }
      return JSON.parse(out.stdout);
    }
    lastUnavailable = out.stderr || out.error?.message;
  }
  throw new Error(`Python CLI unavailable: ${lastUnavailable}`);
}

function valueAt(value, path) {
  return path.split('.').reduce((current, part) => current?.[part], value);
}

function compare(a, b) {
  const fields = [
    'input',
    'dimensions',
    'normalized',
    'entropy',
    'tensor_sha256',
    'triad_protocol_version',
    'stigmergy.trace_id',
    'stigmergy.trace_hash',
    'stigmergy.weight',
    'stigmergy.merkle_root',
    'stigmergy.resonance_score',
    'stigmergy.threshold_used',
    'stigmergy.positive_feedback_score',
    'holographic_etch.hash',
    'holographic_etch.delta_weight',
    'holographic_etch.flourishing_score',
    'holographic_etch.propagation_hint',
    'optional_fields.trace_hash',
    'optional_fields.etch_hash',
    'embedding.tensor_sha256',
    'unicode_policy.tensor_sha256',
    'noise_floor.candidate_1',
    'noise_floor.candidate_8',
    'growth_ledger.hash',
    'growth_ledger.contributor_joy',
    'growth_ledger.growth_events',
    'growth_ledger.merkle_root',
  ];
  for (const field of fields) {
    const ts = valueAt(a, field);
    const py = valueAt(b, field);
    // Float fields must be bit-identical too: both ports deliberately perform
    // the same IEEE-754 operations in the same order.
    if (!Object.is(ts, py)) return { field, ts, py };
  }
  return null;
}

let failures = 0;
for (const c of CASES) {
  const ts = runTs(c);
  const py = runPy(c);
  const diff = compare(ts, py);
  if (diff) {
    failures++;
    process.stderr.write(
      `PARITY FAIL: ${JSON.stringify(c)} diverged on ${diff.field} (ts=${diff.ts}, py=${diff.py})\n`,
    );
  } else {
    process.stdout.write(
      `ok ${JSON.stringify(c)} -> tensor=${ts.tensor_sha256.slice(0, 16)}... ` +
      `trace=${ts.stigmergy.trace_hash.slice(0, 16)}... ` +
      `etch=${ts.holographic_etch.hash.slice(0, 16)}...\n`,
    );
  }
}

if (failures > 0) {
  process.stderr.write(`Parity Guardian: ${failures} divergence(s) detected\n`);
  process.exit(1);
}
process.stdout.write(`Parity Guardian: ${CASES.length} cases verified\n`);
