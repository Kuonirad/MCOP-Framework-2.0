
## 2025-12-19 - Pino Log Redaction
**Vulnerability:** Sensitive information exposure via logs.
**Learning:** Pino logger without a redact configuration can inadvertently leak sensitive data like passwords and tokens into production logs.
**Prevention:** Always configure logging libraries with a redact array for known sensitive keys.
