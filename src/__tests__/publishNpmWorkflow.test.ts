import { readFileSync } from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(__dirname, '../..');
const workflow = readFileSync(path.join(repoRoot, '.github/workflows/publish-npm.yml'), 'utf8');

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function stepBlock(name: string): string {
  const header = new RegExp(`^ {6}- name: ${escapeRegExp(name)}\\r?\\n`, 'm');
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
      "(github.event_name == 'release' || github.event_name == 'push') && steps.npm_registry.outputs.version_published != 'true'",
    );
    expect(publish).toContain("sed -i '/_authToken/d'");
    expect(publish).toContain('env -u NODE_AUTH_TOKEN npm publish');
    expect(publish).toContain('--loglevel=verbose');

    expect(compact(skipDuplicate)).toContain(
      "(github.event_name == 'release' || github.event_name == 'push') && steps.npm_registry.outputs.version_published == 'true'",
    );
    expect(skipDuplicate).toContain('is already present on npm; treating this duplicate release path as successful.');
  });

  it('rejects untagged manual uploads so every production publish owns an npm-v release', () => {
    const rejection = stepBlock('Reject untagged manual production publish');
    const publish = stepBlock('Publish to npm (trusted publishing + automatic provenance)');

    expect(compact(rejection)).toContain(
      "if: github.event_name == 'workflow_dispatch' && inputs.dry_run == false",
    );
    expect(rejection).toContain('Manual npm uploads are disabled');
    expect(rejection).toContain('npm-v<package-version>');
    expect(publish).not.toContain('inputs.dry_run == false');
  });

  it('uploads exact SBOMs to a draft before publishing an immutable npm release', () => {
    const preflight = stepBlock('Preflight immutable npm GitHub release state');
    const createDraft = stepBlock('Create fresh npm draft release');
    const uploadAndPublish = stepBlock(
      'Upload and verify npm release SBOMs before publishing',
    );
    const finalVerification = stepBlock('Verify final immutable npm release assets');

    expect(preflight).toContain("gh release view \"$TAG\"");
    expect(preflight).toContain('published releases are never deleted');
    expect(preflight).toContain('already has the exact verified SBOM assets; preserving it');
    expect(preflight).toContain('different asset set or digest');
    expect(workflow.indexOf('Preflight immutable npm GitHub release state')).toBeLessThan(
      workflow.indexOf('Publish to npm (trusted publishing + automatic provenance)'),
    );
    expect(createDraft).toContain('gh release create "$TAG"');
    expect(workflow.indexOf('Publish to npm (trusted publishing + automatic provenance)')).toBeLessThan(
      workflow.indexOf('Create fresh npm draft release'),
    );
    expect(createDraft).toContain('--draft --verify-tag');
    expect(uploadAndPublish).toContain('gh release upload "$TAG"');
    expect(uploadAndPublish).toContain("test \"$(jq -r '.isDraft'");
    expect(uploadAndPublish).toContain('Draft npm release assets do not match');
    expect(uploadAndPublish.indexOf('Draft npm release assets do not match')).toBeLessThan(
      uploadAndPublish.indexOf('gh release edit "$TAG"'),
    );
    expect(finalVerification).toContain("= 'false'");
    expect(workflow).not.toContain('Attach SBOMs to GitHub Release');
  });
});
