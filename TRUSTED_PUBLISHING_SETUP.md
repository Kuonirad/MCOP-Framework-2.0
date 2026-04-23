# Trusted Publishing Setup

This document describes the one-time setup required to publish the `mcop`
Python package from GitHub Actions to TestPyPI and PyPI using trusted
publishing (OIDC).

## Current Repository Configuration

The repository already contains the publishing workflow:

- Workflow file: `.github/workflows/publish-pypi.yml`
- GitHub owner: `Kuonirad`
- Repository: `KullAILABS-MCOP-Framework-2.0`
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
- Repository name: `KullAILABS-MCOP-Framework-2.0`
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
- Repository name: `KullAILABS-MCOP-Framework-2.0`
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
