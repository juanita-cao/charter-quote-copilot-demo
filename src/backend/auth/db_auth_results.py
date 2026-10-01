"""
Raw DB I/O for auth_sessions (design_backend.md §9.3) — same pattern as
db_results.py: functions take database_url explicitly, raise on failure,
callers in auth/sessions.py decide the error strategy per node.
"""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

import psycopg

_INSERT_AUTH_SESSION_SQL = """
INSERT INTO auth_sessions
    (family_id, user_id, company_id, session_start, absolute_expires_at, current_refresh_jti)
VALUES
    (%(family_id)s, %(user_id)s, %(company_id)s, %(session_start)s,
     %(absolute_expires_at)s, %(current_refresh_jti)s)
"""


def insert_auth_session(
    database_url: str,
    *,
    family_id: UUID,
    user_id: int,
    company_id: int,
    session_start: datetime,
    absolute_expires_at: datetime,
    current_refresh_jti: UUID,
) -> None:
    """E18's raw DB I/O. Raises on failure — caller (issue_session) treats
    this as HARD FAIL, does not catch it."""
    with psycopg.connect(database_url) as conn:
        with conn.cursor() as cur:
            cur.execute(
                _INSERT_AUTH_SESSION_SQL,
                {
                    "family_id": family_id,
                    "user_id": user_id,
                    "company_id": company_id,
                    "session_start": session_start,
                    "absolute_expires_at": absolute_expires_at,
                    "current_refresh_jti": current_refresh_jti,
                },
            )
        conn.commit()


_GET_AUTH_SESSION_SQL = """
SELECT family_id, user_id, company_id, absolute_expires_at, current_refresh_jti,
       previous_refresh_jti, previous_rotated_at, revoked_at
FROM auth_sessions
WHERE family_id = %(family_id)s
"""


def get_auth_session(database_url: str, family_id: UUID) -> dict | None:
    """E21's raw DB I/O. Raises on connection/read failure — caller
    (auth.sessions.get_auth_session) must NOT catch this into None; only a
    genuine zero-row result (returned here as None) is a real 'not found'."""
    with psycopg.connect(database_url) as conn:
        with conn.cursor(row_factory=psycopg.rows.dict_row) as cur:
            cur.execute(_GET_AUTH_SESSION_SQL, {"family_id": family_id})
            return cur.fetchone()


_ROTATE_AUTH_SESSION_SQL = """
UPDATE auth_sessions
SET
    previous_refresh_jti = current_refresh_jti,
    current_refresh_jti = %(new_jti)s,
    previous_rotated_at = now(),
    updated_at = now()
WHERE family_id = %(family_id)s
  AND current_refresh_jti = %(expected_current_jti)s
  AND revoked_at IS NULL
"""


def rotate_auth_session(
    database_url: str, *, family_id: UUID, expected_current_jti: UUID, new_jti: UUID
) -> int:
    """E20's raw DB I/O — conditional UPDATE, atomic against the jti D4
    approved (design_backend.md §3.1, Design Amendment 2026-09-18). Returns
    rows affected: 1 on success, 0 means a concurrent rotation/revoke already
    changed current_refresh_jti since D4 read it (caller must not issue a
    token on 0 — see auth.sessions.rotate_session's RotationConflict)."""
    with psycopg.connect(database_url) as conn:
        with conn.cursor() as cur:
            cur.execute(
                _ROTATE_AUTH_SESSION_SQL,
                {
                    "family_id": family_id,
                    "expected_current_jti": expected_current_jti,
                    "new_jti": new_jti,
                },
            )
            rowcount = cur.rowcount
        conn.commit()
    return rowcount


_REVOKE_AUTH_SESSION_SQL = """
UPDATE auth_sessions
SET revoked_at = now()
WHERE family_id = %(family_id)s AND revoked_at IS NULL
"""


def revoke_auth_session(database_url: str, family_id: UUID) -> int:
    """E19's raw DB I/O. Returns rows affected (0 or 1). Raises on connection
    failure — caller treats that as HARD FAIL + ALERT (§9.3, review round 3
    — was SOFT)."""
    with psycopg.connect(database_url) as conn:
        with conn.cursor() as cur:
            cur.execute(_REVOKE_AUTH_SESSION_SQL, {"family_id": family_id})
            rowcount = cur.rowcount
        conn.commit()
    return rowcount
