# Software Bill of Materials (SBOM)

This directory holds CycloneDX 1.6 JSON SBOMs for the publishable
surface of MCOP Framework 2.0:

| File                                     | Covers                                              |
| ---------------------------------------- | --------------------------------------------------- |
| `docs/sbom/mcop-framework.cdx.json`      | the root `@kuonirad/mcop-framework` Next.js app     |
| `docs/sbom/mcop-core.cdx.json`           | the published `@kullailabs/mcop-core` library       |

Both files are **gitignored and regenerated on demand** so they never
drift from the lockfile. The generator is `scripts/generate-sbom.mjs`,
which wraps [`@cyclonedx/cyclonedx-npm`](https://www.npmjs.com/package/@cyclonedx/cyclonedx-npm)
and is exposed as the npm script:

```bash
pnpm sbom
```

This runs against the resolved `node_modules` tree and emits CycloneDX
1.6 JSON consumable by GitHub's SBOM ingestion, dependency-track,
Snyk, OWASP DepCheck, etc.

## Why two SBOMs?

The published `@kullailabs/mcop-core` library has a much smaller
runtime surface (`canonicalize` only) than the root Next.js app. A
consumer pulling `@kullailabs/mcop-core` from npm needs an SBOM scoped
to *that* dependency tree, not the entire monorepo.

## Why CycloneDX (vs SPDX)?

CycloneDX is the OWASP-standard format for component-vulnerability
correlation. GitHub, Snyk, and Dependency-Track all ingest it natively.
SPDX is more legal-licensing-oriented; the BUSL-1.1 license here is
already covered by the in-repo `LICENSE` files and the `license-guard`
workflow.

## Why `--ignore-npm-errors`?

This is a pnpm-workspaces repo, but `cyclonedx-npm` shells out to
`npm ls` to read the dependency graph. `npm ls` flags some sub-deps as
"missing" because pnpm hoists transitive devDependencies differently
from npm's flat tree. The errors are cosmetic and the runtime SBOM
(`--omit dev`) is unaffected.

## Publish-workflow integration

Devin's GitHub OAuth token does not currently grant the `workflow`
scope, so I cannot wire SBOM generation into `.github/workflows/publish-*.yml`
directly. The recommended one-line addition for the maintainer (added
to both `publish-npm.yml` and `publish-pypi.yml` near the publish
step):

```yaml
- name: Generate CycloneDX SBOM
  run: pnpm sbom
- name: Attach SBOM to release
  uses: softprops/action-gh-release@v2
  with:
    files: |
      docs/sbom/mcop-framework.cdx.json
      docs/sbom/mcop-core.cdx.json
```

For Sigstore / `cosign` attestations, the same SBOM JSON can be passed
to `cosign attest --predicate` and pushed alongside the release artefact.

## Local verification

After running `pnpm sbom`, the JSON files can be validated with:

```bash
npx -y @cyclonedx/cyclonedx-cli@latest validate \
  --input-file docs/sbom/mcop-framework.cdx.json \
  --input-format json \
  --input-version v1_6
```
