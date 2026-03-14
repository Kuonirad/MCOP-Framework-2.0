## 2025-12-19 - Content Security Policy Implementation
**Vulnerability:** Missing Content Security Policy (CSP) and Permissions-Policy headers.
**Learning:** Next.js applications require careful CSP configuration to avoid breaking functionality (scripts, images, styles). Specifically, `next/image` requires allowing `data:` for images in some cases or specific domains. `unsafe-inline` or `unsafe-eval` might be needed for some development features, but we should strive for strictness in production.
**Prevention:** Always implement a strict CSP by default and loosen it only as necessary. Use `Permissions-Policy` to disable unused browser features.

## 2025-12-19 - Docker Health Check Availability Gap
**Vulnerability:** The `Dockerfile` defined a `HEALTHCHECK` against a non-existent endpoint `/api/health`, ensuring production containers would fail health checks and be restarted (DoS).
**Learning:** Operational configuration files (Dockerfile, k8s manifests) are part of the security surface. Availability is a key security pillar.
**Prevention:** Ensure all endpoints referenced in infrastructure-as-code actually exist in the application.

## 2025-12-19 - Logging Data Leakage Prevention
**Vulnerability:** The `pino` logger configuration was missing redaction rules, making it possible to inadvertently log sensitive fields such as passwords, tokens, API keys, and cookies to standard output/logs.
**Learning:** Unsanitized logging is a common path for credential exposure in production systems. Even with good coding practices, an errant `logger.info({ user })` can leak authentication tokens or secrets if the logger isn't configured defensively.
**Prevention:** Always configure loggers with a default redaction list for common sensitive field names (e.g., password, token, authorization, apiKey, secret, cookie).
