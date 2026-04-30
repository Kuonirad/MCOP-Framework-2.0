#!/usr/bin/env node
/**
 * Generate CycloneDX SBOMs (Software Bills of Materials) for the
 * publishable surface of the MCOP framework:
 *
 *   - docs/sbom/mcop-framework.cdx.json   — the root @kuonirad/mcop-framework
 *                                           Next.js app (runtime deps only).
 *   - docs/sbom/mcop-core.cdx.json        — the published @kullailabs/mcop-core
 *                                           library (runtime deps only).
 *
 * Both files are CycloneDX 1.6 JSON, the same format consumed by
 * dependency-track / Snyk / GitHub's SBOM ingestion. Regenerate at any
 * time with `pnpm sbom`. The output directory is gitignored — re-run
 * before each publish (the recommended publish-workflow integration is
 * documented in `docs/sbom/README.md`).
 *
 * Why `--ignore-npm-errors`: this is a pnpm-workspaces repo, but
 * `@cyclonedx/cyclonedx-npm` shells out to `npm ls` for its dependency
 * graph. `npm ls` flags some dev-only sub-deps as "missing" because pnpm
 * has hoisted them differently from npm's flat tree. The errors are
 * cosmetic and the resulting SBOM is correct for the runtime tree
 * (`--omit dev`).
 *
 * Exit codes:
 *   0  — both SBOMs written
 *   1  — cyclonedx-npm not installed or generation failed
 */

import { spawnSync } from 'node:child_process';
import { mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const sbomDir = resolve(repoRoot, 'docs/sbom');

mkdirSync(sbomDir, { recursive: true });

/** @type {Array<{ name: string, manifest: string, output: string }>} */
const targets = [
  {
    name: 'mcop-framework (root)',
    manifest: resolve(repoRoot, 'package.json'),
    output: resolve(sbomDir, 'mcop-framework.cdx.json'),
  },
  {
    name: '@kullailabs/mcop-core',
    manifest: resolve(repoRoot, 'packages/core/package.json'),
    output: resolve(sbomDir, 'mcop-core.cdx.json'),
  },
];

let failed = 0;

for (const target of targets) {
  if (!existsSync(target.manifest)) {
    console.error(`sbom: missing manifest ${target.manifest}, skipping`);
    failed++;
    continue;
  }

  console.log(`sbom: generating CycloneDX for ${target.name}…`);
  const result = spawnSync(
    'pnpm',
    [
      'exec',
      'cyclonedx-npm',
      '--ignore-npm-errors',
      '--omit',
      'dev',
      '--output-format',
      'JSON',
      '--output-file',
      target.output,
      '--',
      target.manifest,
    ],
    {
      cwd: repoRoot,
      stdio: ['ignore', 'inherit', 'inherit'],
    }
  );

  if (result.error) {
    console.error(`sbom: failed to invoke cyclonedx-npm: ${result.error.message}`);
    console.error(
      'sbom: install with `pnpm add -Dw @cyclonedx/cyclonedx-npm` or rerun in a clean workspace.'
    );
    failed++;
    continue;
  }

  if (result.status !== 0) {
    console.error(`sbom: cyclonedx-npm exited ${result.status} for ${target.name}`);
    failed++;
    continue;
  }

  console.log(`sbom: wrote ${target.output}`);
}

if (failed > 0) {
  console.error(`sbom: ${failed} target(s) failed.`);
  process.exit(1);
}

console.log('sbom: all targets written.');
