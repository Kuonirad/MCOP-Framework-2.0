# MCOP Release Playbook

This playbook converts the May 2026 audit release/provenance findings into a
repeatable release procedure. It is intentionally conservative: release pages,
tags, SBOMs, and registry attestations are treated as append-only evidence.

## Release invariants

1. **Never delete or rewrite a published tag or GitHub Release.** If an SBOM or
   provenance attachment was missed, ship a successor patch release and
   cross-link the older release from the newer notes.
2. **npm releases use Trusted Publishing only.** `@kullailabs/mcop-core@0.2.0`
   was the manual bootstrap exception and is not a canonical downstream trust
   anchor. Consumers should use `0.2.1` or newer when they need Sigstore/SLSA
   provenance.
3. **Python package metadata must match runtime metadata.** `mcop.__version__`
   and `mcop_package/pyproject.toml` are guarded by pytest.
4. **SBOM artifacts are regenerated and validated before publish.** Run
   `pnpm sbom` and `pnpm sbom:validate` before drafting release notes.
5. **Workflow hygiene is a release blocker.** Run `pnpm ci:workflow-hygiene` to
   ensure Actions are SHA-pinned and CI does not regress to unsupported Node
   runtimes.

## Pre-release checklist

```bash
pnpm install
pnpm lint
pnpm typecheck
pnpm test
pnpm positive:audit
pnpm audit:placement
pnpm ci:workflow-hygiene
pnpm sbom
pnpm sbom:validate
(cd mcop_package && pytest)
```

## npm package provenance

The canonical npm release path is `.github/workflows/publish-npm.yml`, which
uses GitHub OIDC Trusted Publishing and registry-generated Sigstore provenance.
Do not add `NPM_TOKEN`-based fallback publishing for `@kullailabs/mcop-core`.
If Trusted Publishing fails, stop and diagnose the environment rather than
publishing manually.

### Historical exception: `@kullailabs/mcop-core@0.2.0`

`0.2.0` was manually published during OIDC bootstrap and lacks a Sigstore
provenance attestation. `0.2.1` was intentionally published through the trusted
path as the no-op provenance repair. Downstream auditors should use `0.2.1+` as
the SBOM/provenance anchor.

## GitHub Release and SBOM attachments

If release assets need to be corrected after publication:

1. Leave the existing tag and release intact.
2. Create a new patch release with corrected SBOM attachments.
3. Link the old and new release notes in both directions.
4. Record the rationale in `CHANGELOG.md`.

This preserves the audit trail and prevents a recurrence of the v2.2.0 release
page deletion noted in the meta-audit.
