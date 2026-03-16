## 2025-12-19 - Content Security Policy Implementation
**Vulnerability:** Missing Content Security Policy (CSP) and Permissions-Policy headers.
**Learning:** Next.js applications require careful CSP configuration to avoid breaking functionality (scripts, images, styles). Specifically, `next/image` requires allowing `data:` for images in some cases or specific domains. `unsafe-inline` or `unsafe-eval` might be needed for some development features, but we should strive for strictness in production.
**Prevention:** Always implement a strict CSP by default and loosen it only as necessary. Use `Permissions-Policy` to disable unused browser features.

## 2025-12-19 - Docker Health Check Availability Gap
**Vulnerability:** The `Dockerfile` defined a `HEALTHCHECK` against a non-existent endpoint `/api/health`, ensuring production containers would fail health checks and be restarted (DoS).
**Learning:** Operational configuration files (Dockerfile, k8s manifests) are part of the security surface. Availability is a key security pillar.
**Prevention:** Ensure all endpoints referenced in infrastructure-as-code actually exist in the application.

## 2025-12-19 - Pino Log Redaction
**Vulnerability:** Inadvertent logging of sensitive information (passwords, tokens, API keys, etc.).
**Learning:** Application logs can easily become a massive source of data leaks. Simple operations like logging an entire request object can dump cookies and authorization headers into centralized logging systems where access control might be looser.
**Prevention:** Always configure loggers (like Pino) with a `redact` array by default. Prefix redaction configurations with a `// SECURITY:` comment to ensure they are not accidentally removed during refactoring.
