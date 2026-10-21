from typing import Protocol
from .domain import Notification


class NotificationRepository(Protocol):
    def save(self, notification: Notification) -> bool: ...


class NotificationQuery(Protocol):
    def list_recent(self, reader_id: str | None = None) -> list[dict]: ...


class ListNotifications:
    def __init__(self, repository: NotificationQuery):
        self.repository = repository

    def execute(self, reader_id: str | None = None) -> list[dict]:
        return self.repository.list_recent(reader_id)


class RegisterNotification:
    def __init__(self, repository: NotificationRepository):
        self.repository = repository

    def execute(self, event: object) -> tuple[Notification, bool]:
        notification = Notification.from_event(event)
        created = self.repository.save(notification)
        return notification, created
