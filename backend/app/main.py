from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from typing import Any
from uuid import UUID

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

import app.models  # noqa: F401  # register SQLAlchemy mappers for Alembic / metadata

from app.core.config import get_settings
from app.websocket.manager import draft_channel, get_broker, trade_feed_channel

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)

_settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    import app.websocket.manager as ws_manager

    broker = get_broker(_settings.redis_url)
    await broker.start()
    app.state.ws_broker = broker
    yield
    await broker.shutdown()
    ws_manager._broker = None

app = FastAPI(title=_settings.app_name, lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.websocket("/ws/draft/{league_id}")
async def draft_room_socket(websocket: WebSocket, league_id: UUID) -> None:
    broker = app.state.ws_broker
    channel = draft_channel(league_id)
    await broker.connect(websocket, channel)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        logger.info("Draft websocket disconnected league_id=%s", league_id)
    finally:
        await broker.disconnect(websocket, channel)


@app.websocket("/ws/trades/{league_id}")
async def trade_feed_socket(websocket: WebSocket, league_id: UUID) -> None:
    broker = app.state.ws_broker
    channel = trade_feed_channel(league_id)
    await broker.connect(websocket, channel)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        logger.info("Trade feed websocket disconnected league_id=%s", league_id)
    finally:
        await broker.disconnect(websocket, channel)


@app.post("/internal/dev/publish-draft-event/{league_id}")
async def publish_draft_smoke(league_id: UUID, body: dict[str, Any]) -> dict[str, str]:
    """Temporary helper to exercise Redis fan-out; replace with real draft routes."""

    broker: Any = app.state.ws_broker
    channel = draft_channel(league_id)
    await broker.publish(channel, {"type": "draft_event", **body})
    return {"channel": channel}


@app.post("/internal/dev/publish-trade-event/{league_id}")
async def publish_trade_smoke(league_id: UUID, body: dict[str, Any]) -> dict[str, str]:
    broker: Any = app.state.ws_broker
    channel = trade_feed_channel(league_id)
    await broker.publish(channel, {"type": "trade_event", **body})
    return {"channel": channel}
