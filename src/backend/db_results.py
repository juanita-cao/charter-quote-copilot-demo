from __future__ import annotations

import json

import psycopg

_INSERT_SQL = """
INSERT INTO quote_records (
    route, cargo_description, quantity, freight_rate, commission_rate,
    market_benchmark, shipowner_asking_tce, tce, profit_margin_pct, decision,
    quote_input_snapshot, deal_decision_snapshot, reverse_quote_snapshot, company_id, created_at
) VALUES (
    %(route)s, %(cargo_description)s, %(quantity)s, %(freight_rate)s, %(commission_rate)s,
    %(market_benchmark)s, %(shipowner_asking_tce)s, %(tce)s, %(profit_margin_pct)s, %(decision)s,
    %(quote_input_snapshot)s, %(deal_decision_snapshot)s, %(reverse_quote_snapshot)s,
    %(company_id)s, COALESCE(%(created_at)s, now())
)
"""


def insert_quote_record(database_url: str, row: dict) -> None:
    """Raw DB I/O — INSERT one row into quote_records. Raises on failure; no error handling here."""
    with psycopg.connect(database_url) as conn:
        with conn.cursor() as cur:
            cur.execute(_INSERT_SQL, row)
        conn.commit()


_HISTORY_SQL = """
SELECT id, created_at, route, cargo_description, quantity, freight_rate,
       commission_rate, tce, profit_margin_pct, decision,
       quote_input_snapshot, deal_decision_snapshot
FROM quote_records
WHERE created_at >= %(start_ts)s AND created_at < %(end_ts)s
  AND company_id = %(company_id)s
  AND deleted_at IS NULL
ORDER BY created_at DESC
"""


_SEARCH_SQL = """
SELECT id, created_at, route, cargo_description, quantity, freight_rate,
       commission_rate, tce, profit_margin_pct, decision,
       quote_input_snapshot, deal_decision_snapshot
FROM quote_records
WHERE
    company_id = %(company_id)s
    AND deleted_at IS NULL
    AND (%(route)s = '' OR route ILIKE '%%' || %(route)s || '%%')
    AND (
        %(cargo_description)s = ''
        OR cargo_description ILIKE '%%' || %(cargo_description)s || '%%'
    )
    AND (
        %(vessel_name)s = ''
        OR quote_input_snapshot->>'vessel_name'
           ILIKE '%%' || %(vessel_name)s || '%%'
    )
    AND (
        %(vessel_dwt)s = 0
        OR (quote_input_snapshot->>'vessel_dwt')::int = %(vessel_dwt)s
    )
ORDER BY created_at DESC
LIMIT 50
"""


def search_quote_records(
    database_url: str,
    company_id: int,
    route: str = "",
    cargo_description: str = "",
    vessel_name: str = "",
    vessel_dwt: int = 0,
) -> list[dict]:
    """Keyword search (ILIKE) across quote_records, always scoped to company_id
    (ADR-016 — silent, non-optional tenant filter, AND-combined with every
    other filter). vessel_name and vessel_dwt are read from the JSONB
    quote_input_snapshot column. Raises on failure; caller wraps with SOFT strategy."""
    with psycopg.connect(database_url) as conn:
        with conn.cursor(row_factory=psycopg.rows.dict_row) as cur:
            cur.execute(
                _SEARCH_SQL,
                {
                    "company_id": company_id,
                    "route": route,
                    "cargo_description": cargo_description,
                    "vessel_name": vessel_name,
                    "vessel_dwt": vessel_dwt,
                },
            )
            return list(cur.fetchall())


_BUNKER_PRICE_SQL = """
SELECT port, vlsfo_low, vlsfo_high, lsmgo_low, lsmgo_high,
       report_date, scraped_at, vote_agreement
FROM bunker_price_reference
WHERE port = %(port)s
ORDER BY scraped_at DESC
LIMIT 1
"""


def get_bunker_price(database_url: str, port: str) -> dict | None:
    """Latest scraped row for an exact port name (port names are normalized
    to a canonical list at scrape time — see scripts/scrape_bunker_prices.py
    — so this is an exact match, not ILIKE). Raises on failure; caller wraps
    with SOFT strategy."""
    with psycopg.connect(database_url) as conn:
        with conn.cursor(row_factory=psycopg.rows.dict_row) as cur:
            cur.execute(_BUNKER_PRICE_SQL, {"port": port})
            return cur.fetchone()


