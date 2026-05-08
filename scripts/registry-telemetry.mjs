#!/usr/bin/env node
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { argv, exit } from 'node:process';

const execFileAsync = promisify(execFile);

const DEFAULT_TARGETS = [
  {
    ecosystem: 'npm',
    packageName: '@kullailabs/mcop-core',
    registryUrl: 'https://registry.npmjs.org/@kullailabs%2fmcop-core',
    downloadsUrl: 'https://api.npmjs.org/downloads/point/last-month/@kullailabs/mcop-core',
  },
  {
    ecosystem: 'pypi',
    packageName: 'mcop',
    registryUrl: 'https://pypi.org/pypi/mcop/json',
  },
];

function parseArgs(args) {
  const parsed = { fixture: undefined, pretty: false };
  for (let index = 2; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--pretty') {
      parsed.pretty = true;
    } else if (arg === '--fixture') {
      parsed.fixture = args[index + 1];
      index += 1;
    } else if (arg.startsWith('--fixture=')) {
      parsed.fixture = arg.slice('--fixture='.length);
    } else if (arg === '--help' || arg === '-h') {
      parsed.help = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return parsed;
}

function usage() {
  return `Usage: node scripts/registry-telemetry.mjs [--pretty] [--fixture path/to/fixture.json]\n\nFetches public npm/PyPI release metadata and npm last-month downloads for MCOP packages.\nPyPI download counts are reported as unavailable because the JSON API does not expose real install metrics.`;
}

async function fetchJson(url) {
  try {
    const response = await fetch(url, { headers: { accept: 'application/json' } });
    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}`);
    }
    return response.json();
  } catch (fetchError) {
    const { stdout } = await execFileAsync('curl', [
      '--fail',
      '--silent',
      '--show-error',
      '--location',
      '--max-time',
      '20',
      url,
    ]);
    try {
      return JSON.parse(stdout);
    } catch (parseError) {
      throw new Error(`${fetchError.message}; curl fallback returned non-JSON: ${parseError.message}`);
    }
  }
}

function normalizeNpmRegistry(target, registry, downloads) {
  const versions = Object.keys(registry.versions ?? {});
  const latest = registry['dist-tags']?.latest ?? null;
  return {
    ecosystem: target.ecosystem,
    packageName: target.packageName,
    published: true,
    latestVersion: latest,
    versionCount: versions.length,
    latestPublishedAt: latest ? (registry.time?.[latest] ?? null) : null,
    downloads: downloads
      ? {
          period: 'last-month',
          count: downloads.downloads,
          start: downloads.start,
          end: downloads.end,
          source: 'npm downloads API',
        }
      : null,
    limitations: [],
  };
}

function normalizePyPiRegistry(target, registry) {
  return {
    ecosystem: target.ecosystem,
    packageName: target.packageName,
    published: true,
    latestVersion: registry.info?.version ?? null,
    versionCount: Object.keys(registry.releases ?? {}).length,
    latestPublishedAt: null,
    downloads: null,
    limitations: [
      'PyPI JSON metadata does not expose reliable download/install counts; use BigQuery, pepy.tech, or provider analytics for independent install metrics.',
    ],
  };
}

async function collectLiveTelemetry(targets = DEFAULT_TARGETS) {
  const packages = [];
  for (const target of targets) {
    try {
      const registry = await fetchJson(target.registryUrl);
      if (target.ecosystem === 'npm') {
        const downloads = target.downloadsUrl ? await fetchJson(target.downloadsUrl) : null;
        packages.push(normalizeNpmRegistry(target, registry, downloads));
      } else if (target.ecosystem === 'pypi') {
        packages.push(normalizePyPiRegistry(target, registry));
      }
    } catch (error) {
      packages.push({
        ecosystem: target.ecosystem,
        packageName: target.packageName,
        published: false,
        latestVersion: null,
        versionCount: 0,
        latestPublishedAt: null,
        downloads: null,
        limitations: [`Registry lookup failed: ${error.message}`],
      });
    }
  }
  return {
    generatedAt: new Date().toISOString(),
    packages,
  };
}

async function collectFixtureTelemetry(fixturePath) {
  const raw = await readFile(fixturePath, 'utf8');
  const fixture = JSON.parse(raw);
  return {
    generatedAt: fixture.generatedAt ?? 'fixture',
    packages: fixture.packages,
  };
}

async function main() {
  const args = parseArgs(argv);
  if (args.help) {
    console.log(usage());
    return;
  }

  const report = args.fixture
    ? await collectFixtureTelemetry(args.fixture)
    : await collectLiveTelemetry();

  console.log(JSON.stringify(report, null, args.pretty ? 2 : 0));
}

main().catch((error) => {
  console.error(error.message);
  exit(1);
});

export {
  DEFAULT_TARGETS,
  collectFixtureTelemetry,
  collectLiveTelemetry,
  normalizeNpmRegistry,
  normalizePyPiRegistry,
  parseArgs,
};
