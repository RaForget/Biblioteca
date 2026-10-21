import unittest
from notifications.application import RegisterNotification
from notifications.domain import InvalidEvent


class MemoryRepository:
    def __init__(self):
        self.items = {}

    def save(self, notification):
        if notification.event_id in self.items:
            return False
        self.items[notification.event_id] = notification
        return True


def event():
    return dict(eventId="11111111-1111-4111-8111-111111111111", eventType="loan.created", version=1,
        loanId="22222222-2222-4222-8222-222222222222", bookId="33333333-3333-4333-8333-333333333333",
        readerName="Rafael", occurredAt="2026-10-13T12:00:00.000Z")


class NotificationTests(unittest.TestCase):
    def test_notification_from_typescript_contract(self):
        repository = MemoryRepository()
        notification, created = RegisterNotification(repository).execute(event())
        self.assertTrue(created)
        self.assertEqual(notification.message, "Rafael, seu empréstimo foi registrado.")
        self.assertEqual(len(repository.items), 1)

    def test_duplicate_event(self):
        repository = MemoryRepository()
        use_case = RegisterNotification(repository)
        use_case.execute(event())
        self.assertFalse(use_case.execute(event())[1])
        self.assertEqual(len(repository.items), 1)

    def test_reader_identity_is_carried_to_notification(self):
        payload = event()
        payload["readerId"] = "44444444-4444-4444-8444-444444444444"
        notification, _ = RegisterNotification(MemoryRepository()).execute(payload)
        self.assertEqual(notification.reader_id, payload["readerId"])

    def test_unsupported_version_does_not_save(self):
        repository = MemoryRepository()
        payload = event()
        payload["version"] = 2
        with self.assertRaises(InvalidEvent):
            RegisterNotification(repository).execute(payload)
        self.assertEqual(repository.items, {})

    def test_database_failure_propagates(self):
        class BrokenRepository:
            def save(self, notification):
                raise RuntimeError("Banco indisponível")
        with self.assertRaises(RuntimeError):
            RegisterNotification(BrokenRepository()).execute(event())
