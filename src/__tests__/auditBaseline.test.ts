import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(__dirname, '../..');
const canonicalNode = '22.23.1';
const canonicalPnpm = '9.15.0';
const canonicalNodeImage =
  'node:22.23.1-bookworm-slim@sha256:813a7480f28fdadac1f7f5c824bcdad435b5bc1322a5968bbbdef8d058f9dff4';

function read(relativePath: string): string {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

describe('audit remediation baseline', () => {
  it('pins the canonical Node and pnpm runtime across repo entry points', () => {
    const rootPackage = JSON.parse(read('package.json')) as {
      engines?: Record<string, string>;
      packageManager?: string;
    };

    expect(rootPackage.engines?.node).toBe(canonicalNode);
    expect(rootPackage.packageManager).toBe(`pnpm@${canonicalPnpm}`);
    expect(read('.nvmrc').trim()).toBe(canonicalNode);

    expect(read('Dockerfile')).toContain(`ARG NODE_IMAGE=${canonicalNodeImage}`);
    expect(read('examples/reproducible-benchmark/Dockerfile')).toContain(`FROM ${canonicalNodeImage} AS toolchain`);

    expect(read('README.md')).toContain(`Node ${canonicalNode} + pnpm ${canonicalPnpm}`);
    expect(read('CONTRIBUTING.md')).toContain(`Node.js ${canonicalNode}`);
    expect(read('CONTRIBUTOR_ONBOARDING.md')).toContain(`Node.js ${canonicalNode}`);

    const ci = read('.github/workflows/ci.yml');
    expect(ci).toContain(`node-version: [${canonicalNode}]`);
    expect(ci).toContain(`node-version: ${canonicalNode}`);
    expect(ci).toContain(`node-version: '${canonicalNode}'`);

    expect(read('.github/actions/setup-project/action.yml')).toContain(`default: '${canonicalNode}'`);
    expect(read('.github/workflows/cypress.yml')).toContain(`node-version: '${canonicalNode}'`);
    expect(read('.github/workflows/lighthouse.yml')).toContain(`node-version: ${canonicalNode}`);
    expect(read('.github/workflows/pr-checklist.yml')).toContain(`node-version: ${canonicalNode}`);
  });

  it('treats high-severity dependency advisories as the audit gate', () => {
    const rootPackage = JSON.parse(read('package.json')) as {
      scripts?: Record<string, string>;
    };

    expect(rootPackage.scripts?.['deps:check']).toContain('--audit-level=high');
    expect(rootPackage.scripts?.['deps:audit']).toContain('--audit-level=high');

    for (const relativePath of [
      '.github/workflows/ci.yml',
      'justfile',
      'scripts/audit-repo-claims.sh',
      'CONTRIBUTING.md',
    ]) {
      const text = read(relativePath);
      expect(text).toContain('--audit-level=high');
      expect(text).not.toContain('--audit-level=moderate');
    }
  });

  it('documents SBOM generation as an active release control and avoids placeholder security contacts', () => {
    const securityPolicy = read('SECURITY.md');

    expect(securityPolicy).toContain('CycloneDX SBOM generation and schema validation are active release controls');
    expect(securityPolicy).toContain('/security/advisories/new');
    expect(securityPolicy).not.toContain('SBOM generation for releases (planned)');
    expect(securityPolicy).not.toContain('example.com');
  });
});
