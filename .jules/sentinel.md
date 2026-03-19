## 2025-12-19 - Content Security Policy Implementation
**Vulnerability:** Missing Content Security Policy (CSP) and Permissions-Policy headers.
**Learning:** Next.js applications require careful CSP configuration to avoid breaking functionality (scripts, images, styles). Specifically, `next/image` requires allowing `data:` for images in some cases or specific domains. `unsafe-inline` or `unsafe-eval` might be needed for some development features, but we should strive for strictness in production.
**Prevention:** Always implement a strict CSP by default and loosen it only as necessary. Use `Permissions-Policy` to disable unused browser features.

## 2025-12-19 - Docker Health Check Availability Gap
**Vulnerability:** The `Dockerfile` defined a `HEALTHCHECK` against a non-existent endpoint `/api/health`, ensuring production containers would fail health checks and be restarted (DoS).
**Learning:** Operational configuration files (Dockerfile, k8s manifests) are part of the security surface. Availability is a key security pillar.
**Prevention:** Ensure all endpoints referenced in infrastructure-as-code actually exist in the application.

## 2025-12-19 - Missing Log Redaction for Sensitive Data
**Vulnerability:** The pino logger configuration lacked log redaction for sensitive fields (e.g., password, token, authorization, apiKey, secret, cookie), which could lead to inadvertent exposure of sensitive data in application logs.
**Learning:** Even structured loggers can leak sensitive data if not explicitly configured to sanitize or mask specific keys globally. Logs are often collected and stored in centralized systems, expanding the surface area for data breaches if secrets are logged.
**Prevention:** Always configure log redaction rules in the core logger instance (e.g., using `redact` array in `pino`) for known sensitive terms, regardless of individual usage.
