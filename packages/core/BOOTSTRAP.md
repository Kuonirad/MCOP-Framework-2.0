# Bootstrap `@kullailabs/mcop-core` on npm

> One-time setup. After this is done, every future `npm-v*` GitHub Release
> publishes automatically via the existing `.github/workflows/publish-npm.yml`
> workflow — no tokens, no manual steps.

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
   | Repository               | `KullAILABS-MCOP-Framework-2.0`        |
   | Workflow filename        | `publish-npm.yml`                      |
   | Environment              | `npm`                                  |

3. Save.

## Step 4 — Hand off to CI

From now on:

```bash
# bump version in packages/core/package.json, commit, push, then:
gh release create npm-v0.1.1 --generate-notes
```

`publish-npm.yml` runs on the `release` event, the pre-flight probe sees
the package on the registry, OIDC publishes the new version, and Sigstore
provenance is attached automatically. **No `NPM_TOKEN` is ever stored in
this repo.**

---

## Verifying the workflow without publishing

If you want to validate the build + dry-run pipeline without uploading:

```bash
gh workflow run publish-npm.yml -f dry_run=true
```

The dry-run path skips the registry probe (it's only enforced on the
`release` event) so it works even before bootstrap.
