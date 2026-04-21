from __future__ import annotations

import asyncio
import contextlib
import json
import logging
from collections import defaultdict
from typing import Any, Optional
from uuid import UUID

import redis.asyncio as redis
from fastapi import WebSocket

logger = logging.getLogger(__name__)


def draft_channel(league_id: UUID) -> str:
    return f"draft:{league_id}"


def trade_feed_channel(league_id: UUID) -> str:
    return f"trades:{league_id}"


class DraftRealtimeBroker:
    """
    FastAPI WebSocket fan-out backed by Redis Pub/Sub.

    - Each application instance keeps local ``WebSocket`` clients per Redis channel.
    - ``publish`` writes to Redis so every API replica forwards the event to its sockets.
    - A background task ``listen`` consumes Pub/Sub messages and writes them to local sockets.
    """

    def __init__(self, redis_url: str) -> None:
        self._redis_url = redis_url
        self._publisher: Optional[redis.Redis] = None
        self._listener: Optional[redis.Redis] = None
        self._pubsub: Optional[Any] = None
        self._channel_clients: dict[str, set[WebSocket]] = defaultdict(set)
        self._lock = asyncio.Lock()
        self._listen_task: Optional[asyncio.Task[None]] = None
        self._closing = asyncio.Event()

    async def connect(self, websocket: WebSocket, channel: str) -> None:
        await websocket.accept()
        async with self._lock:
            self._channel_clients[channel].add(websocket)

    async def disconnect(self, websocket: WebSocket, channel: str) -> None:
        async with self._lock:
            clients = self._channel_clients.get(channel)
            if not clients:
                return
            clients.discard(websocket)
            if not clients:
                self._channel_clients.pop(channel, None)

    async def publish(self, channel: str, payload: dict[str, Any]) -> None:
        if self._publisher is None:
            msg = "Redis publisher not initialised"
            raise RuntimeError(msg)
        data = json.dumps(payload, default=str)
        await self._publisher.publish(channel, data)

    async def broadcast_local(self, channel: str, payload: dict[str, Any]) -> None:
        """Send to sockets on this replica only (used by the Redis listener)."""

        message = json.dumps(payload, default=str)
        async with self._lock:
            clients = list(self._channel_clients.get(channel, ()))
        stale: list[WebSocket] = []
        for ws in clients:
            try:
                await ws.send_text(message)
            except Exception:  # pragma: no cover
                logger.exception("Failed to deliver websocket payload; dropping client")
                stale.append(ws)
        for ws in stale:
            await self.disconnect(ws, channel)

    async def start(self) -> None:
        if self._publisher is not None:
            return
        self._closing.clear()
        self._publisher = redis.from_url(
            self._redis_url,
            encoding="utf-8",
            decode_responses=True,
        )
        self._listener = redis.from_url(
            self._redis_url,
            encoding="utf-8",
            decode_responses=True,
        )
        self._pubsub = self._listener.pubsub()
        await self._pubsub.psubscribe("draft:*", "trades:*")
        self._listen_task = asyncio.create_task(self._listen_loop(), name="redis-ws-bridge")

    async def shutdown(self) -> None:
        self._closing.set()
        if self._listen_task:
            self._listen_task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self._listen_task
        if self._pubsub is not None:
            await self._pubsub.punsubscribe()
            await self._pubsub.close()
        if self._listener is not None:
            await self._listener.aclose()
        if self._publisher is not None:
            await self._publisher.aclose()
        self._publisher = self._listener = self._pubsub = None
        self._listen_task = None

    async def _listen_loop(self) -> None:
        if self._pubsub is None:
            return
        try:
            async for raw in self._pubsub.listen():
                if self._closing.is_set():
                    break
                if raw is None or raw.get("type") != "pmessage":
                    continue
                channel = raw.get("channel")
                data = raw.get("data")
                if channel is None or data is None:
                    continue
                try:
                    payload = json.loads(data)
                except json.JSONDecodeError:
                    logger.warning("Skipping invalid JSON from redis channel=%s", channel)
                    continue
                await self.broadcast_local(channel, payload)
        except asyncio.CancelledError:  # pragma: no cover
            raise


# Lazy module singleton so tests can substitute the broker
_broker: Optional[DraftRealtimeBroker] = None


def get_broker(redis_url: Optional[str] = None) -> DraftRealtimeBroker:
    global _broker
    if _broker is None:
        if redis_url is None:
            from app.core.config import get_settings

            redis_url = get_settings().redis_url
        _broker = DraftRealtimeBroker(redis_url)
    return _broker
