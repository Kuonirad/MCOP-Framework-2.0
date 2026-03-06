## 2025-12-19 - Content Security Policy Implementation
**Vulnerability:** Missing Content Security Policy (CSP) and Permissions-Policy headers.
**Learning:** Next.js applications require careful CSP configuration to avoid breaking functionality (scripts, images, styles). Specifically, `next/image` requires allowing `data:` for images in some cases or specific domains. `unsafe-inline` or `unsafe-eval` might be needed for some development features, but we should strive for strictness in production.
**Prevention:** Always implement a strict CSP by default and loosen it only as necessary. Use `Permissions-Policy` to disable unused browser features.

## 2025-12-19 - Docker Health Check Availability Gap
**Vulnerability:** The `Dockerfile` defined a `HEALTHCHECK` against a non-existent endpoint `/api/health`, ensuring production containers would fail health checks and be restarted (DoS).
**Learning:** Operational configuration files (Dockerfile, k8s manifests) are part of the security surface. Availability is a key security pillar.
**Prevention:** Ensure all endpoints referenced in infrastructure-as-code actually exist in the application.

## 2025-12-19 - Synchronous Hash Event Loop Denial of Service
**Vulnerability:** `crypto.createHash('sha256').update(text)` operation was performed on unbounded input length strings in `NovaNeoEncoder`.
**Learning:** In Node.js (V8), synchronous operations like `crypto.createHash` block the event loop. Unbounded inputs allow malicious users to send extremely large payloads (e.g., hundreds of MBs), halting the entire server for other requests, creating a Denial of Service (DoS) vulnerability.
**Prevention:** Always enforce a reasonable, hard maximum size (`maxInputLength`) limit on input data before executing computationally expensive synchronous operations.