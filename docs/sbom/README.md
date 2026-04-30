# Software Bill of Materials (SBOM)

This directory holds CycloneDX JSON SBOMs for the publishable
surface of MCOP Framework 2.0:

| File                                     | Covers                                              |
| ---------------------------------------- | --------------------------------------------------- |
| `docs/sbom/mcop-framework.cdx.json`      | the root `@kuonirad/mcop-framework` Next.js app (recursive across all workspace packages) |
| `docs/sbom/mcop-core.cdx.json`           | the published `@kullailabs/mcop-core` library only  |

Both files are **gitignored and regenerated on demand** so they never
drift from the lockfile. The generator is `scripts/generate-sbom.mjs`,
which wraps [`@cyclonedx/cdxgen`](https://www.npmjs.com/package/@cyclonedx/cdxgen)
(multi-runtime CycloneDX generator, OWASP-maintained, **pnpm-lockfile
aware**) and is exposed as the npm script:

```bash
pnpm sbom
```

This reads `pnpm-lock.yaml` directly and emits CycloneDX 1.6+ JSON
consumable by GitHub's SBOM ingestion, Dependency-Track, Snyk, OWASP
DepCheck, and similar SCA tooling.

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

## Why `cdxgen` (not `cyclonedx-npm`)?

`@cyclonedx/cyclonedx-npm` shells out to `npm ls` for its dependency
graph. Under pnpm workspaces, `npm ls` produces malformed output (the
hoisted `node_modules` layout is incompatible with npm's flat tree),
making `cyclonedx-npm` fail with `failed to parse npm-ls response`
even with `--ignore-npm-errors`. `cdxgen` reads `pnpm-lock.yaml`
directly via the OWASP `pnpm` plugin, so it produces correct SBOMs
without depending on `npm ls`.

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

After running `pnpm sbom`, validate the JSON files against the official
CycloneDX schemas (using the JSON validator bundled with
`@cyclonedx/cyclonedx-library`):

```bash
pnpm sbom:validate
```

The script auto-detects each SBOM's declared `specVersion` (1.0 – 1.7
supported) and reports:

```
sbom:validate: docs/sbom/mcop-framework.cdx.json — VALID (CycloneDX 1.7)
sbom:validate: docs/sbom/mcop-core.cdx.json — VALID (CycloneDX 1.7)
sbom:validate: all 2 SBOM(s) conform to their declared CycloneDX schema.
```

Exit codes: `0` on success, `1` on schema violations, `2` on IO/setup
errors. Wire this into CI alongside `pnpm sbom` to fail builds whenever
the generated SBOM is non-conformant.

> Why not `@cyclonedx/cyclonedx-cli`? The OWASP CLI ships as a Rust
> binary on the [`cyclonedx-cli` GitHub releases](https://github.com/CycloneDX/cyclonedx-cli/releases),
> not on npm — `npx @cyclonedx/cyclonedx-cli` returns a 404. The
> in-repo Node validator avoids that extra binary download and runs
> against the same upstream JSON schemas.
