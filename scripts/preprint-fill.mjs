#!/usr/bin/env node
/**
 * Preprint fill-in script.
 *
 * Reads the deterministic benchmark manifest + the committed
 * results.json snapshot, and renders the placeholder spans in
 * `docs/benchmarks/preprint/{paper,submission}.md` into the
 * corresponding `*.filled.md` files inside `OUT_DIR`.
 *
 * Inputs:
 *   --manifest <path>   Path to manifest.json from the reproducible
 *                       bundle (default:
 *                       examples/reproducible-benchmark/out/manifest.json).
 *   --results <path>    Path to docs/benchmarks/results.json (default
 *                       repo location).
 *   --out <dir>         Output directory (default:
 *                       examples/reproducible-benchmark/out/preprint).
 *   --image-digest <s>  Optional Docker image digest. If absent the
 *                       <image-digest> span is filled with the literal
 *                       "unset — pass --image-digest" so it never silently
 *                       ships blank.
 *
 * Exit codes:
 *   0 — both files filled with no remaining placeholders.
 *   1 — manifest verdict != "pass" or any placeholder unresolved.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 2) {
    if (!argv[i].startsWith('--')) {
      throw new Error(`unexpected positional: ${argv[i]}`);
    }
    args[argv[i].slice(2)] = argv[i + 1];
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));

const manifestPath = resolve(
  repoRoot,
  args.manifest ?? 'examples/reproducible-benchmark/out/manifest.json',
);
const resultsPath = resolve(repoRoot, args.results ?? 'docs/benchmarks/results.json');
const outDir = resolve(
  repoRoot,
  args.out ?? 'examples/reproducible-benchmark/out/preprint',
);
const imageDigest = args['image-digest'] ?? 'unset — pass --image-digest';

if (!existsSync(manifestPath)) {
  console.error(`preprint-fill: manifest not found at ${manifestPath}`);
  console.error('Run the reproducible bundle first:');
  console.error(
    '  docker run --rm -v "$PWD/examples/reproducible-benchmark/out:/out" mcop-reproducible-benchmark',
  );
  process.exit(2);
}

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const results = JSON.parse(readFileSync(resultsPath, 'utf8'));

if (manifest.verdict !== 'pass') {
  console.error(`preprint-fill: refusing to fill — manifest.verdict = "${manifest.verdict}"`);
  console.error('Re-run the bundle and fix any drift before filling the preprint.');
  process.exit(1);
}

const bySummaryMode = Object.fromEntries(results.summary.map((s) => [s.mode, s]));
const human = bySummaryMode['human-only'];
const pureAi = bySummaryMode['pure-ai'];
const mcop = bySummaryMode['mcop-mediated'];

if (!human || !pureAi || !mcop) {
  console.error('preprint-fill: results.json missing one of the three required modes.');
  process.exit(1);
}

const gitSha = execSync('git rev-parse HEAD', { cwd: repoRoot }).toString().trim();
const manifestSha = createHash('sha256').update(readFileSync(manifestPath)).digest('hex');

/**
 * Placeholder → value map. Number values are formatted to two decimals
 * for the latency / triad / llm spans so the rendered prose stays
 * readable; integer cells (auditable counts etc.) come from elsewhere.
 */
const fmt = (n) => Number(n).toFixed(2);
const schemaVersion = (results.schema ?? 'mcop-benchmark/2.0').replace(/^mcop-benchmark\//, '');

const placeholders = {
  '<verified-at>': manifest.verifiedAt,
  '<sha256-bundle>': manifest.snapshot.sha256_regenerated,
  '<sha256-regenerated>': manifest.snapshot.sha256_regenerated,
  '<schema-version>': schemaVersion,
  '<git-sha>': gitSha,
  '<image-digest>': imageDigest,
  '<manifest-sha>': manifestSha,
  '<human-avg-latency-ms>': fmt(human.avgLatencyMs),
  '<human-avg-llm-ms>': fmt(human.avgLlmMs),
  '<pure-ai-avg-latency-ms>': fmt(pureAi.avgLatencyMs),
  '<pure-ai-avg-llm-ms>': fmt(pureAi.avgLlmMs),
  '<mcop-avg-latency-ms>': fmt(mcop.avgLatencyMs),
  '<mcop-avg-triad-ms>': fmt(mcop.avgTriadMs),
  '<mcop-avg-llm-ms>': fmt(mcop.avgLlmMs),
};

function fill(template) {
  let out = template;
  for (const [key, value] of Object.entries(placeholders)) {
    out = out.split(key).join(value);
  }
  return out;
}

mkdirSync(outDir, { recursive: true });

const targets = [
  {
    src: 'docs/benchmarks/preprint/paper.md',
    dst: 'paper.filled.md',
  },
  {
    src: 'docs/benchmarks/preprint/submission.md',
    dst: 'submission.filled.md',
  },
];

let unresolved = 0;
for (const t of targets) {
  const template = readFileSync(resolve(repoRoot, t.src), 'utf8');
  const filled = fill(template);
  // Any `<...>` span that survived substitution and looks like a
  // placeholder slot (lowercase, hyphen-only) is a fill miss.
  const remaining = filled.match(/<[a-z][a-z0-9-]+>/g) ?? [];
  if (remaining.length > 0) {
    console.error(`preprint-fill: ${t.src} has unresolved spans:`, [...new Set(remaining)]);
    unresolved += remaining.length;
  }
  const dstPath = join(outDir, t.dst);
  writeFileSync(dstPath, filled);
  console.log(`preprint-fill: wrote ${dstPath} (${filled.length} bytes)`);
}

if (unresolved > 0) {
  process.exit(1);
}

console.log('preprint-fill: OK — all placeholders resolved.');
console.log(`  Render PDF: pandoc ${join(outDir, 'paper.filled.md')} -o paper.pdf --pdf-engine=xelatex -V geometry:margin=1in`);
