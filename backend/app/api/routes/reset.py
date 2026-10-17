"""Reset endpoint — PDF §5.5."""

from __future__ import annotations

import json
import logging
from typing import Any

from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.core.errors import validation_error
from app.db.seed import reset_all
from app.db.session import get_session

logger = logging.getLogger("app.api.routes.reset")

router = APIRouter(tags=["audit"])


@router.post("/audit/v1/reset")
async def reset_database(
    request: Request,
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    """Wipe all state and re-create deterministic baseline data (PDF §5.5).

    Request body is optional.
    - seed: int, default 42
    - stock: map variant_id -> int >= 0, default {"var-jersey-001-M": 1, "var-jersey-001-L": 5}
    - wrong types -> 400 VALIDATION_ERROR with details.fields
    - ignore unknown variant IDs in stock
    """
    raw_body = await request.body()
    seed: int = 42
    stock: dict[str, int] | None = None

    if raw_body and raw_body.strip():
        try:
            body_dict = json.loads(raw_body.decode("utf-8"))
        except Exception:
            raise validation_error(
                fields=["body"],
                message="Malformed JSON body.",
            )

        if not isinstance(body_dict, dict):
            raise validation_error(
                fields=["body"],
                message="Request body must be a JSON object.",
            )

        invalid_fields: list[str] = []

        if "seed" in body_dict:
            val = body_dict["seed"]
            # Disallow boolean because bool is a subclass of int in Python
            if type(val) is int and not isinstance(val, bool):
                seed = val
            else:
                invalid_fields.append("seed")

        if "stock" in body_dict:
            val = body_dict["stock"]
            if isinstance(val, dict):
                stock_valid = True
                for k, v in val.items():
                    if not isinstance(k, str) or type(v) is not int or isinstance(v, bool) or v < 0:
                        stock_valid = False
                        break
                if stock_valid:
                    stock = val
                else:
                    invalid_fields.append("stock")
            else:
                invalid_fields.append("stock")

        if invalid_fields:
            raise validation_error(
                fields=invalid_fields,
                message="Invalid type or value for reset parameters.",
            )

    try:
        result = reset_all(session=session, seed=seed, stock=stock)
        return result
    except Exception as exc:
        logger.error("Reset failed: %s", exc)
        session.rollback()
        raise
