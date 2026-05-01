// instrumentation.ts
// Next.js auto-loads this file at the project root when
// experimental.instrumentationHook is enabled (default in Next 14+).
// We dispatch into a Node-only module so OpenTelemetry's Node SDK
// is never bundled into the Edge runtime.
export async function register() {
    if (process.env.NEXT_RUNTIME === 'nodejs') {
          await import('./instrumentation.node');
    }
}
