import { context, propagation, trace, metrics, SpanKind, SpanStatusCode, type Span, type Attributes } from '@opentelemetry/api';
import { logs, SeverityNumber } from '@opentelemetry/api-logs';
import { BatchLogRecordProcessor } from '@opentelemetry/sdk-logs';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';

const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
const sdk = endpoint ? new NodeSDK({
  resource: resourceFromAttributes({ 'service.name': 'biblioteca-api', 'service.namespace': 'biblioteca', 'service.version': '0.1.0' }),
  traceExporter: new OTLPTraceExporter({ url: `${endpoint.replace(/\/$/, '')}/v1/traces` }),
  metricReaders: [new PeriodicExportingMetricReader({ exporter: new OTLPMetricExporter({ url: `${endpoint.replace(/\/$/, '')}/v1/metrics` }), exportIntervalMillis: 5000 })],
  logRecordProcessors: [new BatchLogRecordProcessor({ exporter: new OTLPLogExporter({ url: `${endpoint.replace(/\/$/, '')}/v1/logs` }), scheduledDelayMillis: 1000 })],
}) : undefined;
sdk?.start();
const meter = metrics.getMeter('biblioteca-api');
const requests = meter.createCounter('biblioteca.http.requests', { description: 'Requisições HTTP concluídas' });
const duration = meter.createHistogram('biblioteca.http.request.duration', { unit: 's', description: 'Duração HTTP', advice: { explicitBucketBoundaries: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10] } });
export function recordHttp(method: string, route: string, status: number, seconds: number) {
  const attributes = { 'http.request.method': method, 'http.route': route, 'http.response.status_code': status };
  requests.add(1, attributes); duration.record(seconds, attributes);
  if (status >= 400) emitLog(status >= 500 ? 'ERROR' : 'WARN', 'Requisição não concluída com sucesso', attributes);
}
export function emitLog(level: 'INFO' | 'WARN' | 'ERROR', message: string, attributes: Attributes = {}) {
  const traceId = trace.getSpan(context.active())?.spanContext().traceId;
  logs.getLogger('biblioteca-api').emit({
    severityNumber: SeverityNumber[level], severityText: level, context: context.active(),
    body: JSON.stringify({ message, ...(traceId ? { traceId } : {}), ...attributes }), attributes,
  });
}

export function withSpan<T>(name: string, attributes: Attributes, operation: (span: Span) => Promise<T>, kind = SpanKind.INTERNAL, carrier?: Record<string, string | string[] | undefined>): Promise<T> {
  const parent = carrier ? propagation.extract(context.active(), carrier) : context.active();
  return trace.getTracer('biblioteca-api').startActiveSpan(name, { attributes, kind }, parent, async span => {
    try { return await operation(span); }
    catch (error) {
      // Evita exportar payloads, senhas ou tokens como atributos.
      span.setStatus({ code: SpanStatusCode.ERROR });
      emitLog('ERROR', 'Falha na operação', { operation: name, 'error.type': error instanceof Error ? error.name : 'UnknownError' });
      if (error instanceof Error) span.recordException({ name: error.name, message: error.message });
      throw error;
    } finally { span.end(); }
  });
}
export function traceHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  propagation.inject(context.active(), headers);
  return headers;
}
export async function shutdownTelemetry() { await sdk?.shutdown(); }
export { SpanKind };
