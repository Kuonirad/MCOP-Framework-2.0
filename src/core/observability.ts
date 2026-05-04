export type TriadSpanName =
  | 'mcop.triad.encode'
  | 'mcop.triad.trace.record'
  | 'mcop.triad.resonance.query'
  | 'mcop.triad.etch.score'
  | 'mcop.triad.etch.apply'
  | 'mcop.triad.synthesize';

export type TriadAttributeValue = string | number | boolean;

export interface TriadSpanSnapshot {
  name: TriadSpanName;
  startedAt: string;
  durationMs: number;
  status: 'ok' | 'error';
  attributes: Record<string, TriadAttributeValue>;
}

export type TriadTelemetryObserver = (span: TriadSpanSnapshot) => void;

interface ActiveSpan {
  name: TriadSpanName;
  startedAt: string;
  startedAtMs: number;
  attributes: Record<string, TriadAttributeValue>;
}

let observer: TriadTelemetryObserver | undefined;

export function configureTriadTelemetry(next?: TriadTelemetryObserver): void {
  observer = next;
}

export function isTriadTelemetryEnabled(): boolean {
  return observer !== undefined;
}

export function startTriadSpan(
  name: TriadSpanName,
  attributes: Record<string, unknown> = {},
): ActiveSpan {
  return {
    name,
    startedAt: new Date().toISOString(),
    startedAtMs: nowMs(),
    attributes: sanitizeAttributes(attributes),
  };
}

export function finishTriadSpan(
  span: ActiveSpan,
  attributes: Record<string, unknown> = {},
): void {
  emitSpan(span, 'ok', attributes);
}

export function failTriadSpan(
  span: ActiveSpan,
  error: unknown,
  attributes: Record<string, unknown> = {},
): void {
  const errorType = error instanceof Error ? error.name : typeof error;
  emitSpan(span, 'error', {
    ...attributes,
    'error.type': errorType,
  });
}

function emitSpan(
  span: ActiveSpan,
  status: TriadSpanSnapshot['status'],
  attributes: Record<string, unknown>,
): void {
  if (!observer) return;
  const snapshot: TriadSpanSnapshot = {
    name: span.name,
    startedAt: span.startedAt,
    durationMs: Math.max(0, nowMs() - span.startedAtMs),
    status,
    attributes: {
      ...span.attributes,
      ...sanitizeAttributes(attributes),
    },
  };
  try {
    observer(snapshot);
  } catch {
    // Telemetry must never affect deterministic triad execution.
  }
}

function sanitizeAttributes(attributes: Record<string, unknown>): Record<string, TriadAttributeValue> {
  const out: Record<string, TriadAttributeValue> = {};
  for (const [key, value] of Object.entries(attributes)) {
    if (
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean'
    ) {
      out[key] = value;
    }
  }
  return out;
}

function nowMs(): number {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
}
