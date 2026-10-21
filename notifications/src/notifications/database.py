import os
import mysql.connector
from mysql.connector import errorcode
from .domain import Notification
from opentelemetry import trace


def connect_database():
    return mysql.connector.connect(
        host=os.getenv("MYSQL_HOST", "mysql"),
        port=int(os.getenv("MYSQL_PORT", "3306")),
        user="notifications_app",
        password=os.environ["NOTIFICATIONS_MYSQL_PASSWORD"],
        database="notifications",
        connection_timeout=5,
    )


class MysqlNotificationRepository:
    def __init__(self, connection):
        self.connection = connection

    def list_recent(self, reader_id: str | None = None) -> list[dict]:
        with self.connection.cursor(dictionary=True) as cursor:
            cursor.execute("""SELECT event_id AS eventId, loan_id AS loanId,
                book_id AS bookId, reader_name AS readerName, message,
                occurred_at AS occurredAt, processed_at AS processedAt
                FROM notifications """ + ("WHERE reader_id = %s " if reader_id else "") +
                "ORDER BY processed_at DESC, event_id DESC LIMIT 1000", (reader_id,) if reader_id else ())
            return cursor.fetchall()

    def setup(self):
        with self.connection.cursor() as cursor:
            cursor.execute("""CREATE TABLE IF NOT EXISTS notifications (
                event_id CHAR(36) PRIMARY KEY,
                loan_id CHAR(36) NOT NULL,
                book_id CHAR(36) NOT NULL,
                reader_name VARCHAR(100) NOT NULL,
                message VARCHAR(255) NOT NULL,
                occurred_at DATETIME(3) NOT NULL,
                processed_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
            ) ENGINE=InnoDB""")
            cursor.execute("""CREATE TABLE IF NOT EXISTS rejected_events (
                topic VARCHAR(255) NOT NULL,
                partition_id INT NOT NULL,
                offset_id BIGINT NOT NULL,
                payload LONGTEXT NOT NULL,
                reason VARCHAR(255) NOT NULL,
                processed_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
                PRIMARY KEY (topic, partition_id, offset_id)
            ) ENGINE=InnoDB""")
            cursor.execute("SHOW COLUMNS FROM notifications LIKE 'reader_id'")
            if cursor.fetchone() is None:
                try:
                    cursor.execute("ALTER TABLE notifications ADD COLUMN reader_id VARCHAR(255) NULL, ADD INDEX idx_notifications_reader_id (reader_id)")
                except mysql.connector.Error as error:
                    if error.errno != errorcode.ER_DUP_FIELDNAME:
                        raise
        self.connection.commit()

    def save(self, notification: Notification) -> bool:
        with trace.get_tracer("notifications.database").start_as_current_span(
            "mysql INSERT notifications", kind=trace.SpanKind.CLIENT,
            attributes={"db.system": "mysql", "db.namespace": "notifications",
                "db.operation.name": "INSERT", "loan.id": notification.loan_id},
        ):
            return self._save(notification)

    def _save(self, notification: Notification) -> bool:
        try:
            with self.connection.cursor() as cursor:
                cursor.execute("""INSERT INTO notifications
                    (event_id, loan_id, book_id, reader_name, message, occurred_at, reader_id)
                    VALUES (%s, %s, %s, %s, %s, %s, %s)""", (
                    notification.event_id, notification.loan_id, notification.book_id,
                    notification.reader_name, notification.message,
                    notification.occurred_at.replace(tzinfo=None),
                    notification.reader_id,
                ))
            self.connection.commit()
            return True
        except mysql.connector.IntegrityError as error:
            self.connection.rollback()
            if error.errno == errorcode.ER_DUP_ENTRY:
                return False
            raise
        except Exception:
            self.connection.rollback()
            raise

    def reject(self, topic: str, partition: int, offset: int, payload: str, reason: str):
        with self.connection.cursor() as cursor:
            cursor.execute("""INSERT INTO rejected_events
                (topic, partition_id, offset_id, payload, reason) VALUES (%s, %s, %s, %s, %s)
                ON DUPLICATE KEY UPDATE reason = VALUES(reason)""",
                (topic, partition, offset, payload, reason[:255]))
        self.connection.commit()
