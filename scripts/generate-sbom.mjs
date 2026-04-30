#!/usr/bin/env node
/**
 * Generate CycloneDX SBOMs (Software Bills of Materials) for the
 * publishable surface of the MCOP framework:
 *
 *   - docs/sbom/mcop-framework.cdx.json   — the root @kuonirad/mcop-framework
 *                                           Next.js app (entire workspace
 *                                           graph; recurse mode).
 *   - docs/sbom/mcop-core.cdx.json        — the published @kullailabs/mcop-core
 *                                           library (single workspace
 *                                           package; non-recursive).
 *
 * Both files are CycloneDX 1.6+ JSON, the same format consumed by
 * dependency-track / Snyk / GitHub's SBOM ingestion. Regenerate at any
 * time with `pnpm sbom`. The output directory is gitignored — re-run
 * before each publish (the recommended publish-workflow integration is
 * documented in `docs/sbom/README.md`).
 *
 * Tooling: `@cyclonedx/cdxgen` (multi-runtime, pnpm-lockfile-aware).
 * We deliberately do NOT use `@cyclonedx/cyclonedx-npm` because it
 * shells out to `npm ls`, which produces malformed output under pnpm
 * workspaces. cdxgen reads `pnpm-lock.yaml` directly and handles the
 * hoisted `node_modules` correctly.
 *
 * Exit codes:
 *   0  — at least one SBOM written (partial success is acceptable; see
 *        below)
 *   1  — cdxgen not installed or all targets failed
 */

import { spawnSync } from 'node:child_process';
import { mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const sbomDir = resolve(repoRoot, 'docs/sbom');

mkdirSync(sbomDir, { recursive: true });

/**
 * @typedef {Object} SbomTarget
 * @property {string} name      Human-readable target name.
 * @property {string} cwd       Directory to run cdxgen from.
 * @property {string} output    Absolute path to the output JSON file.
 * @property {boolean} recurse  Whether cdxgen should recurse into sub-packages.
 */

/** @type {SbomTarget[]} */
const targets = [
  {
    name: 'mcop-framework (root, recursive)',
    cwd: repoRoot,
    output: resolve(sbomDir, 'mcop-framework.cdx.json'),
    recurse: true,
  },
  {
    name: '@kullailabs/mcop-core (single package)',
    cwd: resolve(repoRoot, 'packages/core'),
    output: resolve(sbomDir, 'mcop-core.cdx.json'),
    recurse: false,
  },
];

let failed = 0;

for (const target of targets) {
  if (!existsSync(target.cwd)) {
    console.error(`sbom: missing cwd ${target.cwd}, skipping`);
    failed++;
    continue;
  }

  console.log(`sbom: generating CycloneDX for ${target.name}…`);
  const args = [
    'exec',
    'cdxgen',
    '-t',
    'pnpm',
    '--no-print',
    '-o',
    target.output,
  ];
  if (!target.recurse) args.push('--no-recurse');
  args.push(target.cwd);

  const result = spawnSync('pnpm', args, {
    cwd: repoRoot,
    stdio: ['ignore', 'inherit', 'inherit'],
  });

  if (result.error) {
    console.error(`sbom: failed to invoke cdxgen: ${result.error.message}`);
    console.error(
      'sbom: install with `pnpm add -Dw @cyclonedx/cdxgen` or rerun in a clean workspace.'
    );
    failed++;
    continue;
  }

  if (result.status !== 0) {
    console.error(`sbom: cdxgen exited ${result.status} for ${target.name}`);
    failed++;
    continue;
  }

  console.log(`sbom: wrote ${target.output}`);
}

if (failed === targets.length) {
  console.error(`sbom: all ${failed} target(s) failed.`);
  process.exit(1);
}

if (failed > 0) {
  console.warn(
    `sbom: ${failed} of ${targets.length} target(s) failed; ` +
      'the root SBOM is sufficient for downstream consumers.'
  );
  process.exit(0);
}

console.log('sbom: all targets written.');
