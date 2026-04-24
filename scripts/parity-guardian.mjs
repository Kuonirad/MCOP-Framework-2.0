#!/usr/bin/env node
// Cross-Language Parity Guardian
//
// Runs the TS and Python triad fingerprint CLIs over a matrix of test
// inputs and fails loudly on any divergence. Intended to run in CI
// alongside the Python and Node tests — drift between the two
// implementations becomes impossible to merge.

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
  const out = spawnSync('python3', args, {
    encoding: 'utf8',
    cwd: join(REPO_ROOT, 'mcop_package'),
  });
  if (out.status !== 0) {
    throw new Error(`Python CLI failed (exit ${out.status}): ${out.stderr}`);
  }
  return JSON.parse(out.stdout);
}

function compare(a, b) {
  const fields = ['input', 'dimensions', 'normalized', 'tensor_sha256'];
  for (const f of fields) {
    if (a[f] !== b[f]) return { field: f, ts: a[f], py: b[f] };
  }
  // Entropy is a float; require bit-identical equality because both ports
  // perform the same sequence of operations in IEEE-754 order.
  if (!Object.is(a.entropy, b.entropy)) {
    return { field: 'entropy', ts: a.entropy, py: b.entropy };
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
      `ok ${JSON.stringify(c)} -> ${ts.tensor_sha256.slice(0, 16)}...\n`,
    );
  }
}

if (failures > 0) {
  process.stderr.write(`Parity Guardian: ${failures} divergence(s) detected\n`);
  process.exit(1);
}
process.stdout.write(`Parity Guardian: ${CASES.length} cases verified\n`);
