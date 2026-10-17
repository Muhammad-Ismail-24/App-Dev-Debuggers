"""In-process realtime WebSocket broadcast hub — NaSCon '26 Platform (PDF §5.9, instructions.md §2.1).

Maintains per-match and global WebSocket subscriber sets and broadcasts
live match status, score updates, and pinned merchandise notifications.
Authoritative state stays in PostgreSQL, never in socket memory.
"""

from __future__ import annotations

import asyncio
import logging
from collections import defaultdict
from typing import Any

from fastapi import WebSocket

from app.core.config import utc_now_iso
from app.db.session import session_scope
from app.services.scoring import get_score_projection

logger = logging.getLogger(__name__)


class ConnectionHub:
    """In-process WebSocket connection registry with thread-safe sync publish."""

    def __init__(self) -> None:
        self._match_subscribers: dict[str, set[WebSocket]] = defaultdict(set)
        self._feed_subscribers: set[WebSocket] = set()
        self._loop: asyncio.AbstractEventLoop | None = None
        self._heartbeat_task: asyncio.Task[None] | None = None

    def set_loop(self, loop: asyncio.AbstractEventLoop) -> None:
        """Capture the running event loop at application startup."""
        self._loop = loop

    def start_heartbeat(self) -> None:
        """Start the background 25-second heartbeat ping task."""
        if self._loop is not None and self._heartbeat_task is None:
            self._heartbeat_task = self._loop.create_task(self._heartbeat_loop())

    def stop_heartbeat(self) -> None:
        """Cancel the heartbeat task during application shutdown."""
        if self._heartbeat_task is not None:
            self._heartbeat_task.cancel()
            self._heartbeat_task = None

    async def _heartbeat_loop(self) -> None:
        """Send periodic ping frames every 25 seconds; drop dead sockets quietly."""
        while True:
            try:
                await asyncio.sleep(25)
                await self._send_heartbeat()
            except asyncio.CancelledError:
                break
            except Exception:
                logger.exception("Error during realtime heartbeat cycle")

    async def _send_heartbeat(self) -> None:
        """Send a lightweight ping to all connected subscribers."""
        ping_msg = {"type": "ping", "sent_at": utc_now_iso()}

        # Collect distinct active sockets across all match rooms and global feed
        all_sockets: set[WebSocket] = set(self._feed_subscribers)
        for room in self._match_subscribers.values():
            all_sockets.update(room)

        dead_sockets: list[WebSocket] = []
        for ws in all_sockets:
            try:
                await ws.send_json(ping_msg)
            except Exception:
                dead_sockets.append(ws)

        for dead_ws in dead_sockets:
            self._drop_socket(dead_ws)

    def _drop_socket(self, ws: WebSocket) -> None:
        """Quietly remove a disconnected or dead WebSocket from all registries."""
        self._feed_subscribers.discard(ws)
        empty_rooms: list[str] = []
        for match_id, room in self._match_subscribers.items():
            room.discard(ws)
            if not room:
                empty_rooms.append(match_id)
        for empty_id in empty_rooms:
            self._match_subscribers.pop(empty_id, None)

    async def connect_match(self, match_id: str, ws: WebSocket) -> None:
        """Register a client for updates on a specific match."""
        self._match_subscribers[match_id].add(ws)

    async def disconnect_match(self, match_id: str, ws: WebSocket) -> None:
        """Unregister a client from a specific match room."""
        if match_id in self._match_subscribers:
            self._match_subscribers[match_id].discard(ws)
            if not self._match_subscribers[match_id]:
                del self._match_subscribers[match_id]

    async def connect_feed(self, ws: WebSocket) -> None:
        """Register a client for the global match feed."""
        self._feed_subscribers.add(ws)

    async def disconnect_feed(self, ws: WebSocket) -> None:
        """Unregister a client from the global match feed."""
        self._feed_subscribers.discard(ws)

    async def broadcast(self, match_id: str, message: dict[str, Any]) -> None:
        """Broadcast a message to match subscribers and global feed subscribers."""
        targets = set(self._match_subscribers.get(match_id, set())) | set(self._feed_subscribers)
        dead_targets: list[WebSocket] = []

        for ws in targets:
            try:
                await ws.send_json(message)
            except Exception:
                dead_targets.append(ws)

        for dead_ws in dead_targets:
            self._drop_socket(dead_ws)

    def publish_from_sync(self, match_id: str, message: dict[str, Any]) -> None:
        """Thread-safe dispatch from sync HTTP/service threads to the async event loop."""
        if self._loop is not None and self._loop.is_running():
            asyncio.run_coroutine_threadsafe(self.broadcast(match_id, message), self._loop)
        else:
            logger.debug("Event loop not active; skipped realtime broadcast for %s", match_id)


hub = ConnectionHub()


def broadcast_product_pinned(
    match_id: str,
    product_id: str,
    pinned_at: str | None = None,
) -> None:
    """Thread-safe helper to announce a pinned product update to live listeners."""
    now = pinned_at or utc_now_iso()
    msg = {
        "type": "product_pinned",
        "match_id": match_id,
        "data": {
            "product_id": product_id,
            "pinned_at": now,
        },
        "sent_at": utc_now_iso(),
    }
    hub.publish_from_sync(match_id, msg)


def on_match_event_committed(match_id: str, event_type: str) -> None:
    """Match change listener registered at startup via register_match_listener.

    Executed after a match event transaction commits:
    - Every committed event append sends 'score_updated'
    - Lifecycle status changes ('match_start' or 'match_end') also send 'match_status_changed'
    Listener failures are logged and never break the originating request.
    """
    try:
        with session_scope() as session:
            projection = get_score_projection(session, match_id)
            now = utc_now_iso()

            # 1. Always push the updated score projection
            hub.publish_from_sync(
                match_id,
                {
                    "type": "score_updated",
                    "match_id": match_id,
                    "data": projection,
                    "sent_at": now,
                },
            )

            # 2. Push match_status_changed for lifecycle events
            if event_type in ("match_start", "match_end"):
                hub.publish_from_sync(
                    match_id,
                    {
                        "type": "match_status_changed",
                        "match_id": match_id,
                        "data": projection,
                        "sent_at": now,
                    },
                )
    except Exception:
        logger.exception(
            "Realtime listener failed for match %s (event_type=%s)",
            match_id,
            event_type,
        )
