# Supply-chain Trust Posture

MCOP already maintains SBOM generation/validation, Dependabot grouping, pinned
GitHub Actions in primary workflows, CodeQL, malicious-package smoke tests, and
npm Trusted Publishing provenance. This page records the higher-trust posture
and the checks that should stay green as the ecosystem expands.

## Current controls

| Control | Location | Notes |
| --- | --- | --- |
| SBOM generation | `pnpm sbom` / `scripts/generate-sbom.mjs` | CycloneDX artifacts are regenerated for releases. |
| SBOM validation | `pnpm sbom:validate` / `scripts/validate-sbom.mjs` | Enforces expected SBOM shape before publish. |
| Dependabot discipline | `.github/dependabot.yml` | Weekly npm, GitHub Actions, and Docker update checks. |
| Code scanning | `.github/workflows/codeql.yml` | JavaScript/TypeScript and Python CodeQL analysis. |
| Trusted publishing | `.github/workflows/publish-npm.yml` | Uses npm OIDC provenance; no `NPM_TOKEN` stored. |
| Pinned Actions | `.github/workflows/*.yml` | Main release/security paths pin third-party Actions to commit SHAs. |

## OpenSSF Scorecard

`.github/workflows/scorecard.yml` runs OpenSSF Scorecard weekly and on pushes to
`main`. It publishes authenticated results to Scorecard using GitHub OIDC and
uploads the SARIF report to code scanning.

Badge:

```md
[![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/Kuonirad/MCOP-Framework-2.0/badge)](https://scorecard.dev/viewer/?uri=github.com/Kuonirad/MCOP-Framework-2.0)
```

Watch these Scorecard checks especially closely:

- **Pinned-Dependencies:** keep Actions pinned to immutable SHAs.
- **Token-Permissions:** default workflows to read-only tokens and grant scoped
  write permissions only where required.
- **Branch-Protection:** require CI, CodeQL, Scorecard, and release checks on
  protected branches.
- **Packaging:** keep npm/PyPI provenance and signed release artifacts intact.

## SLSA direction

npm Trusted Publishing already emits registry provenance for
`@kullailabs/mcop-core`. To move toward a stronger SLSA story:

1. Keep release workflows isolated behind GitHub Environments.
2. Preserve `id-token: write` only in jobs that need provenance.
3. Attach SBOM artifacts to releases and package registries.
4. Add artifact attestations for built Next.js/static assets if they become
   distributed release outputs.
5. Document every manual bootstrap step in `packages/core/BOOTSTRAP.md` before
   promoting a package to automated release.
