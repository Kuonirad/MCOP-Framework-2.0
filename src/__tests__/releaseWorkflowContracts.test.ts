import { readFileSync } from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(__dirname, '../..');
const pypiWorkflow = readFileSync(
  path.join(repoRoot, '.github/workflows/publish-pypi.yml'),
  'utf8',
);
const desktopWorkflow = readFileSync(
  path.join(repoRoot, '.github/workflows/desktop.yml'),
  'utf8',
);

function compact(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

describe('immutable release workflow contracts', () => {
  it('binds a manual PyPI production retry to an existing py-v tag at the dispatched main SHA', () => {
    expect(pypiWorkflow).toContain('release_tag:');
    expect(pypiWorkflow).toContain(
      'release_tag: ${{ steps.release_contract.outputs.release_tag }}',
    );
    expect(pypiWorkflow).toContain(
      'release_sha: ${{ steps.release_contract.outputs.release_sha }}',
    );
    expect(pypiWorkflow).toContain('release_sha=$(git rev-parse "${release_tag}^{commit}")');
    expect(pypiWorkflow).toContain('if [ "$release_sha" != "$GITHUB_SHA" ]; then');
    expect(pypiWorkflow).toContain(
      'if [ "$GITHUB_EVENT_NAME" = "workflow_dispatch" ] && [ "$GITHUB_REF" != "refs/heads/main" ]; then',
    );
    expect(pypiWorkflow).toContain('tag_name: ${{ needs.build.outputs.release_tag }}');
  });

  it('preserves exact published PyPI releases and only deletes incomplete drafts', () => {
    expect(compact(pypiWorkflow)).toContain(
      `if [ "$(jq -r '.isDraft' <<<"$release_json")" = 'true' ]; then echo "Removing incomplete draft release for \${TAG}; published releases are never deleted." gh release delete "$TAG"`,
    );
    expect(pypiWorkflow).toContain(
      'Published release ${TAG} already has the exact verified SBOM assets; preserving it.',
    );
    expect(pypiWorkflow).toContain("actual=$(jq -r '.assets[] |");
    expect(pypiWorkflow).toContain(
      'Draft release assets do not match the verified SBOMs; refusing to publish an immutable release.',
    );
    expect(pypiWorkflow.indexOf('Draft release assets do not match')).toBeLessThan(
      pypiWorkflow.indexOf('gh api -X PATCH'),
    );
    expect(pypiWorkflow).not.toContain('Remove any prior published release for this tag');
  });

  it('recreates desktop drafts but accepts an exact already-published six-asset release', () => {
    expect(compact(desktopWorkflow)).toContain(
      `if test "$(jq -r '.isDraft' <<<"$release_json")" = 'true'; then echo "Removing incomplete draft release for $TAG; published releases are never deleted." gh release delete "$TAG"`,
    );
    expect(desktopWorkflow).toContain('assertReleaseAssetsMatch(path.resolve(\'release-assets\')');
    expect(desktopWorkflow).toContain(
      'Published release $TAG already has the exact six verified assets; preserving it.',
    );
    expect(desktopWorkflow).toContain(
      "if: steps.release_state.outputs.create_release == 'true'",
    );
    expect(desktopWorkflow.indexOf("test \"$(jq -r '.isDraft'")).toBeLessThan(
      desktopWorkflow.indexOf('gh release edit "$TAG"'),
    );
  });
});
