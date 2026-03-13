## 2025-12-19 - Content Security Policy Implementation
**Vulnerability:** Missing Content Security Policy (CSP) and Permissions-Policy headers.
**Learning:** Next.js applications require careful CSP configuration to avoid breaking functionality (scripts, images, styles). Specifically, `next/image` requires allowing `data:` for images in some cases or specific domains. `unsafe-inline` or `unsafe-eval` might be needed for some development features, but we should strive for strictness in production.
**Prevention:** Always implement a strict CSP by default and loosen it only as necessary. Use `Permissions-Policy` to disable unused browser features.

## 2025-12-19 - Docker Health Check Availability Gap
**Vulnerability:** The `Dockerfile` defined a `HEALTHCHECK` against a non-existent endpoint `/api/health`, ensuring production containers would fail health checks and be restarted (DoS).
**Learning:** Operational configuration files (Dockerfile, k8s manifests) are part of the security surface. Availability is a key security pillar.
**Prevention:** Ensure all endpoints referenced in infrastructure-as-code actually exist in the application.

## 2025-03-13 - [DoS Risk via Unbounded Synchronous Hashing]
**Vulnerability:** The `NovaNeoEncoder.encode()` method in `src/core/novaNeoEncoder.ts` accepted unbounded string lengths which were passed synchronously to Node's `crypto.createHash('sha256').update(text)`.
**Learning:** In Node.js (V8), synchronous cryptographic operations block the event loop. If an attacker inputs an extremely large payload, the thread becomes frozen while processing, allowing for a Denial of Service (DoS) attack, eventually exhausting memory or crashing the application.
**Prevention:** We introduced an optional `maxInputLength` configuration property to `NovaNeoConfig` (defaulting to 8192) and implemented validation inside `encode()` to immediately throw an error when the limit is exceeded.
