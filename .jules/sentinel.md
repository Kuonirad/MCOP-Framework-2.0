## 2025-12-19 - Content Security Policy Implementation
**Vulnerability:** Missing Content Security Policy (CSP) and Permissions-Policy headers.
**Learning:** Next.js applications require careful CSP configuration to avoid breaking functionality (scripts, images, styles). Specifically, `next/image` requires allowing `data:` for images in some cases or specific domains. `unsafe-inline` or `unsafe-eval` might be needed for some development features, but we should strive for strictness in production.
**Prevention:** Always implement a strict CSP by default and loosen it only as necessary. Use `Permissions-Policy` to disable unused browser features.

## 2025-12-19 - Docker Health Check Availability Gap
**Vulnerability:** The `Dockerfile` defined a `HEALTHCHECK` against a non-existent endpoint `/api/health`, ensuring production containers would fail health checks and be restarted (DoS).
**Learning:** Operational configuration files (Dockerfile, k8s manifests) are part of the security surface. Availability is a key security pillar.
**Prevention:** Ensure all endpoints referenced in infrastructure-as-code actually exist in the application.
## 2025-03-12 - [Event-Loop Blocking DoS] Unbounded Synchronous Hashing in NovaNeoEncoder
**Vulnerability:** The `NovaNeoEncoder` was directly passing unbounded string inputs (`text`) to Node.js `crypto.createHash('sha256').update(text).digest()` in a synchronous operation. A malicious user could send a massive string (e.g., hundreds of megabytes), causing the event loop to block completely while computing the hash, leading to a Denial of Service (DoS).
**Learning:** Node.js synchronous crypto operations will block the main thread. While hashing is generally fast, it is strictly $O(N)$ with respect to the input size. For an application with unauthenticated endpoints or unbounded input layers, this provides a trivial asymmetric DoS vector where a single attacker can freeze the entire application.
**Prevention:** Always enforce a strict `maxInputLength` (e.g., 8192 characters) before executing synchronous hashing or other heavy algorithmic operations (like parsing). The length limit should be checked early and configurable via the corresponding interface (e.g., `NovaNeoConfig`).
