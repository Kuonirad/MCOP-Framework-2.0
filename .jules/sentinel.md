## 2025-12-19 - Content Security Policy Implementation
**Vulnerability:** Missing Content Security Policy (CSP) and Permissions-Policy headers.
**Learning:** Next.js applications require careful CSP configuration to avoid breaking functionality (scripts, images, styles). Specifically, `next/image` requires allowing `data:` for images in some cases or specific domains. `unsafe-inline` or `unsafe-eval` might be needed for some development features, but we should strive for strictness in production.
**Prevention:** Always implement a strict CSP by default and loosen it only as necessary. Use `Permissions-Policy` to disable unused browser features.

## 2025-12-19 - Docker Health Check Availability Gap
**Vulnerability:** The `Dockerfile` defined a `HEALTHCHECK` against a non-existent endpoint `/api/health`, ensuring production containers would fail health checks and be restarted (DoS).
**Learning:** Operational configuration files (Dockerfile, k8s manifests) are part of the security surface. Availability is a key security pillar.
**Prevention:** Ensure all endpoints referenced in infrastructure-as-code actually exist in the application.
## 2025-01-01 - [DoS via Memory Exhaustion in NovaNeoEncoder]
**Vulnerability:** The `NovaNeoEncoder` lacked input length limits, allowing excessively large strings to be hashed. This could exhaust memory or cause excessive CPU load, leading to Denial of Service (DoS) attacks.
**Learning:** Synchronous hashing operations (`crypto.createHash`) on unbound inputs in Node.js block the event loop and scale memory linearly with input size.
**Prevention:** Always enforce a configurable `maxInputLength` limit on data before performing expensive synchronous operations or allocations.
