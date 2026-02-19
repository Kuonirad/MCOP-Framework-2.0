## 2025-12-19 - Content Security Policy Implementation
**Vulnerability:** Missing Content Security Policy (CSP) and Permissions-Policy headers.
**Learning:** Next.js applications require careful CSP configuration to avoid breaking functionality (scripts, images, styles). Specifically, `next/image` requires allowing `data:` for images in some cases or specific domains. `unsafe-inline` or `unsafe-eval` might be needed for some development features, but we should strive for strictness in production.
**Prevention:** Always implement a strict CSP by default and loosen it only as necessary. Use `Permissions-Policy` to disable unused browser features.

## 2025-12-19 - Docker Health Check Availability Gap
**Vulnerability:** The `Dockerfile` defined a `HEALTHCHECK` against a non-existent endpoint `/api/health`, ensuring production containers would fail health checks and be restarted (DoS).
**Learning:** Operational configuration files (Dockerfile, k8s manifests) are part of the security surface. Availability is a key security pillar.
**Prevention:** Ensure all endpoints referenced in infrastructure-as-code actually exist in the application.

## 2025-12-19 - Logging Redaction Discrepancy
**Vulnerability:** The `pino` logger configuration was missing redaction settings for sensitive fields (e.g., passwords, tokens), despite documentation/memory suggesting otherwise. This could lead to accidental exposure of credentials in logs.
**Learning:** Security configurations must be treated as code and verified with automated tests to prevent regression or drift. Documentation is not a substitute for verification.
**Prevention:** Added a specific unit test (`src/__tests__/security.logging.test.ts`) that asserts the presence of redaction rules in the logger configuration.
