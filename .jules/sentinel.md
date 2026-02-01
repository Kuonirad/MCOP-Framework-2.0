## 2025-12-19 - Content Security Policy Implementation
**Vulnerability:** Missing Content Security Policy (CSP) and Permissions-Policy headers.
**Learning:** Next.js applications require careful CSP configuration to avoid breaking functionality (scripts, images, styles). Specifically, `next/image` requires allowing `data:` for images in some cases or specific domains. `unsafe-inline` or `unsafe-eval` might be needed for some development features, but we should strive for strictness in production.
**Prevention:** Always implement a strict CSP by default and loosen it only as necessary. Use `Permissions-Policy` to disable unused browser features.

## 2025-12-19 - Docker Health Check Availability Gap
**Vulnerability:** The `Dockerfile` defined a `HEALTHCHECK` against a non-existent endpoint `/api/health`, ensuring production containers would fail health checks and be restarted (DoS).
**Learning:** Operational configuration files (Dockerfile, k8s manifests) are part of the security surface. Availability is a key security pillar.
**Prevention:** Ensure all endpoints referenced in infrastructure-as-code actually exist in the application.

## 2025-12-19 - Sensitive Data Redaction in Logging
**Vulnerability:** The application logger (`src/utils/logger.ts`) was initialized without a redaction configuration, causing sensitive fields like `password` and `token` to be logged in plain text (CWE-532).
**Learning:** Initializing a logger library (like Pino) is not enough; explicit configuration for PII/secret redaction is mandatory from day one. Case sensitivity in redaction keys (e.g., `Authorization` vs `authorization`) must be considered for HTTP headers.
**Prevention:** Use a shared, strictly typed logger configuration across all microservices/modules that enforces a default deny-list for common sensitive keys.
