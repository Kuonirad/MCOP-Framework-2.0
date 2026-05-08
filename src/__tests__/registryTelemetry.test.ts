import { mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { execFileSync } from 'child_process';

describe('registry telemetry script', () => {
  it('prints deterministic fixture telemetry and preserves PyPI limitation notes', () => {
    const dir = mkdtempSync(join(tmpdir(), 'registry-telemetry-'));
    const fixturePath = join(dir, 'fixture.json');
    writeFileSync(
      fixturePath,
      JSON.stringify({
        generatedAt: '2026-05-08T00:00:00.000Z',
        packages: [
          {
            ecosystem: 'npm',
            packageName: '@kullailabs/mcop-core',
            published: true,
            latestVersion: '0.2.1',
            versionCount: 4,
            latestPublishedAt: '2026-05-01T13:23:42.699Z',
            downloads: {
              period: 'last-month',
              count: 456,
              start: '2026-04-08',
              end: '2026-05-07',
              source: 'npm downloads API',
            },
            limitations: [],
          },
          {
            ecosystem: 'pypi',
            packageName: 'mcop',
            published: true,
            latestVersion: '3.2.0',
            versionCount: 4,
            latestPublishedAt: null,
            downloads: null,
            limitations: ['PyPI JSON metadata does not expose reliable download/install counts.'],
          },
        ],
      }),
    );

    const output = execFileSync('node', ['scripts/registry-telemetry.mjs', '--fixture', fixturePath], {
      cwd: process.cwd(),
      encoding: 'utf8',
    });

    const report = JSON.parse(output);
    expect(report.generatedAt).toBe('2026-05-08T00:00:00.000Z');
    expect(report.packages[0].downloads.count).toBe(456);
    expect(report.packages[1].downloads).toBeNull();
    expect(report.packages[1].limitations[0]).toContain('PyPI JSON metadata');
  });
});
