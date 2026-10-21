import json
import logging
import os
import signal
import time
from confluent_kafka import Consumer, KafkaException
from .application import RegisterNotification
from .database import connect_database, MysqlNotificationRepository
from .domain import InvalidEvent
from .telemetry import setup_telemetry, record_notification
from opentelemetry import trace
from opentelemetry.propagate import extract

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("notifications")


def process_message(consumer, message, use_case, repository):
    carrier = {key: value.decode("utf-8", errors="replace")
        for key, value in (message.headers() or []) if value is not None and key in ("traceparent", "tracestate")}
    with trace.get_tracer("notifications.kafka").start_as_current_span(
        "loan.created process", context=extract(carrier), kind=trace.SpanKind.CONSUMER,
        attributes={"messaging.system": "kafka", "messaging.destination.name": "loan.created",
            "messaging.consumer.group.name": "notifications-service",
            "messaging.kafka.partition": message.partition(), "messaging.kafka.offset": message.offset()},
    ) as span:
        trace_id = format(span.get_span_context().trace_id, "032x")
        started = time.perf_counter()
        try:
            event = json.loads(message.value())
            notification, created = use_case.execute(event)
        except (json.JSONDecodeError, UnicodeDecodeError, InvalidEvent, TypeError, RecursionError) as error:
            try:
                repository.reject(message.topic(), message.partition(), message.offset(),
                    (message.value() or b"").decode("utf-8", errors="replace"), str(error))
            except Exception:
                record_notification("error", time.perf_counter() - started)
                logger.error("Falha ao registrar evento rejeitado traceId=%s", trace_id)
                raise
            span.set_status(trace.StatusCode.ERROR, "Evento inválido")
            logger.warning("Evento inválido registrado: partition=%s offset=%s traceId=%s",
                message.partition(), message.offset(), trace_id)
            outcome = "rejected"
        except Exception:
            record_notification("error", time.perf_counter() - started)
            logger.error("Falha ao registrar notificação traceId=%s", trace_id)
            raise
        else:
            span.set_attribute("loan.id", notification.loan_id)
            logger.info("%s eventId=%s loanId=%s partition=%s offset=%s traceId=%s",
                "Notificação registrada" if created else "Evento já processado",
                notification.event_id, notification.loan_id, message.partition(), message.offset(), trace_id)
            outcome = "created" if created else "duplicate"
        # Confirma ao Kafka apenas depois da gravação durável no MySQL.
        try:
            consumer.commit(message=message, asynchronous=False)
        except Exception:
            record_notification("error", time.perf_counter() - started)
            logger.error("Falha ao confirmar offset traceId=%s", trace_id)
            raise
        record_notification(outcome, time.perf_counter() - started)


def main():
    provider = setup_telemetry()
    running = True

    def stop(_signal, _frame):
        nonlocal running
        running = False

    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    connection = connect_database()
    consumer = None
    try:
        repository = MysqlNotificationRepository(connection)
        repository.setup()
        use_case = RegisterNotification(repository)
        consumer = Consumer({
            "bootstrap.servers": os.getenv("KAFKA_BROKERS", "kafka:19092"),
            "group.id": "notifications-service",
            "auto.offset.reset": "earliest",
            "enable.auto.commit": False,
            "enable.auto.offset.store": False,
        })
        consumer.subscribe(["loan.created"])
        logger.info("Consumidor pronto: topic=loan.created group=notifications-service")
        while running:
            message = consumer.poll(1.0)
            if message is None:
                continue
            if message.error():
                raise KafkaException(message.error())
            process_message(consumer, message, use_case, repository)
    finally:
        if consumer is not None:
            consumer.close()
        connection.close()
        if provider is not None:
            provider.shutdown()


if __name__ == "__main__":
    main()