def query_quote_history(
    database_url: str, start_ym: str, end_ym: str, company_id: int
) -> list[dict]:
    """Return records in [start_ym, end_ym] inclusive (YYYY-MM strings),
    scoped to company_id (ADR-016). Raises on failure; caller wraps with SOFT strategy."""
    from datetime import date

    sy, sm = int(start_ym[:4]), int(start_ym[5:7])
    ey, em = int(end_ym[:4]), int(end_ym[5:7])
    # end is exclusive: advance by one month
    if em == 12:
        ey, em = ey + 1, 1
    else:
        em += 1
    start_ts = date(sy, sm, 1).isoformat()
    end_ts = date(ey, em, 1).isoformat()

    with psycopg.connect(database_url) as conn:
        with conn.cursor(row_factory=psycopg.rows.dict_row) as cur:
            cur.execute(
                _HISTORY_SQL,
                {"start_ts": start_ts, "end_ts": end_ts, "company_id": company_id},
            )
            return list(cur.fetchall())


_DUPLICATE_COMPANY_SQL = "SELECT id FROM companies WHERE name = %(name)s"
_DUPLICATE_EMAIL_SQL = "SELECT id FROM users WHERE email = %(email)s"
_INSERT_COMPANY_SQL = "INSERT INTO companies (name) VALUES (%(name)s) RETURNING id"
_INSERT_USER_SQL = """
INSERT INTO users (company_id, email, password_hash)
VALUES (%(company_id)s, %(email)s, %(password_hash)s)
RETURNING id
"""
_GET_USER_BY_EMAIL_SQL = """
SELECT id, company_id, email, password_hash FROM users WHERE email = %(email)s
"""


def register_company(database_url: str, company_name: str, email: str, password_hash: str) -> dict:
    """E8's raw DB I/O — duplicate company name / email is an expected,
    returned outcome (not raised); genuine connectivity failures raise and
    are caught by e_nodes.register_company's SOFT wrapper (ADR-016)."""
    with psycopg.connect(database_url) as conn:
        with conn.cursor(row_factory=psycopg.rows.dict_row) as cur:
            cur.execute(_DUPLICATE_COMPANY_SQL, {"name": company_name})
            if cur.fetchone() is not None:
                return {
                    "success": False,
                    "company_id": None,
                    "user_id": None,
                    "error_message": "Company name already exists",
                }
            cur.execute(_DUPLICATE_EMAIL_SQL, {"email": email})
            if cur.fetchone() is not None:
                return {
                    "success": False,
                    "company_id": None,
                    "user_id": None,
                    "error_message": "Email already registered",
                }
            cur.execute(_INSERT_COMPANY_SQL, {"name": company_name})
            company_id = cur.fetchone()["id"]
            cur.execute(
                _INSERT_USER_SQL,
                {"company_id": company_id, "email": email, "password_hash": password_hash},
            )
            user_id = cur.fetchone()["id"]
        conn.commit()
    return {
        "success": True,
        "company_id": company_id,
        "user_id": user_id,
        "error_message": None,
    }


def get_user_by_email(database_url: str, email: str) -> dict | None:
    """E9's raw DB I/O. Raises on failure; caller wraps with SOFT strategy."""
    with psycopg.connect(database_url) as conn:
        with conn.cursor(row_factory=psycopg.rows.dict_row) as cur:
            cur.execute(_GET_USER_BY_EMAIL_SQL, {"email": email})
            return cur.fetchone()


_SAVE_DRAFT_SQL = """
INSERT INTO quote_drafts (user_id, company_id, route, cargo_description, raw_input_json, updated_at)
VALUES (%(user_id)s, %(company_id)s, %(route)s, %(cargo_description)s, %(raw_input_json)s, now())
"""

_GET_DRAFT_SQL = """
SELECT raw_input_json FROM quote_drafts
WHERE user_id = %(user_id)s
ORDER BY updated_at DESC
LIMIT 1
"""

_GET_DRAFT_UPDATED_AT_SQL = """
SELECT updated_at FROM quote_drafts
WHERE user_id = %(user_id)s
ORDER BY updated_at DESC
LIMIT 1
"""


