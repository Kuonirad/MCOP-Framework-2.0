## 2025-03-20 - Pino Logger Redaction
**Vulnerability:** Inadvertent logging of sensitive information like passwords and tokens in the clear.
**Learning:** Pino does not automatically redact sensitive fields unless explicitly configured.
**Prevention:** Always configure the `redact` array in `pino` options to omit sensitive keys.
