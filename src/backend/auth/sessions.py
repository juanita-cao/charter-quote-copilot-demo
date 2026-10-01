"""
Session issuance/rotation/revocation DEP nodes (design_backend.md §3.1).

E18/E19/E20 are eXecute; E21 is Extract; D4 is Matching. Added for the
React+FastAPI migration — the old Streamlit st.session_state approach never
needed these modeled explicitly. Implemented incrementally, one node at a
time, in a structured design-review process — E19 (T2.7) is the only one not yet here.
"""

from __future__ import annotations

import logging
import os
from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

from src.backend.auth.jwt_utils import sign_token
from src.backend.configs.feature_flags import (
    ABSOLUTE_SESSION_TTL_DAYS,
    ACCESS_TOKEN_TTL_MINUTES,
    REFRESH_REUSE_GRACE_SECONDS,
    REFRESH_TOKEN_TTL_DAYS,
)
from src.backend.schemas import AuthSessionState, RefreshDecision, TokenPair, VerifiedRefreshClaims

logger = logging.getLogger(__name__)


def issue_session(user_id: int, company_id: int) -> TokenPair:
    """E18 · eXecute — issue a new access+refresh JWT pair and create the
    backing auth_sessions row on successful login.

    HARD FAIL if the DB insert fails (not caught here, propagates to the
    caller) — a login must not succeed without a persisted session to anchor
    rotation/revocation (design_backend.md §3.1)."""
    from src.backend.auth.db_auth_results import insert_auth_session

    family_id = uuid4()
    now = datetime.now(UTC)
    session_start = now
    absolute_expires_at = session_start + timedelta(days=ABSOLUTE_SESSION_TTL_DAYS)
    access_jti = uuid4()
    refresh_jti = uuid4()
    access_expires_at = now + timedelta(minutes=ACCESS_TOKEN_TTL_MINUTES)
    refresh_expires_at = min(now + timedelta(days=REFRESH_TOKEN_TTL_DAYS), absolute_expires_at)

    database_url = os.environ["DATABASE_URL"]
    insert_auth_session(
        database_url,
        family_id=family_id,
        user_id=user_id,
        company_id=company_id,
        session_start=session_start,
        absolute_expires_at=absolute_expires_at,
        current_refresh_jti=refresh_jti,
    )

    access_token = sign_token(
        user_id=user_id,
        company_id=company_id,
        family_id=family_id,
        jti=access_jti,
        token_type="access",
        expires_at=access_expires_at,
    )
    refresh_token = sign_token(
        user_id=user_id,
        company_id=company_id,
        family_id=family_id,
        jti=refresh_jti,
        token_type="refresh",
        expires_at=refresh_expires_at,
    )
    return TokenPair(access_token=access_token, refresh_token=refresh_token, family_id=family_id)


def get_auth_session(family_id: UUID) -> AuthSessionState | None:
    """E21 · Extract — fetch the auth_sessions row D4 needs to decide
    anything. Two distinct outcomes, NOT collapsed (design_backend.md
    §3.1/§9.2, fixed review round 5):

    - genuinely not found (query succeeds, zero rows) -> None (SOFT) —
      D4 treats None as reject_compromise
    - DB connection/read failure -> raises (HARD FAIL) — propagates to the
      caller, which must return 503 and never call D4 on this path. An
      infrastructure outage must never be recorded or acted on as a
      security incident."""
    from src.backend.auth.db_auth_results import get_auth_session as _db_get_session

    database_url = os.environ["DATABASE_URL"]
    row = _db_get_session(database_url, family_id)  # raises on connection failure — not caught
    if row is None:
        return None
    return AuthSessionState(**row)


