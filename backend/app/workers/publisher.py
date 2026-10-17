"""Transactional domain-event publisher.

Supported event types and payloads:

* ``order.status_changed`` — ``{order_id, from_status, to_status}``
* ``match.event_appended`` — ``{match_id, event_id, type}``
* ``roster.changed`` — ``{player_id, league_id, action}``

This module only writes to the transactional outbox.  It never contacts
RabbitMQ, so request handlers remain independent of broker availability.
"""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.db.models import DomainEventOutbox


def publish_domain_event(
    session: Session,
    event_type: str,
    payload: dict,
) -> None:
    """Stage a domain event in the caller's current transaction."""
    session.add(
        DomainEventOutbox(
            event_type=event_type,
            payload=payload,
        )
    )
