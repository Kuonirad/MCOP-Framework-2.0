# Governance

This document describes how decisions are made in the MCOP Framework 2.0
project, who the current maintainers are, and how releases ship.

## Maintainers

| Role | Handle | Scope |
| --- | --- | --- |
| Lead maintainer | [@Kuonirad](https://github.com/Kuonirad) | Architecture, releases, security escalation |

The maintainer roster is tracked here and in [`CODEOWNERS`](./CODEOWNERS). The
project is actively onboarding additional maintainers; see the "Becoming a
maintainer" section below.

## Decision model

The project operates on **lazy consensus**:

1. Non-trivial changes are proposed via a pull request or a GitHub Discussion.
2. Anyone may object within a **72-hour objection window**. Objections must be
   substantive (correctness, security, licensing, or architectural concerns).
3. If no substantive objection is raised, the change is considered approved and
   a maintainer may merge.
4. Contested changes escalate to a synchronous review between maintainers; in
   the single-maintainer phase, the lead maintainer decides and publicly
   records the rationale on the PR.

Changes that always require explicit maintainer approval:

- Public API surface changes in `src/core`.
- Release-process, CI, or security-workflow changes.
- Anything touching dependency pinning, license files, or SECURITY.md.

## Release process

Releases follow [Semantic Versioning](https://semver.org/). The flow is:

1. `release-drafter` continuously assembles a draft release from merged PR
   labels (`feature`, `fix`, `security`, `performance`, `chore`, `docs`,
   `dependencies`). See [`.github/release-drafter.yml`](./.github/release-drafter.yml).
2. A maintainer reviews the draft, adjusts the version if needed, and publishes
   it via `gh release create vX.Y.Z --generate-notes` or the web UI.
3. The release is tagged on `main`; the tag triggers downstream publish
   workflows where relevant.
4. Each release is mirrored under [`docs/releases/`](./docs/releases/) with a
   human-readable summary.

## Security

Vulnerability reports follow [SECURITY.md](./SECURITY.md). The lead maintainer
acknowledges reports within 72 hours and coordinates a private patch before
public disclosure.

## Becoming a maintainer

Consistent contributors are invited to become maintainers on the basis of:

- A sustained record of high-quality PRs (typically 10+ merged commits over 60+
  days).
- Demonstrated review judgement on others' PRs.
- Agreement to uphold [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md) and the
  responsibilities in this document.

Nominations may be opened by any existing maintainer or self-nominated via a
GitHub Discussion. Approval is by consensus of current maintainers.

## Changing this document

Changes to governance go through the same lazy-consensus process as code,
with the objection window extended to **7 days**.
