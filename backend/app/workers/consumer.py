"""Transactional-outbox relay and RabbitMQ domain-event consumer.

The process runs two independent worker threads:

* a relay that claims unpublished outbox rows and forwards them to the
  durable ``domain_events`` queue;
* a consumer that logs each delivered event before acknowledging it.

Supported event types and payloads:

* ``order.status_changed`` — ``{order_id, from_status, to_status}``
* ``match.event_appended`` — ``{match_id, event_id, type}``
* ``roster.changed`` — ``{player_id, league_id, action}``
"""

from __future__ import annotations

import json
import logging
import signal
import threading
import time
from datetime import datetime, timezone
from typing import Any

import pika
from pika.adapters.blocking_connection import BlockingChannel
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError

from app.core.config import get_settings
from app.db.models import DomainEventOutbox
from app.db.session import SessionLocal

QUEUE_NAME = "domain_events"
BATCH_SIZE = 50
RELAY_INTERVAL_SECONDS = 2.0
INITIAL_BACKOFF_SECONDS = 1.0
MAX_BACKOFF_SECONDS = 30.0

logger = logging.getLogger("app.workers.consumer")


def _utc_timestamp() -> str:
    return datetime.now(timezone.utc).isoformat()


def _rabbitmq_parameters() -> pika.URLParameters:
    """Build connection parameters without exposing the URL in logs."""
    return pika.URLParameters(get_settings().RABBITMQ_URL)


def _declare_queue(channel: BlockingChannel) -> None:
    channel.queue_declare(queue=QUEUE_NAME, durable=True)


def _message(row: DomainEventOutbox) -> bytes:
    return json.dumps(
        {
            "event_type": row.event_type,
            "payload": row.payload,
            "timestamp": _utc_timestamp(),
        },
        separators=(",", ":"),
    ).encode("utf-8")


def _relay_once() -> bool:
    """Relay one batch; return whether a broker/database retry is needed."""
    connection = pika.BlockingConnection(_rabbitmq_parameters())
    try:
        channel = connection.channel()
        _declare_queue(channel)
        with SessionLocal() as session:
            rows = list(
                session.scalars(
                    select(DomainEventOutbox)
                    .where(DomainEventOutbox.published.is_(False))
                    .order_by(DomainEventOutbox.id)
                    .limit(BATCH_SIZE)
                    .with_for_update(skip_locked=True)
                )
            )
            for row in rows:
                channel.basic_publish(
                    exchange="",
                    routing_key=QUEUE_NAME,
                    body=_message(row),
                    properties=pika.BasicProperties(
                        content_type="application/json",
                        delivery_mode=2,
                    ),
                )
                row.published = True
                row.published_at = datetime.utcnow()
            session.commit()
            return False
    finally:
        if connection.is_open:
            connection.close()


def _relay_loop(stop_event: threading.Event) -> None:
    backoff = INITIAL_BACKOFF_SECONDS
    while not stop_event.is_set():
        try:
            needs_retry = _relay_once()
            backoff = INITIAL_BACKOFF_SECONDS
            if needs_retry or stop_event.wait(RELAY_INTERVAL_SECONDS):
                continue
        except (OSError, SQLAlchemyError, pika.exceptions.PikaException):
            logger.warning("Domain-event relay unavailable; retrying.")
            stop_event.wait(backoff)
            backoff = min(backoff * 2, MAX_BACKOFF_SECONDS)


def _log_event(body: bytes) -> None:
    event: dict[str, Any] = json.loads(body)
    logger.info(
        "%s",
        json.dumps(
            {
                "event_type": event["event_type"],
                "payload": event["payload"],
                "timestamp": event["timestamp"],
            },
            separators=(",", ":"),
        ),
    )


def _consume_loop(stop_event: threading.Event) -> None:
    backoff = INITIAL_BACKOFF_SECONDS
    while not stop_event.is_set():
        connection: pika.BlockingConnection | None = None
        try:
            connection = pika.BlockingConnection(_rabbitmq_parameters())
            channel = connection.channel()
            _declare_queue(channel)
            channel.basic_qos(prefetch_count=1)

            def callback(
                channel_: BlockingChannel,
                method: pika.spec.Basic.Deliver,
                properties: pika.BasicProperties,
                body: bytes,
            ) -> None:
                try:
                    _log_event(body)
                except (KeyError, TypeError, ValueError, json.JSONDecodeError):
                    logger.warning("Invalid domain event received; acknowledging.")
                channel_.basic_ack(delivery_tag=method.delivery_tag)

            channel.basic_consume(queue=QUEUE_NAME, on_message_callback=callback)
            backoff = INITIAL_BACKOFF_SECONDS
            while channel.is_open and not stop_event.is_set():
                connection.process_data_events(time_limit=1)
            if channel.is_open:
                channel.stop_consuming()
        except (OSError, pika.exceptions.PikaException):
            logger.warning("Domain-event consumer unavailable; retrying.")
            stop_event.wait(backoff)
            backoff = min(backoff * 2, MAX_BACKOFF_SECONDS)
        finally:
            if connection is not None and connection.is_open:
                connection.close()


def _configure_logging() -> None:
    logging.basicConfig(level=logging.INFO, format="%(message)s")


def main() -> None:
    _configure_logging()
    stop_event = threading.Event()

    def request_shutdown(signum: int, frame: Any) -> None:
        logger.info("Worker shutdown requested.")
        stop_event.set()

    signal.signal(signal.SIGTERM, request_shutdown)
    signal.signal(signal.SIGINT, request_shutdown)

    relay = threading.Thread(
        target=_relay_loop,
        args=(stop_event,),
        name="domain-event-relay",
        daemon=True,
    )
    consumer = threading.Thread(
        target=_consume_loop,
        args=(stop_event,),
        name="domain-event-consumer",
        daemon=True,
    )
    relay.start()
    consumer.start()
    while relay.is_alive() or consumer.is_alive():
        relay.join(timeout=1)
        consumer.join(timeout=1)


if __name__ == "__main__":
    main()
