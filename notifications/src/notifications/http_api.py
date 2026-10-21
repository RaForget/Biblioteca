import logging
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from .application import ListNotifications
from .database import connect_database, MysqlNotificationRepository
from .auth import require_reader

logger = logging.getLogger("notifications.http")


@asynccontextmanager
async def lifespan(app):
    connection = connect_database()
    try:
        MysqlNotificationRepository(connection).setup()
    finally:
        connection.close()
    yield


app = FastAPI(title="Biblioteca — notificações", lifespan=lifespan)
app.add_middleware(CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["GET"], allow_headers=["Content-Type", "Authorization"])


@app.get("/health")
def health():
    connection = None
    try:
        connection = connect_database()
        connection.ping()
        return {"status": "ok", "database": "connected"}
    except Exception:
        logger.exception("Falha na conexão MySQL")
        raise HTTPException(503, "Banco de notificações indisponível.")
    finally:
        if connection is not None:
            connection.close()


@app.get("/notifications")
def list_notifications(principal: dict = Depends(require_reader)):
    connection = None
    try:
        connection = connect_database()
        rows = ListNotifications(MysqlNotificationRepository(connection)).execute(None if "bibliotecario" in principal["roles"] else principal["id"])
        for row in rows:
            for key in ("occurredAt", "processedAt"):
                if isinstance(row[key], datetime):
                    row[key] = row[key].replace(tzinfo=timezone.utc).isoformat()
        return rows
    except Exception:
        logger.exception("Falha ao consultar notificações")
        raise HTTPException(503, "Não foi possível consultar as notificações.")
    finally:
        if connection is not None:
            connection.close()
