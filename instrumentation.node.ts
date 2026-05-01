// instrumentation.node.ts
// Node-only OpenTelemetry bootstrap for the Next.js side of MCOP.
import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';

const endpoint = (process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? 'https://ingest.maple.dev').replace(/\/$/, '');
const apiKey = process.env.MAPLE_API_KEY;
const serviceName = process.env.OTEL_SERVICE_NAME ?? 'mcop-framework-2.0';

if (!apiKey) {
if (process.env.NODE_ENV === 'production') {
throw new Error('MAPLE_API_KEY is required for OpenTelemetry export.');
} else {
console.warn('[otel] MAPLE_API_KEY missing - traces will not be exported.');
}
}

const sdk = new NodeSDK({
resource: new Resource({
[SemanticResourceAttributes.SERVICE_NAME]: serviceName,
[SemanticResourceAttributes.SERVICE_VERSION]: process.env.npm_package_version ?? '0.0.0',
[SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: process.env.NODE_ENV ?? 'development',
}),
traceExporter: new OTLPTraceExporter({
url: endpoint + '/v1/traces',
headers: apiKey ? { Authorization: 'Bearer ' + apiKey } : undefined,
}),
instrumentations: [getNodeAutoInstrumentations()],
});

sdk.start();

process.on('SIGTERM', () => {
sdk.shutdown().finally(() => process.exit(0));
});
