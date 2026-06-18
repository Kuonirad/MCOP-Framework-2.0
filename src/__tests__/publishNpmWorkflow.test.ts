import { readFileSync } from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(__dirname, '../..');
const workflow = readFileSync(path.join(repoRoot, '.github/workflows/publish-npm.yml'), 'utf8');

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function stepBlock(name: string): string {
  const header = new RegExp(`^ {6}- name: ${escapeRegExp(name)}\\n`, 'm');
  const match = header.exec(workflow);
  if (!match || match.index === undefined) {
    throw new Error(`Step not found in publish-npm.yml: ${name}`);
  }

  const bodyStart = match.index + match[0].length;
  const nextStepOffset = workflow.slice(bodyStart).search(/^ {6}- name: /m);
  return workflow.slice(
    match.index,
    nextStepOffset === -1 ? undefined : bodyStart + nextStepOffset,
  );
}

function compact(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

describe('npm publish workflow regression guards', () => {
  it('records whether the package version already exists before publish decisions', () => {
    const registryProbe = stepBlock('Pre-flight \u2014 verify package + scope are bootstrapped on npm');

    expect(registryProbe).toContain('id: npm_registry');
    expect(compact(registryProbe)).toContain(
      "if: github.event_name == 'release' || github.event_name == 'push' || github.event_name == 'workflow_dispatch'",
    );
    expect(registryProbe).toContain('PKG_VERSION="$pkg_version" node -e');
    expect(registryProbe).toContain(
      'Object.prototype.hasOwnProperty.call(versions, process.env.PKG_VERSION)',
    );
    expect(registryProbe).toContain('version_published=true');
    expect(registryProbe).toContain('version_published=false');
  });

  it('uses pack validation instead of publish dry-run for already-published versions', () => {
    const publishDryRun = stepBlock('Publish (dry run)');
    const packValidation = stepBlock('Pack validation (dry run for already-published version)');

    expect(compact(publishDryRun)).toContain(
      "github.event_name == 'workflow_dispatch' && inputs.dry_run == true && steps.npm_registry.outputs.version_published != 'true'",
    );
    expect(publishDryRun).toContain('npm publish --access public --dry-run');

    expect(compact(packValidation)).toContain(
      "github.event_name == 'workflow_dispatch' && inputs.dry_run == true && steps.npm_registry.outputs.version_published == 'true'",
    );
    expect(packValidation).toContain('npm pack --dry-run');
  });

  it('skips duplicate release/tag publishes while still allowing first-time uploads', () => {
    const publish = stepBlock('Publish to npm (trusted publishing + automatic provenance)');
    const skipDuplicate = stepBlock('Skip npm publish for already-published version');

    expect(compact(publish)).toContain(
      "(github.event_name == 'workflow_dispatch' && inputs.dry_run == false) || ((github.event_name == 'release' || github.event_name == 'push') && steps.npm_registry.outputs.version_published != 'true')",
    );
    expect(publish).toContain("sed -i '/_authToken/d'");
    expect(publish).toContain('env -u NODE_AUTH_TOKEN npm publish');
    expect(publish).toContain('--loglevel=verbose');

    expect(compact(skipDuplicate)).toContain(
      "(github.event_name == 'release' || github.event_name == 'push') && steps.npm_registry.outputs.version_published == 'true'",
    );
    expect(skipDuplicate).toContain('is already present on npm; treating this duplicate release path as successful.');
  });
});
