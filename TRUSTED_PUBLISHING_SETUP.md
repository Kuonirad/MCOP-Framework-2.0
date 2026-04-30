# Trusted Publishing Setup

This document describes the one-time setup required to publish the `mcop`
Python package from GitHub Actions to TestPyPI and PyPI using trusted
publishing (OIDC).

## Current Repository Configuration

The repository already contains the publishing workflow:

- Workflow file: `.github/workflows/publish-pypi.yml`
- GitHub owner: `Kuonirad`
- Repository: `MCOP-Framework-2.0`
- PyPI project name: `mcop`
- Test environment name: `testpypi`
- Production environment name: `pypi`

The workflow is configured for:

- Manual dispatch to `testpypi` or `pypi`
- Release-triggered production publishes for tags that start with `py-v`
- OIDC-based publishing through `pypa/gh-action-pypi-publish`

No PyPI API tokens should be added to GitHub secrets for this workflow.

## Why the First Publish Failed

The April 23, 2026 production run reached the GitHub `pypi` deployment
environment but failed with:

`invalid-publisher`

That error means PyPI received a valid OIDC token from GitHub, but no matching
trusted publisher was registered on the PyPI side for the workflow claims.

## One-Time PyPI Setup

### 1. Register a pending publisher on PyPI

If `mcop` does not exist on PyPI yet, create a pending publisher from the
account-level publishing page:

- URL: <https://pypi.org/manage/account/publishing/>
- Action: `Add a new pending publisher`

Use these exact values:

- PyPI project name: `mcop`
- Owner: `Kuonirad`
- Repository name: `MCOP-Framework-2.0`
- Workflow name: `publish-pypi.yml`
- Environment name: `pypi`

This allows the first successful trusted publish to create the project.

### 2. Register a pending publisher on TestPyPI

Repeat the same process on TestPyPI:

- URL: <https://test.pypi.org/manage/account/publishing/>
- Action: `Add a new pending publisher`

Use these values:

- PyPI project name: `mcop`
- Owner: `Kuonirad`
- Repository name: `MCOP-Framework-2.0`
- Workflow name: `publish-pypi.yml`
- Environment name: `testpypi`

## GitHub Environment Notes

The workflow declares two environments:

- `testpypi`
- `pypi`

They do not need registry secrets. Protection rules such as required reviewers
or branch restrictions are optional and can be configured in:

- `Settings -> Environments`

## Validation Flow

Run the setup in two phases:

1. Register both pending publishers.
2. Trigger `.github/workflows/publish-pypi.yml` with `target=testpypi`.
3. Confirm the package appears at:
   - <https://test.pypi.org/project/mcop/>
4. Install from TestPyPI and run a smoke test.
5. Trigger the workflow again with `target=pypi`, or rerun the existing
   production release after TestPyPI succeeds.
6. Confirm the package appears at:
   - <https://pypi.org/project/mcop/>

## Release Conventions

Production release publishes are tied to tags that start with `py-v`.

Examples:

```bash
git tag py-v3.1.0
git push origin py-v3.1.0
```

The workflow checks that the tag suffix matches `mcop_package/pyproject.toml`:

- Tag: `py-v3.1.0`
- Package version: `3.1.0`

## Local Validation Before Publishing

From `mcop_package`:

```bash
python -m build
twine check dist/*
pip install --force-reinstall dist/mcop-3.1.0-py3-none-any.whl
mcop info
```

## npm Trusted Publishing

The repository also contains an npm publish workflow for the package:

- Package: `@kullailabs/mcop-core`
- Package directory: `packages/core`
- Workflow file: `.github/workflows/publish-npm.yml`
- GitHub environment: `npm`

### Important first-publish limitation

npm trusted publishing is configured per package, and npm requires the package
to already exist before you can add a trusted publisher.

That means the first npm release cannot start with the trusted publisher UI.
You must create the package first, then attach GitHub Actions as the trusted
publisher.

### First npm publish

From `packages/core` on a machine where you are logged into npm with publish
rights to the `@kullailabs` scope:

```bash
npm login
npm publish --access public
```

Notes:

- The package is scoped (`@kullailabs/mcop-core`), so public visibility requires
  `--access public` on the first publish.
- The package already sets `publishConfig.registry` to `https://registry.npmjs.org/`
  and `publishConfig.provenance` to `true`.
- You must be an owner or publisher for the `kullailabs` npm organization.

### Add the npm trusted publisher after the first publish

Once the package exists on npm, open:

- <https://www.npmjs.com/package/@kullailabs/mcop-core>
- `Settings -> Trusted publishing`
- Select `GitHub Actions`

Use these exact values:

- Organization or user: `Kuonirad`
- Repository: `MCOP-Framework-2.0`
- Workflow filename: `publish-npm.yml`
- Environment name: `npm`

### Recommended hardening after npm trusted publishing works

At package settings:

- `Settings -> Publishing access`
- Choose `Require two-factor authentication and disallow tokens`

This blocks long-lived token publishing while still allowing OIDC trusted
publishing from GitHub Actions.

## Troubleshooting

### `invalid-publisher`

Check for exact matches between PyPI and GitHub:

- Owner
- Repository name
- Workflow filename
- Environment name

### `Non-user identities cannot create new projects`

This usually means the pending publisher project name and the uploaded package
metadata do not match exactly. Ensure both use `mcop`.

### Version mismatch

If the workflow rejects a release tag, make sure the tag and package version are
aligned before retrying.

## References

- PyPI trusted publishers:
  <https://docs.pypi.org/trusted-publishers/creating-a-project-through-oidc/>
- PyPI troubleshooting:
  <https://docs.pypi.org/trusted-publishers/troubleshooting/>
- GitHub OIDC for PyPI:
  <https://docs.github.com/en/actions/how-tos/secure-your-work/security-harden-deployments/oidc-in-pypi>
