## 2025-12-19 - Content Security Policy Implementation
**Vulnerability:** Missing Content Security Policy (CSP) and Permissions-Policy headers.
**Learning:** Next.js applications require careful CSP configuration to avoid breaking functionality (scripts, images, styles). Specifically, `next/image` requires allowing `data:` for images in some cases or specific domains. `unsafe-inline` or `unsafe-eval` might be needed for some development features, but we should strive for strictness in production.
**Prevention:** Always implement a strict CSP by default and loosen it only as necessary. Use `Permissions-Policy` to disable unused browser features.

## 2025-12-19 - Docker Health Check Availability Gap
**Vulnerability:** The `Dockerfile` defined a `HEALTHCHECK` against a non-existent endpoint `/api/health`, ensuring production containers would fail health checks and be restarted (DoS).
**Learning:** Operational configuration files (Dockerfile, k8s manifests) are part of the security surface. Availability is a key security pillar.
**Prevention:** Ensure all endpoints referenced in infrastructure-as-code actually exist in the application.

## 2025-01-22 - [Critical] Unbounded Synchronous Hashing DoS Risk
**Vulnerability:** The `NovaNeoEncoder` processed text via synchronous `crypto.createHash('sha256').update(text)` without enforcing any bounds on the input string `text` length.
**Learning:** Because Node.js is single-threaded and `crypto.createHash` execution is synchronous for the digest calculation, feeding it unconstrained payload sizes blocks the event loop. If an attacker submits extremely large strings, the system will become unresponsive and can lead to memory exhaustion / DoS vulnerabilities.
**Prevention:** Always implement bounded constraints or enforce a `maxInputLength` limit on data inputs prior to performing expensive synchronous operations. We added a configurable but bounded constraint in `NovaNeoConfig` defaulting to 8192 characters.
