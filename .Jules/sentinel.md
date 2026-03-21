
## 2025-12-19 - Log Redaction
**Vulnerability:** Sensitive information could be inadvertently logged via `pino` if developers include user objects, API responses, or request payloads in log messages. This creates a risk of exposing secrets, tokens, or PII in logs.
**Learning:** The `pino` logger provides built-in `redact` configuration to prevent inadvertent logging of sensitive information. It should be configured explicitly to avoid PII exposure.
**Prevention:** Always configure log redaction arrays (e.g., `["password", "token", "authorization", "apiKey", "secret", "cookie"]`) at the centralized logger initialization point.
