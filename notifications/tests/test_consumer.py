import json
import unittest
from unittest.mock import Mock, patch

from notifications.application import RegisterNotification
from notifications.main import process_message
from test_notifications import event


class ConsumerTests(unittest.TestCase):
    def message(self, payload):
        message = Mock()
        message.value.return_value = json.dumps(payload).encode()
        message.headers.return_value = []
        message.topic.return_value = "loan.created"
        message.partition.return_value = 0
        message.offset.return_value = 10
        return message

    def test_commit_only_after_persistence(self):
        order = []
        repository = Mock()
        repository.save.side_effect = lambda notification: order.append("save") or True
        consumer = Mock()
        consumer.commit.side_effect = lambda **kwargs: order.append("commit")
        message = self.message(event())
        process_message(consumer, message, RegisterNotification(repository), repository)
        self.assertEqual(order, ["save", "commit"])
        consumer.commit.assert_called_once_with(message=message, asynchronous=False)

    def test_database_failure_does_not_commit_offset(self):
        repository, consumer = Mock(), Mock()
        repository.save.side_effect = RuntimeError("database unavailable")
        with self.assertRaises(RuntimeError):
            process_message(consumer, self.message(event()), RegisterNotification(repository), repository)
        consumer.commit.assert_not_called()

    def test_invalid_date_is_durably_rejected_before_commit(self):
        order = []
        repository, consumer = Mock(), Mock()
        repository.reject.side_effect = lambda *args: order.append("reject")
        consumer.commit.side_effect = lambda **kwargs: order.append("commit")
        process_message(consumer, self.message(dict(event(), occurredAt="9999-12-31T23:59:59-01:00")),
                        RegisterNotification(repository), repository)
        self.assertEqual(order, ["reject", "commit"])
        repository.save.assert_not_called()

    def test_failed_rejection_does_not_commit_offset(self):
        repository, consumer = Mock(), Mock()
        repository.reject.side_effect = RuntimeError("database unavailable")
        with self.assertRaises(RuntimeError):
            process_message(consumer, self.message({}), RegisterNotification(repository), repository)
        consumer.commit.assert_not_called()

    def test_commit_failure_does_not_record_success(self):
        repository, consumer = Mock(), Mock()
        repository.save.return_value = True
        consumer.commit.side_effect = RuntimeError("broker unavailable")
        with patch("notifications.main.record_notification") as record:
            with self.assertRaises(RuntimeError):
                process_message(consumer, self.message(event()), RegisterNotification(repository), repository)
            self.assertEqual(record.call_args.args[0], "error")
            self.assertEqual(record.call_count, 1)

    def test_duplicate_event_is_acknowledged(self):
        repository, consumer = Mock(), Mock()
        repository.save.return_value = False
        with patch("notifications.main.record_notification") as record:
            process_message(consumer, self.message(event()), RegisterNotification(repository), repository)
            self.assertEqual(record.call_args.args[0], "duplicate")
        consumer.commit.assert_called_once()
