## 2025-12-19 - Content Security Policy Implementation
**Vulnerability:** Missing Content Security Policy (CSP) and Permissions-Policy headers.
**Learning:** Next.js applications require careful CSP configuration to avoid breaking functionality (scripts, images, styles). Specifically, `next/image` requires allowing `data:` for images in some cases or specific domains. `unsafe-inline` or `unsafe-eval` might be needed for some development features, but we should strive for strictness in production.
**Prevention:** Always implement a strict CSP by default and loosen it only as necessary. Use `Permissions-Policy` to disable unused browser features.

## 2025-12-19 - Docker Health Check Availability Gap
**Vulnerability:** The `Dockerfile` defined a `HEALTHCHECK` against a non-existent endpoint `/api/health`, ensuring production containers would fail health checks and be restarted (DoS).
**Learning:** Operational configuration files (Dockerfile, k8s manifests) are part of the security surface. Availability is a key security pillar.
**Prevention:** Ensure all endpoints referenced in infrastructure-as-code actually exist in the application.

## 2026-01-15 - TOCTOU in Python File Output
**Vulnerability:** The CLI used `os.path.exists()` check followed by `open(..., 'w')` to prevent overwriting, which is vulnerable to Time-of-Check Time-of-Use (TOCTOU) race conditions.
**Learning:** Checking for file existence before writing is not atomic. An attacker can create the file between the check and the write.
**Prevention:** Use `open(..., 'x')` (exclusive creation mode) which atomically checks and creates the file, failing if it already exists.
