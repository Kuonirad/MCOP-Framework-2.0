## 2025-12-19 - Content Security Policy Implementation
**Vulnerability:** Missing Content Security Policy (CSP) and Permissions-Policy headers.
**Learning:** Next.js applications require careful CSP configuration to avoid breaking functionality (scripts, images, styles). Specifically, `next/image` requires allowing `data:` for images in some cases or specific domains. `unsafe-inline` or `unsafe-eval` might be needed for some development features, but we should strive for strictness in production.
**Prevention:** Always implement a strict CSP by default and loosen it only as necessary. Use `Permissions-Policy` to disable unused browser features.

## 2025-12-19 - Docker Health Check Availability Gap
**Vulnerability:** The `Dockerfile` defined a `HEALTHCHECK` against a non-existent endpoint `/api/health`, ensuring production containers would fail health checks and be restarted (DoS).
**Learning:** Operational configuration files (Dockerfile, k8s manifests) are part of the security surface. Availability is a key security pillar.
**Prevention:** Ensure all endpoints referenced in infrastructure-as-code actually exist in the application.

## 2025-12-19 - Cryptographically Strong Trace Identifiers
**Vulnerability:** Use of potentially weak or non-standard ID generation patterns in core stigmergy logic.
**Learning:** Transitioning to `node:crypto`'s `randomUUID()` ensures collision-resistant and cryptographically strong identifiers, which are critical for trace integrity and auditability in the MCOP Framework.
**Prevention:** Avoid custom ID schemes (like `Date.now()` based) or `Math.random()` for security-critical identifiers. Always favor standard, cryptographically secure native implementations.
## 2025-12-19 - Strict External Link Hardening\n**Vulnerability:** External links lacked the `noreferrer` attribute.\n**Learning:** While `noopener` prevents the newly opened page from accessing the original page's `window.opener` object, it still leaks the origin URL via the `Referer` header. Adding `noreferrer` is essential for complete privacy and security hygiene on external navigation.\n**Prevention:** Always verify both `noopener` and `noreferrer` exist on `target="_blank"` links.

## 2025-12-19 - Cryptographically Weak Identifier Truncation
**Vulnerability:** Core reasoning objects (`Problem`, `Solution`, `Evidence`, `Hypothesis`, `ReasoningChain`) truncated `uuid.uuid4()` to 8 characters (`str(uuid.uuid4())[:8]`) for their identifiers. This reduced entropy from 122 bits to just 32 bits, creating a high probability of collision (Birthday Paradox) in parallel reasoning scenarios and introducing IDOR risks.
**Learning:** Even when using a cryptographically secure random number generator (like `uuid4()`), truncating the output artificially diminishes its security guarantees.
**Prevention:** Always retain the full length of generated UUIDs unless specifically required by an external system constraint, and in those cases, verify the entropy remains sufficient for the threat model.