def evaluate_refresh_request(
    claims: VerifiedRefreshClaims, session: AuthSessionState | None
) -> RefreshDecision:
    """D4 · Matching — decide whether a refresh request rotates, is a benign
    race, is expired, or is compromise. Pure function: no I/O, no side
    effects — the caller executes whatever the outcome obligates (§9.3):
    rotate -> call E20; reject_compromise -> call E19 + audit.

    Precedence, checked in this exact order (design_backend.md §3.1) —
    identity/None/revoked/expired are ruled out *before* the jti comparison:
    1. session is None -> reject_compromise (D4-S00/S09)
    2. claims identity != session identity -> reject_compromise (D4-S10)
    3. session.revoked_at is not None -> reject_compromise (D4-S05)
    4. now >= session.absolute_expires_at -> reject_expired (D4-S06/S07/S08)
    5. claims.jti == session.current_refresh_jti -> rotate (D4-S01)
    6. claims.jti == session.previous_refresh_jti and age <= GRACE -> reject_grace (D4-S02)
    7. else -> reject_compromise (D4-S03/S04)
    """
    if session is None:
        return RefreshDecision(outcome="reject_compromise", family_id=claims.family_id)

    if claims.user_id != session.user_id or claims.company_id != session.company_id:
        return RefreshDecision(outcome="reject_compromise", family_id=claims.family_id)

    if session.revoked_at is not None:
        return RefreshDecision(outcome="reject_compromise", family_id=claims.family_id)

    now = datetime.now(UTC)
    if now >= session.absolute_expires_at:
        return RefreshDecision(outcome="reject_expired", family_id=claims.family_id)

    if claims.jti == session.current_refresh_jti:
        return RefreshDecision(outcome="rotate", family_id=claims.family_id)

    if (
        session.previous_refresh_jti is not None
        and claims.jti == session.previous_refresh_jti
        and session.previous_rotated_at is not None
        and (now - session.previous_rotated_at).total_seconds() <= REFRESH_REUSE_GRACE_SECONDS
    ):
        return RefreshDecision(outcome="reject_grace", family_id=claims.family_id)

    return RefreshDecision(outcome="reject_compromise", family_id=claims.family_id)


class RotationConflict(Exception):
    """Raised by rotate_session when the conditional UPDATE affects zero rows
    — a concurrent rotation or revoke already changed current_refresh_jti
    since D4 read it. Caller must return 401 and issue no token, never retry
    with the same expectation (design_backend.md §3.1, Design Amendment
    2026-09-18)."""


def rotate_session(session: AuthSessionState) -> TokenPair:
    """E20 · eXecute — issue a new access+refresh pair under an existing
    family when D4 approves rotation. Atomically conditioned on
    session.current_refresh_jti — two concurrent requests that both read the
    same starting jti cannot both succeed.

    Takes the whole AuthSessionState (Design Amendment 2026-09-18 — the
    originally approved family_id/expected_current_jti 2-arg signature had
    no way to get user_id/company_id to sign the new tokens, or
    absolute_expires_at to cap the new refresh expiry; the caller already
    holds this object from its preceding E21 call, the same one D4 used).

    HARD FAIL (raises) if the DB update itself fails (connection error, same
    reasoning as E18). Raises RotationConflict if the conditional UPDATE
    affects zero rows — never issues a token on that path."""
    from src.backend.auth.db_auth_results import rotate_auth_session

    database_url = os.environ["DATABASE_URL"]
    new_access_jti = uuid4()
    new_refresh_jti = uuid4()
    now = datetime.now(UTC)
    access_expires_at = now + timedelta(minutes=ACCESS_TOKEN_TTL_MINUTES)
    refresh_expires_at = min(
        now + timedelta(days=REFRESH_TOKEN_TTL_DAYS), session.absolute_expires_at
    )

    rowcount = rotate_auth_session(
        database_url,
        family_id=session.family_id,
        expected_current_jti=session.current_refresh_jti,
        new_jti=new_refresh_jti,
    )
    if rowcount == 0:
        raise RotationConflict(
            f"family {session.family_id}: current_refresh_jti no longer matches "
            "the jti D4 approved — concurrent rotation or revoke"
        )

    access_token = sign_token(
        user_id=session.user_id,
        company_id=session.company_id,
        family_id=session.family_id,
        jti=new_access_jti,
        token_type="access",
        expires_at=access_expires_at,
    )
    refresh_token = sign_token(
        user_id=session.user_id,
        company_id=session.company_id,
        family_id=session.family_id,
        jti=new_refresh_jti,
        token_type="refresh",
        expires_at=refresh_expires_at,
    )
    return TokenPair(
        access_token=access_token, refresh_token=refresh_token, family_id=session.family_id
    )


def revoke_session_family(family_id: UUID) -> int:
    """E19 · eXecute — invalidate an entire session family. Called on
    explicit logout, or on D4's reject_compromise outcome.

    HARD FAIL + ALERT if the DB write fails (raises here — changed review
    round 3, was SOFT). A failed revoke is not a successful security action:
    the caller must never report success (e.g. a logout "you are logged
    out" response, or issuing a new token) unless this write is confirmed
    persisted."""
    from src.backend.auth.db_auth_results import revoke_auth_session

    database_url = os.environ["DATABASE_URL"]
    return revoke_auth_session(database_url, family_id)
