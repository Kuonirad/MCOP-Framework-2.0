## 2025-12-19 - Content Security Policy Implementation
**Vulnerability:** Missing Content Security Policy (CSP) and Permissions-Policy headers.
**Learning:** Next.js applications require careful CSP configuration to avoid breaking functionality (scripts, images, styles). Specifically, `next/image` requires allowing `data:` for images in some cases or specific domains. `unsafe-inline` or `unsafe-eval` might be needed for some development features, but we should strive for strictness in production.
**Prevention:** Always implement a strict CSP by default and loosen it only as necessary. Use `Permissions-Policy` to disable unused browser features.

## 2025-12-19 - Docker Health Check Availability Gap
**Vulnerability:** The `Dockerfile` defined a `HEALTHCHECK` against a non-existent endpoint `/api/health`, ensuring production containers would fail health checks and be restarted (DoS).
**Learning:** Operational configuration files (Dockerfile, k8s manifests) are part of the security surface. Availability is a key security pillar.
**Prevention:** Ensure all endpoints referenced in infrastructure-as-code actually exist in the application.

## 2025-12-19 - Sensitive Data Leakage via Logs
**Vulnerability:** The logger was initialized without redaction rules, potentially exposing sensitive data (passwords, tokens) in application logs.
**Learning:** Logging libraries like Pino are powerful but default to logging everything. Explicitly configuring redaction for common sensitive keys ('password', 'token', etc.) is a critical defense-in-depth measure.
**Prevention:** Always configure the logger with a comprehensive list of sensitive keys to redact. Enforce this via configuration tests.

## 2025-12-19 - Testing Singleton Configurations with Jest
**Vulnerability:** Incorrect test implementation for singleton modules can lead to false positives/negatives due to module caching and mock hoisting.
**Learning:** When testing configuration of a singleton exported from a module, `jest.mock` is hoisted, but the mock factory runs lazily. `jest.resetModules()` clears the cache, causing re-execution of the module and the mock factory. Tests must retrieve the *current* mock instance from the registry (e.g., via `await import()`) after resetting modules to assert against the correct spy.
**Prevention:** Use `jest.resetModules()` and re-import the mocked module within the test to capture the fresh instance. Avoid relying on top-level imports for assertions on re-initialized modules.
