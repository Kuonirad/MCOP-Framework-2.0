## 2025-12-19 - Content Security Policy Implementation
**Vulnerability:** Missing Content Security Policy (CSP) and Permissions-Policy headers.
**Learning:** Next.js applications require careful CSP configuration to avoid breaking functionality (scripts, images, styles). Specifically, `next/image` requires allowing `data:` for images in some cases or specific domains. `unsafe-inline` or `unsafe-eval` might be needed for some development features, but we should strive for strictness in production.
**Prevention:** Always implement a strict CSP by default and loosen it only as necessary. Use `Permissions-Policy` to disable unused browser features.

## 2025-12-19 - Docker Health Check Availability Gap
**Vulnerability:** The `Dockerfile` defined a `HEALTHCHECK` against a non-existent endpoint `/api/health`, ensuring production containers would fail health checks and be restarted (DoS).
**Learning:** Operational configuration files (Dockerfile, k8s manifests) are part of the security surface. Availability is a key security pillar.
**Prevention:** Ensure all endpoints referenced in infrastructure-as-code actually exist in the application.

## 2025-12-19 - Unredacted Structured Logs
**Vulnerability:** Sensitive data (passwords, tokens) was logged in plaintext because `pino` does not redact by default, leading to potential data leaks in log aggregators.
**Learning:** Structured loggers like `pino` prioritize performance and do not sanitize data automatically. Explicit redaction rules are mandatory for any application handling authentication.
**Prevention:** Always configure `redact.paths` in logger initialization with a comprehensive list of sensitive keys (`password`, `token`, `key`, etc.) and their wildcard variations.
