"""
Audit log writes (design_backend.md §11). Not a DEP node.

Severity differs by action — this module only implements the SOFT path
(login_success/login_failure/refresh_token_reuse_detected/excel_export).
The HARD path (destructive actions transactionally coupled to their audit
entry — quote_soft_deleted/draft_deleted) belongs to T2.16/T2.19 when E14/E17
are wired to routes; not implemented here.
"""

from __future__ import annotations

import logging
import os

import psycopg

logger = logging.getLogger(__name__)

_INSERT_AUDIT_LOG_SQL = """
INSERT INTO audit_log (user_id, company_id, action, target_type, target_id, created_at)
VALUES (%(user_id)s, %(company_id)s, %(action)s, %(target_type)s, %(target_id)s, now())
"""


def write_audit_log_soft(
    *,
    user_id: int | None,
    company_id: int | None,
    action: str,
    target_type: str | None = None,
    target_id: int | None = None,
) -> None:
    """SOFT write (§11 table) — used for login_success, login_failure, and
    refresh_token_reuse_detected (the revoke itself already happened by the
    time this is called; a failed audit write here must never undo or block
    it). Never raises — falls back to the structured logger on failure.
    Never receives raw JWT/refresh token/password (caller's responsibility)."""
    try:
        database_url = os.environ["DATABASE_URL"]
        with psycopg.connect(database_url) as conn:
            with conn.cursor() as cur:
                cur.execute(
                    _INSERT_AUDIT_LOG_SQL,
                    {
                        "user_id": user_id,
                        "company_id": company_id,
                        "action": action,
                        "target_type": target_type,
                        "target_id": target_id,
                    },
                )
            conn.commit()
    except Exception:
        logger.exception("audit_log write failed (SOFT, action=%s)", action)
