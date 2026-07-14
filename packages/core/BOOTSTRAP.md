# Bootstrap `@kullailabs/mcop-core` on npm

> One-time setup. After this is done, future version-matched `npm-v*` tag
> pushes publish via the existing
> `.github/workflows/publish-npm.yml` workflow — no tokens or manual registry
> upload steps.

> **Status (2026-04-26):** ✅ Bootstrap complete. `@kullailabs/mcop-core@0.1.0`
> was published from a local checkout using a short-lived granular access
> token with the `Bypass 2FA` flag enabled. The package and `@kullailabs`
> scope are now live on the registry, so the steps below are kept only as
> a reference for ever needing to re-bootstrap (e.g. moving to a new scope).
> Future releases happen when a version-matched `npm-v*` tag push runs the
> OIDC trusted-publishing workflow — no token required. The workflow creates
> the draft GitHub Release, verifies its SBOM assets, and then publishes it.

## Why this is needed

The publish workflow uses [npm Trusted Publishing](https://docs.npmjs.com/trusted-publishers)
(OIDC). Trusted publishing is **package-scoped**: npm refuses to create a
package or its `@scope` from a tokenless first publish. So the very first
publish has to come from a logged-in human, after which the trusted
publisher can be configured and CI takes over forever.

If you ever see this in CI:

```
::error title=npm publish bootstrap incomplete::@kullailabs/mcop-core is not yet on the npm registry.
```

…it means we have not yet finished the steps below.

---

## Step 1 — Make sure the `@kullailabs` scope is owned by your npm account

Run:

```bash
npm whoami
```

Then visit <https://www.npmjs.com/settings/$(npm whoami)/orgs> and confirm
`kullailabs` is listed.

If it isn't, create the org once (free plan is fine for a public OSS scope):

1. <https://www.npmjs.com/org/create>
2. Name: `kullailabs`
3. Plan: **Free** (public packages only).
4. You're auto-added as owner.

> If you'd rather publish under your personal scope (e.g. `@kevinkull`),
> change `packages/core/package.json` `"name"` to `@<your-user>/mcop-core`
> and skip the org-creation step. Branding alignment with the GitHub org
> is the only reason we use `@kullailabs`.

## Step 2 — Bootstrap-publish from a local checkout

```bash
cd packages/core
npm install
npm run build
npm whoami                          # sanity check
npm publish --access public         # the one-time, human-driven publish
```

The package now exists at <https://www.npmjs.com/package/@kullailabs/mcop-core>.

## Step 3 — Configure trusted publishing on npmjs.com

1. Open <https://www.npmjs.com/package/@kullailabs/mcop-core/access>
   (Settings → **Trusted publishing**).
2. Add a GitHub Actions trusted publisher with these **exact** values:

   | Field                    | Value                                  |
   | ------------------------ | -------------------------------------- |
   | Organization or user     | `Kuonirad`                             |
   | Repository               | `MCOP-Framework-2.0`        |
   | Workflow filename        | `publish-npm.yml`                      |
   | Environment              | `npm`                                  |

3. Save.

## Step 4 — Hand off to CI

From now on:

```bash
# bump version in packages/core/package.json, commit, merge to main, then push
# the matching tag. Do not pre-create the GitHub Release; the workflow owns its
# draft -> asset verification -> publication lifecycle.
version=$(node -p "require('./package.json').version")
git tag "npm-v${version}"
git push origin "npm-v${version}"
```

`publish-npm.yml` runs on the tag push, the pre-flight probe sees the package
on the registry, OIDC publishes the new version, and Sigstore provenance is
attached automatically. It then creates and verifies the GitHub Release before
publishing it. **No `NPM_TOKEN` is ever stored in this repo.**

---

## Verifying the workflow without publishing

If you want to validate the build + dry-run pipeline without uploading:

```bash
gh workflow run publish-npm.yml -f dry_run=true
```

The dry-run validates the registry bootstrap and package version first. For an
already-published version it uses `npm pack --dry-run`; for an unpublished
version it uses `npm publish --dry-run` without uploading.
