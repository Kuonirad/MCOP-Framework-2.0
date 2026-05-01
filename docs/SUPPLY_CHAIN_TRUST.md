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

Add `.github/workflows/scorecard.yml` to run OpenSSF Scorecard weekly and on
pushes to `main`. It should publish authenticated results to Scorecard using
GitHub OIDC and upload the SARIF report to code scanning.

> Note: adding or updating workflow files requires a GitHub token with
> `workflow` scope. If an automation token lacks that scope, land this
> documentation first and add the workflow from an authorized maintainer token.

Suggested workflow:

```yaml
name: OpenSSF Scorecard

on:
  push:
    branches: [main]
  schedule:
    - cron: '17 6 * * 1'
  workflow_dispatch:

permissions:
  contents: read

concurrency:
  group: scorecard-${{ github.ref }}
  cancel-in-progress: true

jobs:
  scorecard:
    name: Scorecard analysis
    runs-on: ubuntu-latest
    timeout-minutes: 15
    permissions:
      contents: read
      security-events: write
      id-token: write
    steps:
      - name: Checkout repository
        uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683 # v4.2.2
        with:
          persist-credentials: false

      - name: Run OpenSSF Scorecard
        uses: ossf/scorecard-action@4eaacf0543bb3f2c246792bd56e8cdeffafb205a # v2.4.3
        with:
          results_file: scorecard-results.sarif
          results_format: sarif
          publish_results: true

      - name: Upload Scorecard SARIF
        uses: github/codeql-action/upload-sarif@95e58e9a2cdfd71adc6e0353d5c52f41a045d225 # v4.35.2
        with:
          sarif_file: scorecard-results.sarif
```

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
