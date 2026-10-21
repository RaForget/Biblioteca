from dataclasses import dataclass
from datetime import datetime, timezone
from uuid import UUID


class InvalidEvent(ValueError):
    pass


@dataclass(frozen=True)
class Notification:
    event_id: str
    loan_id: str
    book_id: str
    reader_name: str
    message: str
    occurred_at: datetime
    reader_id: str | None = None

    @classmethod
    def from_event(cls, event: object) -> "Notification":
        if not isinstance(event, dict):
            raise InvalidEvent("O evento deve ser um objeto JSON.")
        if event.get("eventType") != "loan.created" or type(event.get("version")) is not int or event["version"] != 1:
            raise InvalidEvent("Tipo ou versão de evento não suportados.")
        try:
            ids = [str(UUID(event[field])) for field in ("eventId", "loanId", "bookId")]
            name = event["readerName"]
            if not isinstance(name, str) or not 2 <= len(name.strip()) <= 100:
                raise ValueError("Nome do leitor inválido.")
            occurred_at = datetime.fromisoformat(event["occurredAt"].replace("Z", "+00:00"))
            reader_id = str(UUID(event["readerId"])) if event.get("readerId") is not None else None
            if occurred_at.tzinfo is None:
                raise ValueError("Data sem fuso horário.")
        except (KeyError, TypeError, ValueError, AttributeError) as error:
            raise InvalidEvent("Campos do evento inválidos.") from error
        name = name.strip()
        return cls(*ids, name, f"{name}, seu empréstimo foi registrado.", occurred_at.astimezone(timezone.utc), reader_id)