def save_draft(database_url: str, user_id: int, company_id: int, raw_input_json: dict) -> None:
    """E12's raw DB I/O. **[AMENDMENT 2026-08-03, ADR-021]** Plain `INSERT`,
    not upsert — every call creates a new draft row (PT-17 removed the
    one-draft-per-user limit). `route`/`cargo_description` are denormalized
    out of `raw_input_json` (may be absent — a draft can be incomplete, so
    `.get(..., "")`, never a required-field error) so drafts are
    searchable/filterable the same way `quote_records` is (E15/E16).
    No validation of `raw_input_json`'s shape otherwise. Raises on failure;
    caller wraps with SOFT strategy."""
    with psycopg.connect(database_url) as conn:
        with conn.cursor() as cur:
            cur.execute(
                _SAVE_DRAFT_SQL,
                {
                    "user_id": user_id,
                    "company_id": company_id,
                    "route": raw_input_json.get("route") or "",
                    "cargo_description": raw_input_json.get("cargo_description") or "",
                    "raw_input_json": json.dumps(raw_input_json),
                },
            )
        conn.commit()


def get_draft(database_url: str, user_id: int) -> dict | None:
    """E13's raw DB I/O. **[AMENDMENT 2026-08-03, ADR-021]** With multiple
    drafts now possible, returns the *most recent* one (`ORDER BY
    updated_at DESC LIMIT 1`) — still exactly one row, preserving the
    Resume Draft banner's existing "just show me where I left off"
    behavior unchanged. Raises on failure; caller wraps with SOFT strategy."""
    with psycopg.connect(database_url) as conn:
        with conn.cursor(row_factory=psycopg.rows.dict_row) as cur:
            cur.execute(_GET_DRAFT_SQL, {"user_id": user_id})
            row = cur.fetchone()
            return row["raw_input_json"] if row else None


def get_draft_updated_at(database_url: str, user_id: int):
    """2026-07-31 — small, separate query (not folded into `get_draft`/E13,
    which several call sites and tests already treat as "returns just the
    raw snapshot dict or None") so the Resume Draft banner can show *when*
    the draft was saved without touching that existing contract.
    **[AMENDMENT 2026-08-03]** Same `ORDER BY updated_at DESC LIMIT 1` as
    `get_draft`, for the same reason — always describes the same row
    `get_draft` would return. Raises on failure; caller wraps with SOFT
    strategy, same as `get_draft`."""
    with psycopg.connect(database_url) as conn:
        with conn.cursor(row_factory=psycopg.rows.dict_row) as cur:
            cur.execute(_GET_DRAFT_UPDATED_AT_SQL, {"user_id": user_id})
            row = cur.fetchone()
            return row["updated_at"] if row else None


_SEARCH_DRAFT_SQL = """
SELECT id, user_id, route, cargo_description, updated_at, raw_input_json
FROM quote_drafts
WHERE
    user_id = %(user_id)s
    AND (%(route)s = '' OR route ILIKE '%%' || %(route)s || '%%')
    AND (
        %(cargo_description)s = ''
        OR cargo_description ILIKE '%%' || %(cargo_description)s || '%%'
    )
    AND (
        %(vessel_name)s = ''
        OR raw_input_json->>'vessel_name'
           ILIKE '%%' || %(vessel_name)s || '%%'
    )
    AND (
        %(vessel_dwt)s = 0
        OR (raw_input_json->>'vessel_dwt')::int = %(vessel_dwt)s
    )
ORDER BY updated_at DESC
LIMIT 50
"""


def search_draft_records(
    database_url: str,
    user_id: int,
    route: str = "",
    cargo_description: str = "",
    vessel_name: str = "",
    vessel_dwt: int = 0,
) -> list[dict]:
    """E15's raw DB I/O (ADR-021, PT-17) — mirrors `search_quote_records`
    (E6) exactly in shape, but scoped by `user_id`, not `company_id`: a
    draft is this OP's own personal in-progress work, not a company-wide
    asset. `vessel_name`/`vessel_dwt` are read out of `raw_input_json` the
    same way E6 reads them out of `quote_input_snapshot`. Raises on
    failure; caller wraps with SOFT strategy."""
    with psycopg.connect(database_url) as conn:
        with conn.cursor(row_factory=psycopg.rows.dict_row) as cur:
            cur.execute(
                _SEARCH_DRAFT_SQL,
                {
                    "user_id": user_id,
                    "route": route,
                    "cargo_description": cargo_description,
                    "vessel_name": vessel_name,
                    "vessel_dwt": vessel_dwt,
                },
            )
            return list(cur.fetchall())


