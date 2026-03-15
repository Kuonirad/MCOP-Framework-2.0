## 2025-12-19 - Content Security Policy Implementation
**Vulnerability:** Missing Content Security Policy (CSP) and Permissions-Policy headers.
**Learning:** Next.js applications require careful CSP configuration to avoid breaking functionality (scripts, images, styles). Specifically, `next/image` requires allowing `data:` for images in some cases or specific domains. `unsafe-inline` or `unsafe-eval` might be needed for some development features, but we should strive for strictness in production.
**Prevention:** Always implement a strict CSP by default and loosen it only as necessary. Use `Permissions-Policy` to disable unused browser features.

## 2025-12-19 - Docker Health Check Availability Gap
**Vulnerability:** The `Dockerfile` defined a `HEALTHCHECK` against a non-existent endpoint `/api/health`, ensuring production containers would fail health checks and be restarted (DoS).
**Learning:** Operational configuration files (Dockerfile, k8s manifests) are part of the security surface. Availability is a key security pillar.
**Prevention:** Ensure all endpoints referenced in infrastructure-as-code actually exist in the application.

## 2025-12-19 - Log Redaction for Sensitive Data
**Vulnerability:** Application logs were capturing and potentially exposing sensitive data (passwords, tokens, cookies, API keys) due to missing redaction configurations in the centralized logger (`pino`).
**Learning:** Centralized logging systems are frequent sources of sensitive data leaks. When configuring logging utilities, proactive data sanitization must be implemented at the source.
**Prevention:** Always configure loggers (e.g., `pino` via the `redact` option) to censor known sensitive fields across all environments.
