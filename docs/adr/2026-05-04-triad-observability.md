# ADR — Triad observability hooks

- **Status:** Accepted
- **Date:** 2026-05-04
- **Context owners:** MCOP audit remediation — OpenTelemetry instrumentation track.

## Context

The master audit tracker lists OpenTelemetry as one of the genuine remaining
operational-excellence gaps. The core triad is intentionally deterministic and
must stay dependency-light for browser, Node, and package consumers, so directly
binding `src/core` to an OpenTelemetry SDK would add runtime weight and collector
topology assumptions before the project has a deployment-specific collector ADR.

## Decision

Add a small, dependency-free telemetry seam in `src/core/observability.ts`:

1. `configureTriadTelemetry(observer)` installs an optional span observer.
2. Core operations emit span snapshots for encode, trace record, resonance
   query, etch scoring, etch apply, and full synthesis.
3. Span attributes use stable `mcop.*` keys that can be mapped to OpenTelemetry
   span attributes by a downstream adapter.
4. Observer errors are swallowed so telemetry cannot alter synthesis, Merkle
   roots, confidence scores, or etch acceptance.

This lands the instrumentation points now while preserving the project’s
determinism and keeping collector/exporter selection outside the core package.

## Consequences

- Consumers can bridge the observer to OpenTelemetry, Prometheus exemplars, or
  structured logs without new core dependencies.
- The triad remains safe in browser contexts and test environments where no
  telemetry backend exists.
- A future collector topology ADR can add an adapter package or app-level
  exporter without changing the core instrumentation surface.