_DRAFT_HISTORY_SQL = """
SELECT id, user_id, route, cargo_description, updated_at, raw_input_json
FROM quote_drafts
WHERE updated_at >= %(start_ts)s AND updated_at < %(end_ts)s
  AND user_id = %(user_id)s
ORDER BY updated_at DESC
"""


def query_draft_history(database_url: str, start_ym: str, end_ym: str, user_id: int) -> list[dict]:
    """E16's raw DB I/O (ADR-021, PT-17) — mirrors `query_quote_history`
    (E5) exactly in shape (month-range, [start_ym, end_ym] inclusive), but
    scoped by `user_id`, not `company_id`, same reasoning as E15. Raises on
    failure; caller wraps with SOFT strategy."""
    from datetime import date

    sy, sm = int(start_ym[:4]), int(start_ym[5:7])
    ey, em = int(end_ym[:4]), int(end_ym[5:7])
    if em == 12:
        ey, em = ey + 1, 1
    else:
        em += 1
    start_ts = date(sy, sm, 1).isoformat()
    end_ts = date(ey, em, 1).isoformat()

    with psycopg.connect(database_url) as conn:
        with conn.cursor(row_factory=psycopg.rows.dict_row) as cur:
            cur.execute(
                _DRAFT_HISTORY_SQL,
                {"start_ts": start_ts, "end_ts": end_ts, "user_id": user_id},
            )
            return list(cur.fetchall())


_DELETE_DRAFTS_SQL = """
DELETE FROM quote_drafts
 WHERE id = ANY(%(record_ids)s)
   AND user_id = %(user_id)s
"""


def delete_draft_records(database_url: str, record_ids: list[int], user_id: int) -> int:
    """E17's raw DB I/O (ADR-021 round 2, PT-17). Unlike `soft_delete_quote_records`,
    this is a real DELETE — a draft has no audit/compliance retention need. user_id
    is AND-combined into the WHERE clause, same non-disclosure pattern as E14/ADR-020:
    another user's draft ID simply matches zero rows. Raises on DB failure; caller
    wraps with SOFT strategy."""
    if not record_ids:
        return 0
    with psycopg.connect(database_url) as conn:
        with conn.cursor() as cur:
            cur.execute(_DELETE_DRAFTS_SQL, {"record_ids": record_ids, "user_id": user_id})
            affected = cur.rowcount
        conn.commit()
    return affected


_GET_COMPANY_ROUTES_SQL = """
SELECT route FROM company_routes WHERE company_id = %(company_id)s ORDER BY route
"""

_REMEMBER_ROUTE_SQL = """
INSERT INTO company_routes (company_id, route) VALUES (%(company_id)s, %(route)s)
ON CONFLICT (company_id, route) DO NOTHING
"""


def get_company_routes(database_url: str, company_id: int) -> list[str]:
    """E10's raw DB I/O. Raises on failure; caller wraps with SOFT strategy."""
    with psycopg.connect(database_url) as conn:
        with conn.cursor() as cur:
            cur.execute(_GET_COMPANY_ROUTES_SQL, {"company_id": company_id})
            return [row[0] for row in cur.fetchall()]


def remember_company_route(database_url: str, company_id: int, route: str) -> None:
    """E11's raw DB I/O — idempotent upsert. Raises on failure; caller wraps with SOFT strategy."""
    with psycopg.connect(database_url) as conn:
        with conn.cursor() as cur:
            cur.execute(_REMEMBER_ROUTE_SQL, {"company_id": company_id, "route": route})
        conn.commit()


_GET_PRECISION_MODE_SQL = """
SELECT calc_precision_mode FROM companies WHERE id = %(company_id)s
"""


def get_company_precision_mode(database_url: str, company_id: int) -> str:
    """Raw DB I/O for hydrating QuoteSessionState.calc_precision_mode right
    after login/register (ADR-018) — not a numbered DEP node, same treatment
    as session-lifecycle helpers (design_backend.md §5.2). Raises on failure
    or a missing row; caller wraps with SOFT strategy, defaulting to "full"."""
    with psycopg.connect(database_url) as conn:
        with conn.cursor() as cur:
            cur.execute(_GET_PRECISION_MODE_SQL, {"company_id": company_id})
            row = cur.fetchone()
            if row is None:
                raise ValueError(f"no company with id={company_id}")
            return row[0]


