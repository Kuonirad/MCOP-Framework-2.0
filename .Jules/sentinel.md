## 2025-05-24 - Sensitive Data Leakage in Logs
**Vulnerability:** Application logs are configured without redaction, potentially exposing sensitive credentials.
**Learning:** Unsanitized logs can become an attack vector if aggregated or exposed.
**Prevention:** Always configure loggers (like pino) with a redact array for common sensitive fields.
