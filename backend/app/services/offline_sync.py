"""Offline sync reconciliation service — NaSCon '26 Platform (PDF §5.14).

Processes queued offline score events and roster transfers chronologically,
resolving version conflicts against authoritative PostgreSQL state.
Reuses ScoreService.append_event and RosterService.transfer directly.
"""

from __future__ import annotations

import logging
import re
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.errors import ApiError, validation_error
from app.core.signing import canonical_json_equal
from app.db.models import (
    League,
    Match,
    MatchEvent,
    OfflineSyncAction,
    RosterLeague,
    RosterPlayer,
    RosterSquad,
)
from app.db.repositories import SportConfigRepository
from app.services.roster import get_audit_count, roster_service
from app.services.scoring import score_service

logger = logging.getLogger(__name__)

_QUEUED_AT_RE = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$")


def _server_utc_now() -> datetime:
    return datetime.now(timezone.utc).replace(microsecond=0)


def validate_offline_sync_envelope(data: Any) -> dict[str, Any]:
    """Validate the sync envelope strictly.

    Only a MALFORMED ENVELOPE produces 400 VALIDATION_ERROR:
    - missing or non-string device_id
    - actions not a list of 1 to 100 items
    - an action missing action_id, type, queued_at, base_version, or payload
    - an action having wrong types (e.g. boolean for base_version)
    """
    if not isinstance(data, dict):
        raise validation_error(["body"], message="Request body must be a JSON object.")

    fields: list[str] = []

    device_id = data.get("device_id")
    if not isinstance(device_id, str) or not device_id.strip():
        fields.append("device_id")

    actions = data.get("actions")
    if not isinstance(actions, list) or len(actions) < 1 or len(actions) > 100:
        fields.append("actions")
    else:
        for i, act in enumerate(actions):
            if not isinstance(act, dict):
                fields.append(f"actions[{i}]")
                continue

            action_id = act.get("action_id")
            if not isinstance(action_id, str) or not action_id.strip():
                fields.append(f"actions[{i}].action_id")

            act_type = act.get("type")
            if act_type not in ("score_event", "roster_transfer"):
                fields.append(f"actions[{i}].type")

            queued_at = act.get("queued_at")
            if not isinstance(queued_at, str) or not _QUEUED_AT_RE.fullmatch(queued_at):
                fields.append(f"actions[{i}].queued_at")

            base_ver = act.get("base_version")
            if isinstance(base_ver, bool) or not isinstance(base_ver, int) or base_ver < 0:
                fields.append(f"actions[{i}].base_version")

            payload = act.get("payload")
            if not isinstance(payload, dict):
                fields.append(f"actions[{i}].payload")

    if fields:
        raise validation_error(fields)

    return data


def get_current_version(session: Session, kind: str, resource_id: str) -> int:
    """Return the authoritative version for the affected resource.

    - For score_event: match's version = number of events in its log (0 if none).
    - For roster_transfer: player's audit-entry count (via get_audit_count).
    """
    if not resource_id:
        return 0

    if kind in ("score_event", "match"):
        count = session.execute(
            select(func.count(MatchEvent.id)).where(MatchEvent.match_id == resource_id)
        ).scalar()
        return count or 0

    if kind in ("roster_transfer", "player"):
        return get_audit_count(session, resource_id)

    return 0


