## 2025-12-19 - Content Security Policy Implementation
**Vulnerability:** Missing Content Security Policy (CSP) and Permissions-Policy headers.
**Learning:** Next.js applications require careful CSP configuration to avoid breaking functionality (scripts, images, styles). Specifically, `next/image` requires allowing `data:` for images in some cases or specific domains. `unsafe-inline` or `unsafe-eval` might be needed for some development features, but we should strive for strictness in production.
**Prevention:** Always implement a strict CSP by default and loosen it only as necessary. Use `Permissions-Policy` to disable unused browser features.

## 2025-12-19 - Docker Health Check Availability Gap
**Vulnerability:** The `Dockerfile` defined a `HEALTHCHECK` against a non-existent endpoint `/api/health`, ensuring production containers would fail health checks and be restarted (DoS).
**Learning:** Operational configuration files (Dockerfile, k8s manifests) are part of the security surface. Availability is a key security pillar.
**Prevention:** Ensure all endpoints referenced in infrastructure-as-code actually exist in the application.

## 2025-12-19 - Logger Sensitive Data Leaks
**Vulnerability:** The `pino` logger configuration was missing redaction rules, causing sensitive data (passwords, tokens, API keys) to be logged in plain text if passed to the logger.
**Learning:** Logging libraries often default to full serialization. Explicit redaction configuration is necessary to implement "Fail Securely" for logging. Even if developers try to avoid logging secrets, accidental object dumps can occur.
**Prevention:** Configure the logger (e.g., `pino`) with a strict `redact` list including common sensitive field names (`password`, `token`, `key`, `secret`, `authorization`, etc.) and their wildcard variations.
