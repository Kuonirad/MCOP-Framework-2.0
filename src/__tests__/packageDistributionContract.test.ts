import { readdirSync, readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';

import * as publicCore from '../../packages/core/src';

interface PackageJson {
  name: string;
  private?: boolean;
  publishConfig?: {
    access?: string;
    provenance?: boolean;
    registry?: string;
  };
  exports?: Record<string, unknown>;
}

const REPO_ROOT = resolve(__dirname, '..', '..');

function readText(path: string): string {
  return readFileSync(resolve(REPO_ROOT, path), 'utf8');
}

function readPackageJson(path: string): PackageJson {
  return JSON.parse(readText(path)) as PackageJson;
}

function fencedCode(markdown: string): string {
  return (markdown.match(/```[\s\S]*?```/g) ?? []).join('\n');
}

function currentDocumentationPaths(directory = resolve(REPO_ROOT, 'docs')): string[] {
  const paths: string[] = [];

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolutePath = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      paths.push(...currentDocumentationPaths(absolutePath));
      continue;
    }
    if (!entry.name.endsWith('.md')) continue;

    const repositoryPath = relative(REPO_ROOT, absolutePath).replace(/\\/g, '/');
    if (repositoryPath === 'docs/DESKTOP_APP.md') continue;
    if (repositoryPath.startsWith('docs/releases/')) continue;
    if (repositoryPath.startsWith('docs/audits/')) continue;
    paths.push(repositoryPath);
  }

  return paths;
}

describe('package distribution contract', () => {
  const rootPackage = readPackageJson('package.json');
  const corePackage = readPackageJson('packages/core/package.json');
  const rootReadme = readText('README.md');
  const coreReadme = readText('packages/core/README.md');
  const monorepoGuide = readText('docs/MONOREPO.md');
  const ciWorkflow = readText('.github/workflows/ci.yml');

  it('keeps the monorepo application private and the core library public', () => {
    expect(rootPackage).toMatchObject({
      name: '@kuonirad/mcop-framework',
      private: true,
    });
    expect(corePackage).toMatchObject({
      name: '@kullailabs/mcop-core',
      publishConfig: {
        access: 'public',
        provenance: true,
        registry: 'https://registry.npmjs.org/',
      },
    });
    expect(corePackage.private).not.toBe(true);
  });

  it('allows only the documented package-root code entry point', () => {
    expect(corePackage.exports).toEqual({
      '.': {
        types: './dist/index.d.ts',
        import: './dist/index.js',
        require: './dist/index.cjs',
      },
      './package.json': './package.json',
    });
  });

  it('exports the flagship triad from the public barrel in the default Jest suite', () => {
    expect(typeof publicCore.NovaNeoEncoder).toBe('function');
    expect(typeof publicCore.StigmergyV5).toBe('function');
    expect(typeof publicCore.HolographicEtch).toBe('function');
    expect(publicCore.TRIAD_PROTOCOL_VERSION).toBe('2.4.0');
    expect(publicCore.SEVEN_LAYER_ROUTING.slice(0, 3).map((entry) => entry.packageSurface)).toEqual([
      '@kullailabs/mcop-core (NovaNeoEncoder export)',
      '@kullailabs/mcop-core (StigmergyV5 export)',
      '@kullailabs/mcop-core (HolographicEtch export)',
    ]);
  });

  it('keeps the published quick start on an accepted etch and a real growth event', () => {
    const encoder = new publicCore.NovaNeoEncoder({ dimensions: 256, normalize: true });
    const memory = new publicCore.StigmergyV5({ resonanceThreshold: 0.5 });
    const growth = new publicCore.PositiveResonanceAmplifier();
    const etch = new publicCore.HolographicEtch({
      confidenceFloor: 0,
      growthLedger: growth,
    });
    const context = encoder.encode('user asked about GDPR Article 17');
    const synthesis = context.slice();
    const trace = memory.recordTrace(context, synthesis, { source: 'policy-doc' });
    const record = etch.applyEtch(context, synthesis, 'reinforce GDPR pathway');
    const event = etch.recordPositiveGrowthEvent({
      domain: 'provenance',
      title: 'Auditable GDPR pathway',
      positiveBuilding: 'Recorded a replayable right-to-erasure decision path.',
      resonanceDelta: record.deltaWeight,
      evidence: { traceHash: trace.hash, etchHash: record.hash },
    });

    expect(record.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(event?.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(etch.getPositiveImpactMetrics()).toMatchObject({ growthEvents: 1 });
    expect(coreReadme).toContain('confidenceFloor: 0, growthLedger: growth');
    expect(coreReadme).toContain('const synthesis = context.slice();');
    expect(coreReadme).toContain('etch.recordPositiveGrowthEvent({');
  });

  it('keeps packed ESM and CJS consumer smoke tests in CI', () => {
    expect(ciWorkflow).toContain("import('@kullailabs/mcop-core')");
    expect(ciWorkflow).toContain("require('@kullailabs/mcop-core')");
    expect(ciWorkflow).toContain('missing packed ESM export');
    expect(ciWorkflow).toContain('missing packed CJS export');
    for (const exportName of ['NovaNeoEncoder', 'StigmergyV5', 'HolographicEtch']) {
      expect(ciWorkflow).toContain(exportName);
    }
  });

  it('preserves the protected Node 22 check context while using the pinned runtime', () => {
    expect(ciWorkflow).toContain('name: test (${{ matrix.check-context }})');
    expect(ciWorkflow).toMatch(
      /- check-context: '22\.x'\s+runtime: '22\.23\.1'/,
    );
    expect(ciWorkflow).toContain('node-version: ${{ matrix.runtime }}');
  });

  it('documents the boundary without impossible package imports', () => {
    expect(rootReadme).toContain('`@kuonirad/mcop-framework`, is a private workspace');
    expect(rootReadme).toContain('is not installable from npm');
    expect(rootReadme).toContain('python -m pip install mcop');
    expect(rootReadme).toContain(
      'from mcop import HolographicEtch, NovaNeoEncoder, StigmergyV5',
    );
    expect(coreReadme).toContain('Its supported code entry');
    expect(coreReadme).toContain('is not an npm install target');
    expect(monorepoGuide).toContain('Not published (private workspace)');

    const documentationPaths = [
      'README.md',
      'packages/core/README.md',
      ...currentDocumentationPaths(),
    ];
    const violations: string[] = [];

    for (const path of documentationPaths) {
      const examples = fencedCode(readText(path));
      if (/@kuonirad\/mcop-framework/.test(examples)) {
        violations.push(`${path}: imports the private workspace package`);
      }
      for (const match of examples.matchAll(
        /@kullailabs\/mcop-core\/([A-Za-z0-9._/-]+)/g,
      )) {
        if (match[1] !== 'package.json') {
          violations.push(`${path}: imports unexported subpath ${match[0]}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });
});
