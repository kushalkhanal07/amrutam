/**
 * OpenTelemetry bootstrap. Must be imported before anything else in main.ts so
 * the auto-instrumentations can patch http/express/pg before they are loaded.
 *
 * Exporting is enabled only when OTEL_EXPORTER_OTLP_TRACES_ENDPOINT is set
 * (e.g. http://localhost:4318/v1/traces for the Jaeger container in
 * docker-compose). Without it the SDK is not started and tracing is a no-op.
 */
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { PrismaInstrumentation } from '@prisma/instrumentation';

const endpoint = process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT;

export const otelSdk: NodeSDK | undefined = endpoint
  ? new NodeSDK({
      serviceName: process.env.OTEL_SERVICE_NAME ?? 'amrutam-backend',
      traceExporter: new OTLPTraceExporter({ url: endpoint, timeoutMillis: 5000 }),
      instrumentations: [
        getNodeAutoInstrumentations({
          '@opentelemetry/instrumentation-fs': { enabled: false },
          '@opentelemetry/instrumentation-http': {
            ignoreIncomingRequestHook: (req) => ['/health', '/ready', '/metrics'].includes(req.url ?? ''),
          },
        }),
        new PrismaInstrumentation(),
      ],
    })
  : undefined;

if (otelSdk) {
  otelSdk.start();
}

export async function shutdownTracing(): Promise<void> {
  if (otelSdk) {
    await otelSdk.shutdown();
  }
}