class OfflineSyncService:
    """Orchestrates offline action reconciliation against shared services."""

    def process_offline_sync(
        self,
        session: Session,
        envelope: dict[str, Any],
    ) -> tuple[dict[str, Any], list[tuple[str, str]]]:
        """Validate envelope and process actions sequentially.

        Returns:
            (response_dict, applied_score_events)
            where applied_score_events is a list of (match_id, event_type)
            to notify via notify_match_changed AFTER outer transaction commits.
        """
        validated = validate_offline_sync_envelope(envelope)
        device_id: str = validated["device_id"]
        actions: list[dict[str, Any]] = validated["actions"]

        # Sort actions chronologically ascending; ties preserve original array order (stable sort)
        indexed_actions = list(enumerate(actions))
        sorted_actions = sorted(indexed_actions, key=lambda item: item[1]["queued_at"])

        results_by_orig_idx: dict[int, dict[str, Any]] = {}
        applied_score_events: list[tuple[str, str]] = []
        batch_processed_action_ids: set[str] = set()

        now = _server_utc_now()

        for processed_order, (orig_idx, action) in enumerate(sorted_actions, start=1):
            action_id: str = action["action_id"]
            action_type: str = action["type"]
            base_version: int = action["base_version"]
            payload: dict[str, Any] = action["payload"]

            # Identify kind and primary resource identifier
            if action_type == "score_event":
                kind = "score_event"
                resource_id = payload.get("match_id", "")
            else:
                kind = "roster_transfer"
                resource_id = payload.get("player_id", "")

            curr_ver = get_current_version(session, kind, resource_id)

            # ------------------------------------------------------------------
            # Rule 5.a: Duplicate detection
            # ------------------------------------------------------------------
            is_prior_processed = False
            if action_id in batch_processed_action_ids:
                is_prior_processed = True
            else:
                existing_record = session.execute(
                    select(OfflineSyncAction).where(
                        OfflineSyncAction.device_id == device_id,
                        OfflineSyncAction.action_id == action_id,
                    )
                ).scalar_one_or_none()
                if existing_record is not None:
                    is_prior_processed = True

            is_score_dup = False
            if not is_prior_processed and action_type == "score_event":
                evt_id = payload.get("event_id")
                if evt_id:
                    prior_evt = session.execute(
                        select(MatchEvent).where(MatchEvent.event_id == evt_id)
                    ).scalar_one_or_none()
                    if prior_evt is not None and canonical_json_equal(prior_evt.request_body, payload):
                        is_score_dup = True

            if is_prior_processed or is_score_dup:
                dup_result = {
                    "action_id": action_id,
                    "status": "duplicate",
                    "resolution": "skipped_duplicate",
                    "error_code": None,
                    "processed_order": processed_order,
                    "server_version": curr_ver,
                    "signature": None,
                }
                results_by_orig_idx[orig_idx] = dup_result
                batch_processed_action_ids.add(action_id)
                # Store if not already recorded in DB
                if not is_prior_processed:
                    session.add(
                        OfflineSyncAction(
                            device_id=device_id,
                            action_id=action_id,
                            result=dup_result,
                            processed_at=now,
                        )
                    )
                continue

            # ------------------------------------------------------------------
            # Rule 5.b: Unknown referenced ID checks (*_NOT_FOUND)
            # ------------------------------------------------------------------
            missing_err: str | None = None

            if action_type == "score_event":
                evt_type = payload.get("type")
                inner_payload = payload.get("payload") if isinstance(payload.get("payload"), dict) else {}
                if evt_type == "match_init":
                    sport_id = inner_payload.get("sport_id")
                    if not sport_id or SportConfigRepository(session).get(sport_id) is None:
                        missing_err = "SPORT_NOT_FOUND"
                    lg_id = inner_payload.get("league_id")
                    if not missing_err and lg_id:
                        if session.execute(select(League).where(League.league_id == lg_id)).scalar_one_or_none() is None:
                            missing_err = "LEAGUE_NOT_FOUND"
                else:
                    m_id = payload.get("match_id")
                    if not m_id or session.execute(select(Match).where(Match.match_id == m_id)).scalar_one_or_none() is None:
                        missing_err = "MATCH_NOT_FOUND"
                    if not missing_err and evt_type == "compensation":
                        target_id = inner_payload.get("compensates")
                        if not target_id or session.execute(select(MatchEvent).where(MatchEvent.event_id == target_id)).scalar_one_or_none() is None:
                            missing_err = "EVENT_NOT_FOUND"

            elif action_type == "roster_transfer":
                lg_id = payload.get("league_id")
                if not lg_id or session.execute(select(RosterLeague).where(RosterLeague.league_id == lg_id)).scalar_one_or_none() is None:
                    missing_err = "LEAGUE_NOT_FOUND"

                if not missing_err:
                    pl_id = payload.get("player_id")
                    if not pl_id or session.execute(
                        select(RosterPlayer).where(
                            RosterPlayer.player_id == pl_id,
                            RosterPlayer.league_id == lg_id,
                        )
                    ).scalar_one_or_none() is None:
                        missing_err = "PLAYER_NOT_FOUND"

                if not missing_err:
                    from_sq = payload.get("from_squad_id")
                    if not from_sq or session.execute(
                        select(RosterSquad).where(
                            RosterSquad.squad_id == from_sq,
                            RosterSquad.league_id == lg_id,
                        )
                    ).scalar_one_or_none() is None:
                        missing_err = "SQUAD_NOT_FOUND"

                if not missing_err and payload.get("type") != "release":
                    to_sq = payload.get("to_squad_id")
                    if not to_sq or session.execute(
                        select(RosterSquad).where(
                            RosterSquad.squad_id == to_sq,
                            RosterSquad.league_id == lg_id,
                        )
                    ).scalar_one_or_none() is None:
                        missing_err = "SQUAD_NOT_FOUND"

            if missing_err is not None:
                rej_result = {
                    "action_id": action_id,
                    "status": "rejected",
                    "resolution": "server_wins",
                    "error_code": missing_err,
                    "processed_order": processed_order,
                    "server_version": curr_ver,
                    "signature": None,
                }
                results_by_orig_idx[orig_idx] = rej_result
                batch_processed_action_ids.add(action_id)
                session.add(
                    OfflineSyncAction(
                        device_id=device_id,
                        action_id=action_id,
                        result=rej_result,
                        processed_at=now,
                    )
                )
                continue

            # ------------------------------------------------------------------
            # Rule 5.c: Base version higher than server current version
            # ------------------------------------------------------------------
            if base_version > curr_ver:
                ver_result = {
                    "action_id": action_id,
                    "status": "rejected",
                    "resolution": "server_wins",
                    "error_code": "INVALID_BASE_VERSION",
                    "processed_order": processed_order,
                    "server_version": curr_ver,
                    "signature": None,
                }
                results_by_orig_idx[orig_idx] = ver_result
                batch_processed_action_ids.add(action_id)
                session.add(
                    OfflineSyncAction(
                        device_id=device_id,
                        action_id=action_id,
                        result=ver_result,
                        processed_at=now,
                    )
                )
                continue

            # ------------------------------------------------------------------
            # Rule 5.d/e/f: Call shared service within a nested savepoint
            # ------------------------------------------------------------------
            sp = session.begin_nested()
            sig: str | None = None
            try:
                if action_type == "score_event":
                    code, resp = score_service.append_event(session, payload)
                    sig = resp.get("signature")
                else:
                    code, resp = roster_service.transfer(session, payload)
                    sig = None

                sp.commit()

                # Execution succeeded: calculate updated server version
                new_ver = get_current_version(session, kind, resource_id)
                status_str = "applied"
                resolution_str = "appended" if base_version == curr_ver else "rebased_append"

                action_result = {
                    "action_id": action_id,
                    "status": status_str,
                    "resolution": resolution_str,
                    "error_code": None,
                    "processed_order": processed_order,
                    "server_version": new_ver,
                    "signature": sig,
                }
                results_by_orig_idx[orig_idx] = action_result
                batch_processed_action_ids.add(action_id)

                if action_type == "score_event":
                    applied_score_events.append((payload["match_id"], payload["type"]))

                session.add(
                    OfflineSyncAction(
                        device_id=device_id,
                        action_id=action_id,
                        result=action_result,
                        processed_at=now,
                    )
                )

            except ApiError as exc:
                sp.rollback()
                action_result = {
                    "action_id": action_id,
                    "status": "rejected",
                    "resolution": "server_wins",
                    "error_code": exc.code,
                    "processed_order": processed_order,
                    "server_version": curr_ver,
                    "signature": None,
                }
                results_by_orig_idx[orig_idx] = action_result
                batch_processed_action_ids.add(action_id)

                session.add(
                    OfflineSyncAction(
                        device_id=device_id,
                        action_id=action_id,
                        result=action_result,
                        processed_at=now,
                    )
                )

            except Exception:
                sp.rollback()
                logger.exception("Unexpected exception in sync action %s", action_id)
                action_result = {
                    "action_id": action_id,
                    "status": "rejected",
                    "resolution": "server_wins",
                    "error_code": "INTERNAL_ERROR",
                    "processed_order": processed_order,
                    "server_version": curr_ver,
                    "signature": None,
                }
                results_by_orig_idx[orig_idx] = action_result
                batch_processed_action_ids.add(action_id)

                session.add(
                    OfflineSyncAction(
                        device_id=device_id,
                        action_id=action_id,
                        result=action_result,
                        processed_at=now,
                    )
                )

        # Assemble results in the exact original request order
        ordered_results = [results_by_orig_idx[i] for i in range(len(actions))]

        summary = {
            "applied": sum(1 for r in ordered_results if r["status"] == "applied"),
            "rejected": sum(1 for r in ordered_results if r["status"] == "rejected"),
            "duplicate": sum(1 for r in ordered_results if r["status"] == "duplicate"),
        }

        response = {
            "device_id": device_id,
            "results": ordered_results,
            "summary": summary,
        }

        return response, applied_score_events


sync_service = OfflineSyncService()
