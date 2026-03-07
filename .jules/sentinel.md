## 2025-12-19 - Content Security Policy Implementation
**Vulnerability:** Missing Content Security Policy (CSP) and Permissions-Policy headers.
**Learning:** Next.js applications require careful CSP configuration to avoid breaking functionality (scripts, images, styles). Specifically, `next/image` requires allowing `data:` for images in some cases or specific domains. `unsafe-inline` or `unsafe-eval` might be needed for some development features, but we should strive for strictness in production.
**Prevention:** Always implement a strict CSP by default and loosen it only as necessary. Use `Permissions-Policy` to disable unused browser features.

## 2025-12-19 - Docker Health Check Availability Gap
**Vulnerability:** The `Dockerfile` defined a `HEALTHCHECK` against a non-existent endpoint `/api/health`, ensuring production containers would fail health checks and be restarted (DoS).
**Learning:** Operational configuration files (Dockerfile, k8s manifests) are part of the security surface. Availability is a key security pillar.
**Prevention:** Ensure all endpoints referenced in infrastructure-as-code actually exist in the application.

## 2025-12-19 - Event-Loop Blocking DoS via Synchronous Hashing
**Vulnerability:** Synchronous hashing operations (`crypto.createHash`) were performed on unbounded user inputs, leading to a risk of memory exhaustion and Event-Loop Blocking Denial of Service (DoS) attacks.
**Learning:** Node.js executes in a single-threaded event loop. If synchronous operations take too long (e.g., hashing a massive string), no other requests can be processed. This is a common and critical security oversight.
**Prevention:** Always enforce a `maxInputLength` limit on unbounded input data before performing expensive synchronous operations like hashing or encryption.
