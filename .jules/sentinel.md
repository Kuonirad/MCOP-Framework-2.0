## 2025-12-19 - Content Security Policy Implementation
**Vulnerability:** Missing Content Security Policy (CSP) and Permissions-Policy headers.
**Learning:** Next.js applications require careful CSP configuration to avoid breaking functionality (scripts, images, styles). Specifically, `next/image` requires allowing `data:` for images in some cases or specific domains. `unsafe-inline` or `unsafe-eval` might be needed for some development features, but we should strive for strictness in production.
**Prevention:** Always implement a strict CSP by default and loosen it only as necessary. Use `Permissions-Policy` to disable unused browser features.

## 2025-12-19 - Docker Health Check Availability Gap
**Vulnerability:** The `Dockerfile` defined a `HEALTHCHECK` against a non-existent endpoint `/api/health`, ensuring production containers would fail health checks and be restarted (DoS).
**Learning:** Operational configuration files (Dockerfile, k8s manifests) are part of the security surface. Availability is a key security pillar.
**Prevention:** Ensure all endpoints referenced in infrastructure-as-code actually exist in the application.

## 2025-12-19 - Ghost Dependency Lockfile Drift
**Vulnerability:** Inconsistent dependency state leading to potential build instability and masking of malicious dependency changes.
**Learning:** The project's `package.json` and `pnpm-lock.yaml` are out of sync due to ghost dependencies (e.g., `@eslint/eslintrc`) that `pnpm` automatically prunes during installation. This creates noise in security PRs.
**Prevention:** Regularly run `pnpm install` and commit the updated lockfile to keep it synchronized with `package.json`.

## 2025-12-19 - CI Action Pinning Failure
**Vulnerability:** Supply chain risk from unverified action versions, compounded by stale or incorrect SHA references breaking the build pipeline.
**Learning:** The project used an invalid SHA for `actions/upload-artifact`, causing CI failure. This highlights the importance of verifying SHA pins against official tags using tools like `git ls-remote`.
**Prevention:** Regularly audit and update action pins using automated tools or strict manual verification against the action's repository tags.
