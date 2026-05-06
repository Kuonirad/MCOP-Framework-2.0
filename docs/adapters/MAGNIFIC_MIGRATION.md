# Magnific Migration Guide (Freepik Wrapper Deprecation)

`FreepikMCOPAdapter` is a compatibility wrapper around `MagnificMCOPAdapter` and
is scheduled for removal in v3.0.0 (target 2026-Q3). New development should use
Magnific naming directly.

## Migration checklist

1. Replace `FreepikMCOPAdapter` imports with `MagnificMCOPAdapter`.
2. Update endpoint assumptions from legacy Freepik paths to `/v1/ai/*` Magnific
   routes in provider configuration.
3. Remove legacy `turbo` and `premium_quality` booleans; express those choices
   as provider-specific Magnific options in adapter metadata.
4. Keep provenance metadata stable during migration: record the adapter rename in
   request metadata instead of changing the synthesis payload shape.

This keeps the adapter layer honest: deprecated names remain available for
existing users, while the positive path for new capability work is Magnific-first.
