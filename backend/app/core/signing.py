"""Cryptographic signing helpers — PDF §5.3 and Appendix A.

Public surface
--------------
canonical_json(obj) -> str
    Recursively sort dict keys (Unicode code point order), no whitespace,
    UTF-8, ensure_ascii=False, true/false/null lowercase, integers as integers,
    array order preserved, allow_nan=False.

compute_signature(salt, record_id, payload) -> str
    Pure HMAC-SHA256 variant.  Key = salt encoded as UTF-8 (not trimmed, not
    hex-decoded).  Message = record_id + "|" + canonical_json(payload) encoded
    as UTF-8.  Output = 64 lowercase hex characters.

sign_record(record_id, payload) -> str
    Thin wrapper that reads DAY1_SALT from settings and calls compute_signature.

canonical_json_equal(a, b) -> bool
    Idempotency comparison via canonical JSON serialisation.

reference_vector_ok() -> bool
    Self-check against the Appendix A test vector:
        salt    = "demo-salt"
        id      = "evt-1"
        payload = {"team_id": "t1", "event_type": "goal"}
        expected canonical payload = '{"event_type":"goal","team_id":"t1"}'
        expected signature = 972a8b558690b19121cc5bea84978f85e8eb15a3735018db36616bab1d7ec501
"""

from __future__ import annotations

import hashlib
import hmac
import json
from typing import Any

from app.core.config import get_settings

# ---------------------------------------------------------------------------
# Canonical JSON
# ---------------------------------------------------------------------------

# We subclass json.JSONEncoder so that:
#   • dict keys are sorted lexicographically by Unicode code point (sort_keys=True)
#   • separators=(",", ":") → no whitespace
#   • ensure_ascii=False → non-ASCII chars kept literal (unescaped)
#   • allow_nan=False      → NaN/Infinity raise ValueError
#   • True/False/None render as true/false/null (Python json default)
#   • integers are emitted without a decimal point (Python json default for int)
#   • array order is preserved (Python json default)

_ENCODER = json.JSONEncoder(
    sort_keys=True,
    separators=(",", ":"),
    ensure_ascii=False,
    allow_nan=False,
)


def canonical_json(obj: Any) -> str:
    """Serialise *obj* to canonical JSON as a Python string.

    Rules (PDF §5.3 / Appendix A):
    - Dict keys sorted by Unicode code point (sort_keys=True).
    - No whitespace (separators "," and ":").
    - Non-ASCII characters emitted literally (ensure_ascii=False).
    - true/false/null lowercase (Python json defaults).
    - Integers without a decimal point (Python json default for int).
    - Array order preserved.
    - allow_nan=False; NaN or Infinity raises ValueError.
    """
    return _ENCODER.encode(obj)


# ---------------------------------------------------------------------------
# Signing
# ---------------------------------------------------------------------------


def compute_signature(salt: str, record_id: str, payload: Any) -> str:
    """Pure, testable HMAC-SHA256 signing function.

    Args:
        salt:      The HMAC key, UTF-8 encoded as-is (not trimmed, not hex-decoded).
        record_id: The record identifier (e.g. event_id or order_id).
        payload:   The JSON-serialisable payload dict.

    Returns:
        64 lowercase hexadecimal characters.

    Message construction:
        message = (record_id + "|" + canonical_json(payload)).encode("utf-8")
    """
    key: bytes = salt.encode("utf-8")
    message: bytes = (record_id + "|" + canonical_json(payload)).encode("utf-8")
    digest = hmac.new(key, message, hashlib.sha256).hexdigest()
    # hexdigest() already returns lowercase hex; assert length for safety.
    assert len(digest) == 64, f"Unexpected digest length: {len(digest)}"  # noqa: S101
    return digest


def sign_record(record_id: str, payload: Any) -> str:
    """Sign *payload* using DAY1_SALT from application settings.

    This is the production entry point used by route handlers and services.
    It reads the salt once from the cached settings object; the salt is never
    hard-coded, never trimmed, never hex-decoded.

    Returns:
        64 lowercase hexadecimal characters.
    """
    settings = get_settings()
    return compute_signature(settings.DAY1_SALT, record_id, payload)


# ---------------------------------------------------------------------------
# Idempotency helper
# ---------------------------------------------------------------------------


def canonical_json_equal(a: Any, b: Any) -> bool:
    """Return True iff *a* and *b* produce the same canonical JSON string.

    Use this to compare two payloads for idempotency checks without relying on
    Python's default dict equality (which ignores key order for the human reader
    but is structurally equivalent for JSON; canonical_json ensures a
    deterministic normalised form is compared).
    """
    return canonical_json(a) == canonical_json(b)


# ---------------------------------------------------------------------------
# Appendix A self-check
# ---------------------------------------------------------------------------

_REFERENCE_SALT = "demo-salt"
_REFERENCE_ID = "evt-1"
_REFERENCE_PAYLOAD: dict[str, str] = {"team_id": "t1", "event_type": "goal"}
_REFERENCE_CANONICAL = '{"event_type":"goal","team_id":"t1"}'
_REFERENCE_SIGNATURE = "972a8b558690b19121cc5bea84978f85e8eb15a3735018db36616bab1d7ec501"


def reference_vector_ok() -> bool:
    """Verify the Appendix A test vector.

    Returns True if both the canonical JSON and the HMAC-SHA256 signature
    match the PDF-specified expected values exactly.

    Raises AssertionError if either check fails, printing which value differed.
    """
    got_canonical = canonical_json(_REFERENCE_PAYLOAD)
    assert got_canonical == _REFERENCE_CANONICAL, (
        f"canonical_json mismatch:\n  expected: {_REFERENCE_CANONICAL!r}\n  got:      {got_canonical!r}"
    )

    got_signature = compute_signature(_REFERENCE_SALT, _REFERENCE_ID, _REFERENCE_PAYLOAD)
    assert got_signature == _REFERENCE_SIGNATURE, (
        f"HMAC signature mismatch:\n  expected: {_REFERENCE_SIGNATURE!r}\n  got:      {got_signature!r}"
    )

    print("reference_vector_ok: PASSED")
    print(f"  canonical payload : {got_canonical}")
    print(f"  signature         : {got_signature}")
    return True
