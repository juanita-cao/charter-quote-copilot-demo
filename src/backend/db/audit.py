"""
audit_log write helpers for HARD, transactionally-coupled destructive
actions (design_backend.md §11: `quote_soft_deleted` / `draft_deleted`) —
distinct from `auth/audit.py`'s `write_audit_log_soft`, which is SOFT-only
(login_success/login_failure/refresh_token_reuse_detected).

Predecessor's own `soft_delete_quote_records`/`delete_draft_records`
(e_nodes.py E14/E17) are both SOFT and pre-date `audit_log` entirely (this
migration's own new table, §11) — they are left unmodified (inherited,
"copied from predecessor, unchanged", §7.2) rather than amended, since
adding audit coupling to them would be new functionality, not a bug fix.
E17's own docstring even says a draft has "no audit/compliance retention
need" — true of predecessor's product, written before `audit_log` existed;
§11 explicitly names `draft_deleted` (E17) as HARD/audited for this
migration, so that inherited reasoning is superseded here, not silently
followed. The functions below implement the HARD/audited variants these two
HTTP routes actually use instead; they raise on any failure — never SOFT,
and each DELETE/UPDATE + its audit_log INSERT are one transaction, one
connection, so neither ever commits without the other.
"""

from __future__ import annotations

import psycopg

_SOFT_DELETE_QUOTES_SQL = """
UPDATE quote_records
   SET deleted_at = now()
 WHERE id = ANY(%(record_ids)s)
   AND company_id = %(company_id)s
   AND deleted_at IS NULL
RETURNING id
"""

_INSERT_AUDIT_LOG_SQL = """
INSERT INTO audit_log (user_id, company_id, action, target_type, target_id, created_at)
VALUES (%(user_id)s, %(company_id)s, %(action)s, %(target_type)s, %(target_id)s, now())
"""


def soft_delete_quote_records_with_audit(
    database_url: str, record_ids: list[int], company_id: int, user_id: int
) -> int:
    """§11: `quote_soft_deleted` — the `quote_records` soft-delete UPDATE and
    one `audit_log` INSERT per record actually deleted succeed or fail
    together in a single transaction. `company_id` is AND-combined into the
    WHERE clause (ADR-020) — a foreign record ID simply matches zero rows,
    never raises or reveals that the record exists, same as E14's own
    inherited SQL."""
    if not record_ids:
        return 0
    with psycopg.connect(database_url) as conn:
        with conn.cursor() as cur:
            cur.execute(
                _SOFT_DELETE_QUOTES_SQL, {"record_ids": record_ids, "company_id": company_id}
            )
            deleted_ids = [row[0] for row in cur.fetchall()]
            for record_id in deleted_ids:
                cur.execute(
                    _INSERT_AUDIT_LOG_SQL,
                    {
                        "user_id": user_id,
                        "company_id": company_id,
                        "action": "quote_soft_deleted",
                        "target_type": "quote_records",
                        "target_id": record_id,
                    },
                )
        conn.commit()
    return len(deleted_ids)


_DELETE_DRAFTS_SQL = """
DELETE FROM quote_drafts
 WHERE id = ANY(%(record_ids)s)
   AND user_id = %(user_id)s
RETURNING id
"""


def delete_draft_records_with_audit(
    database_url: str, record_ids: list[int], user_id: int, company_id: int
) -> int:
    """§11: `draft_deleted` — the `quote_drafts` hard-DELETE and one
    `audit_log` INSERT per record actually deleted succeed or fail together
    in a single transaction. `user_id` is AND-combined into the WHERE clause
    (ADR-021 round 2/PT-17 — a draft is personal, not company-wide) — a
    foreign record ID simply matches zero rows, same as E17's own inherited
    SQL. `company_id` is not part of the WHERE filter (drafts aren't
    company-scoped); it's carried only for the audit_log row itself."""
    if not record_ids:
        return 0
    with psycopg.connect(database_url) as conn:
        with conn.cursor() as cur:
            cur.execute(_DELETE_DRAFTS_SQL, {"record_ids": record_ids, "user_id": user_id})
            deleted_ids = [row[0] for row in cur.fetchall()]
            for record_id in deleted_ids:
                cur.execute(
                    _INSERT_AUDIT_LOG_SQL,
                    {
                        "user_id": user_id,
                        "company_id": company_id,
                        "action": "draft_deleted",
                        "target_type": "quote_drafts",
                        "target_id": record_id,
                    },
                )
        conn.commit()
    return len(deleted_ids)
