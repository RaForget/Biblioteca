import os
import json
import logging
from opentelemetry import trace, metrics
from opentelemetry.sdk.metrics import MeterProvider
from opentelemetry.sdk.metrics.export import PeriodicExportingMetricReader
from opentelemetry.exporter.otlp.proto.http.metric_exporter import OTLPMetricExporter
from opentelemetry.sdk._logs import LoggerProvider, LoggingHandler
from opentelemetry.sdk._logs.export import BatchLogRecordProcessor
from opentelemetry.exporter.otlp.proto.http._log_exporter import OTLPLogExporter
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter

meter = metrics.get_meter("notifications-consumer")
processed = meter.create_counter("biblioteca.notifications", description="Eventos processados")
duration = meter.create_histogram("biblioteca.notification.processing.duration", unit="s",
    explicit_bucket_boundaries_advisory=[0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10])


def record_notification(outcome, seconds):
    processed.add(1, {"outcome": outcome})
    duration.record(seconds, {"outcome": outcome})


class JsonTelemetryFormatter(logging.Formatter):
    def format(self, record):
        ctx = trace.get_current_span().get_span_context()
        return json.dumps({"message": record.getMessage(), **({"traceId": format(ctx.trace_id, "032x")} if ctx.is_valid else {})}, ensure_ascii=False, separators=(",", ":"))


class Telemetry:
    def __init__(self, providers):
        self.providers = providers

    def shutdown(self):
        for provider in self.providers:
            provider.shutdown()


def setup_telemetry():
    endpoint = os.getenv("OTEL_EXPORTER_OTLP_ENDPOINT")
    if not endpoint:
        return None
    resource = Resource.create({
        "service.name": "notifications-consumer",
        "service.namespace": "biblioteca",
        "service.version": "0.1.0",
    })
    provider = TracerProvider(resource=resource)
    provider.add_span_processor(BatchSpanProcessor(
        OTLPSpanExporter(endpoint=endpoint.rstrip("/") + "/v1/traces"), schedule_delay_millis=1000))
    trace.set_tracer_provider(provider)
    metric_provider = MeterProvider(resource=resource, metric_readers=[PeriodicExportingMetricReader(
        OTLPMetricExporter(endpoint=endpoint.rstrip("/") + "/v1/metrics"), export_interval_millis=5000)])
    metrics.set_meter_provider(metric_provider)
    log_provider = LoggerProvider(resource=resource)
    log_provider.add_log_record_processor(BatchLogRecordProcessor(
        OTLPLogExporter(endpoint=endpoint.rstrip("/") + "/v1/logs"), schedule_delay_millis=1000))
    handler = LoggingHandler(level=logging.INFO, logger_provider=log_provider)
    handler.setFormatter(JsonTelemetryFormatter())
    logging.getLogger("notifications").addHandler(handler)
    return Telemetry([provider, metric_provider, log_provider])