_GET_COMPANY_NAME_SQL = """
SELECT name FROM companies WHERE id = %(company_id)s
"""


def get_company_name(database_url: str, company_id: int) -> str:
    """2026-07-31 — raw DB I/O for hydrating QuoteSessionState.company_name
    right after login/register, same treatment as get_company_precision_mode
    above (a fresh small query, not folded into D3's login/E8's register
    queries). Raises on failure or a missing row; caller wraps with SOFT
    strategy, falling back to the email instead of blocking login."""
    with psycopg.connect(database_url) as conn:
        with conn.cursor() as cur:
            cur.execute(_GET_COMPANY_NAME_SQL, {"company_id": company_id})
            row = cur.fetchone()
            if row is None:
                raise ValueError(f"no company with id={company_id}")
            return row[0]


_SOFT_DELETE_SQL = """
UPDATE quote_records
   SET deleted_at = now()
 WHERE id = ANY(%(record_ids)s)
   AND company_id = %(company_id)s
   AND deleted_at IS NULL
"""


def soft_delete_quote_records(database_url: str, record_ids: list[int], company_id: int) -> int:
    """E14's raw DB I/O. company_id is AND-combined into the WHERE clause —
    a foreign record ID simply matches zero rows, never raises or reveals
    that the record exists (ADR-020). Raises on DB failure; caller wraps
    with SOFT strategy."""
    if not record_ids:
        return 0
    with psycopg.connect(database_url) as conn:
        with conn.cursor() as cur:
            cur.execute(_SOFT_DELETE_SQL, {"record_ids": record_ids, "company_id": company_id})
            affected = cur.rowcount
        conn.commit()
    return affected


_EXPORT_QUOTES_SQL = """
SELECT id, created_at, route, cargo_description, quantity, freight_rate,
       commission_rate, tce, profit_margin_pct, decision, quote_input_snapshot
FROM quote_records
WHERE id = ANY(%(ids)s)
  AND company_id = %(company_id)s
  AND deleted_at IS NULL
"""

_EXPORT_DRAFTS_SQL = """
SELECT id, updated_at, route, cargo_description, raw_input_json
FROM quote_drafts
WHERE id = ANY(%(ids)s)
  AND user_id = %(user_id)s
"""


def fetch_records_for_export(
    database_url: str, quote_ids: list[int], draft_ids: list[int], company_id: int, user_id: int
) -> list[dict]:
    """E22 (T2.22): the records asked for by the Excel export, each tagged `_kind`
    = "quote" / "draft". Quotes are company-scoped and exclude soft-deleted rows, drafts
    are user-scoped (same as E5/E6/E15/E16); an id outside the caller's tenant simply
    matches nothing, never an error. HARD: a DB failure raises, so a partial export can
    never be produced."""
    if not quote_ids and not draft_ids:
        return []
    rows: list[dict] = []
    with psycopg.connect(database_url) as conn:
        with conn.cursor(row_factory=psycopg.rows.dict_row) as cur:
            if quote_ids:
                cur.execute(_EXPORT_QUOTES_SQL, {"ids": quote_ids, "company_id": company_id})
                rows.extend({**r, "_kind": "quote"} for r in cur.fetchall())
            if draft_ids:
                cur.execute(_EXPORT_DRAFTS_SQL, {"ids": draft_ids, "user_id": user_id})
                rows.extend({**r, "_kind": "draft"} for r in cur.fetchall())
    return rows


_BUNKER_PRICE_HISTORY_SQL = """
SELECT report_date, vlsfo_low, vlsfo_high, lsmgo_low, lsmgo_high
FROM bunker_price_reference
WHERE port = %(port)s
ORDER BY report_date
"""


def get_bunker_price_history(database_url: str, port: str) -> list[dict]:
    """E24 · Extract — dashboard 1 (design_backend.md §24): every scraped reference-price
    row for one port, oldest first (not just the latest, unlike `get_bunker_price`).
    Public data, not tenant-scoped — same as `get_bunker_price`. The only series this
    dashboard shows: a per-company "actual price paid" series was built and then dropped
    at the client's request (2026-09-23) — the price an operator types into a quote is
    itself usually copied from this same scraped reference, so a second series wasn't an
    independent signal, just a circular echo of the first. SOFT — [] on failure."""
    with psycopg.connect(database_url) as conn:
        with conn.cursor(row_factory=psycopg.rows.dict_row) as cur:
            cur.execute(_BUNKER_PRICE_HISTORY_SQL, {"port": port})
            return cur.fetchall()


