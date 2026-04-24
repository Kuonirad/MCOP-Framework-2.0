#!/usr/bin/env node
// Cross-Language Parity Guardian — TypeScript side fingerprint CLI.
//
// Emits JSON on stdout matching the Python CLI in
// `mcop_package/mcop/triad.py`. The parity checker below runs both and
// diffs the `tensor_sha256` field: any drift across languages fails CI.

import { createHash } from 'node:crypto';

function encode(text, dimensions, normalize) {
  if (dimensions <= 0) throw new Error('dimensions must be positive');
  const digest = createHash('sha256').update(text, 'utf8').digest();
  const signed = new Float64Array(digest.length);
  for (let i = 0; i < digest.length; i++) signed[i] = (digest[i] / 255) * 2 - 1;

  const values = new Array(dimensions);
  for (let i = 0; i < dimensions; i++) values[i] = signed[i % digest.length];

  if (normalize) {
    // Sum over the final tensor values directly — parity across runtimes
    // requires identical accumulation order, and TS `Float64Array` vs
    // Python list rounding can diverge if we sum the hash bytes first.
    let sumSq = 0;
    for (let i = 0; i < dimensions; i++) sumSq += values[i] * values[i];
    const norm = Math.sqrt(sumSq) || 1;
    for (let i = 0; i < dimensions; i++) values[i] /= norm;
  }

  return values;
}

function estimateEntropy(tensor) {
  const n = tensor.length;
  if (!n) return 0;
  let s = 0;
  let sq = 0;
  for (let i = 0; i < n; i++) {
    const a = Math.abs(tensor[i]);
    s += a;
    sq += a * a;
  }
  const mean = s / n;
  const variance = Math.max(0, sq / n - mean * mean);
  return Math.min(1, variance);
}

function tensorSha256(tensor) {
  const buf = Buffer.from(new Float64Array(tensor).buffer);
  return createHash('sha256').update(buf).digest('hex');
}

function parseArgs(argv) {
  const args = { dimensions: 32, normalize: false, text: undefined };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dimensions') args.dimensions = Number(argv[++i]);
    else if (a === '--normalize') args.normalize = true;
    else if (args.text === undefined) args.text = a;
  }
  if (args.text === undefined) {
    process.stderr.write('Usage: triad-fingerprint.mjs <text> [--dimensions N] [--normalize]\n');
    process.exit(2);
  }
  return args;
}

const { text, dimensions, normalize } = parseArgs(process.argv.slice(2));
const tensor = encode(text, dimensions, normalize);
const result = {
  input: text,
  dimensions,
  normalized: normalize,
  entropy: estimateEntropy(tensor),
  tensor_sha256: tensorSha256(tensor),
};
process.stdout.write(JSON.stringify(result) + '\n');