_VESSEL_TYPE_STATS_SQL = """
SELECT created_at::date AS quote_date, (quote_input_snapshot->>'vessel_dwt')::int AS vessel_dwt,
       tce, profit_margin_pct
FROM quote_records
WHERE company_id = %(company_id)s
  AND deleted_at IS NULL
  AND tce IS NOT NULL
"""


def get_vessel_type_stats(database_url: str, company_id: int) -> list[dict]:
    """E25 · Extract — dashboards 2+3 (design_backend.md §24, merged 2026-09-23 into one
    TCE-by-vessel-type-band trend over time, per client request): one row per saved quote
    (quote_date, vessel_dwt, tce, profit_margin_pct), company-scoped. Raw, not pre-bucketed
    — banding into DWT tiers, and the monthly aggregation for the trend line, both happen
    client-side against `DWT_TIERS` (fieldGroups.ts), the one place that list already
    lives, rather than a second Python copy that could drift from it. SOFT — caller wraps
    with the usual empty-list fallback."""
    with psycopg.connect(database_url) as conn:
        with conn.cursor(row_factory=psycopg.rows.dict_row) as cur:
            cur.execute(_VESSEL_TYPE_STATS_SQL, {"company_id": company_id})
            return cur.fetchall()


_FREIGHT_TREND_SQL = """
SELECT created_at::date AS quote_date, cargo_description, freight_rate
FROM quote_records
WHERE company_id = %(company_id)s
  AND deleted_at IS NULL
  AND freight_rate IS NOT NULL
  AND cargo_description IS NOT NULL AND cargo_description != ''
  AND COALESCE(quote_input_snapshot->>'cargo_notes', '') NOT LIKE '【仅总运费%%'
"""


def get_freight_trend(database_url: str, company_id: int) -> list[dict]:
    """E26 · Extract — dashboard 4 (design_backend.md §24): one row per saved quote
    (quote_date, cargo_description, freight_rate), company-scoped. Raw, not grouped by
    cargo — the frontend matches `cargo_description` against PT-18's `cargo.json`
    (`matchCargo`, the same dictionary the recogniser already uses) to group into the
    standard cargo list, rather than a second Python copy of that dictionary. SOFT —
    caller wraps with the usual empty-list fallback."""
    with psycopg.connect(database_url) as conn:
        with conn.cursor(row_factory=psycopg.rows.dict_row) as cur:
            cur.execute(_FREIGHT_TREND_SQL, {"company_id": company_id})
            return cur.fetchall()


_PORT_COST_SQL = """
SELECT created_at::date AS quote_date,
       quote_input_snapshot->>'load_port' AS load_port,
       (quote_input_snapshot->>'load_port_pda')::numeric AS load_port_pda,
       quote_input_snapshot->>'discharge_port' AS discharge_port,
       (quote_input_snapshot->>'discharge_port_pda')::numeric AS discharge_port_pda
FROM quote_records
WHERE company_id = %(company_id)s
  AND deleted_at IS NULL
"""


def get_port_cost_stats(database_url: str, company_id: int) -> list[dict]:
    """E27 · Extract — dashboard 5 (design_backend.md §24): one row per saved quote
    (quote_date, load_port, load_port_pda, discharge_port, discharge_port_pda),
    company-scoped. Raw — the frontend flattens each row into up to two (port, quote_date,
    pda) observations and groups per port, rather than a second Python copy of that
    grouping. Pre-split legacy records (the even port_cost÷2 estimate,
    `upgrade_legacy_snapshot`) are included exactly like real splits — client-confirmed
    2026-09-23, no new logic, this only reads the same `load_port_pda`/`discharge_port_pda`
    fields every other consumer already does. SOFT — caller wraps with the usual
    empty-list fallback."""
    with psycopg.connect(database_url) as conn:
        with conn.cursor(row_factory=psycopg.rows.dict_row) as cur:
            cur.execute(_PORT_COST_SQL, {"company_id": company_id})
            return cur.fetchall()
