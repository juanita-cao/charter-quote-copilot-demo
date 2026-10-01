from __future__ import annotations

import logging
import os
from typing import Literal

from src.backend.legacy import upgrade_draft_rows, upgrade_legacy_snapshot, upgrade_quote_rows
from src.backend.rounding import excel_round
from src.backend.schemas import (
    BunkerPriceResult,
    DealDecision,
    QuoteInput,
    RegisterInput,
    RegisterResult,
    ReverseQuoteResult,
    RiskScenarioRow,
    TCEResult,
)

logger = logging.getLogger(__name__)


def safe_div(numerator: float, denominator: float) -> float:
    """Divide, returning 0 instead of raising on a zero denominator."""
    return numerator / denominator if denominator else 0.0


def collect_quote_inputs(raw_ui_state: dict) -> QuoteInput:
    """E1 · Extract — validate raw request/UI state into QuoteInput."""
    return QuoteInput(**raw_ui_state)


def _effective_days(
    label: str, mode: str, days: float | None, rate: float | None, quantity: float, round2
) -> float:
    """v1.1: days used for one port: typed, or quantity / rate (rounded like any day figure)."""
    if mode == "rate":
        if rate is None or rate <= 0:
            raise ValueError(f"{label}_rate must be given and positive in rate mode")
        return round2(quantity / rate)
    if days is None:
        raise ValueError(f"{label}_days must be given in days mode")
    return days


def calculate_tce(
    inputs: QuoteInput, precision_mode: Literal["full", "display"] = "full"
) -> TCEResult:
    """E2 · Transform — voyage days + bunker cost + total voyage cost → tce.

    precision_mode="display" (ADR-023, amends ADR-018) rounds the result of
    EVERY arithmetic step to 2 decimals immediately after it's produced,
    before that value feeds the next step — matching a real client accountant
    workflow: reconciling against an Excel workbook with "Precision as
    Displayed" enabled, which permanently rounds every cell and computes
    every downstream formula from the rounded value, not the full-precision
    one. This includes total_days itself (each leg/crossing's days rounds
    individually, then they're summed) — ADR-018 originally said total_days
    is never rounded, on the theory that rounding a duration was an
    unrequested addition; the client's real workflow rounds it as a matter of
    course, so ADR-023 supersedes that specific rule. "full" mode is
    completely unaffected — zero rounding anywhere, identical to pre-ADR-018
    behavior."""
    _round2 = excel_round if precision_mode == "display" else (lambda x: x)

    # Special passage legs (长江口 / 琼州海峡, ADR-024 — supersedes ADR-022's
    # field shape) — each strait is split directly into a laden bucket and a
    # ballast bucket (no is_laden flag; loading state is which field is
    # filled) AND each bucket has its own dedicated MGO consumption rate —
    # NOT laden_consumption/ballast_consumption, since a narrow-channel/
    # pilotage transit burns fuel at a genuinely different rate than
    # open-sea sailing. No HFO rate — CJK/QZ transit is MGO-only (confirmed
    # by the client, ADR-024). A bucket's loading state selects speed only
    # (which base leg that bucket's own days are computed at); it has no
    # bearing on which consumption rate applies.
    #
    # Every bucket's nm is carved OUT of the ballast/laden distance it
    # belongs to BEFORE computing that leg's days — not added on top of the
    # full point-to-point distance — otherwise the bucket's transit time and
    # fuel get counted twice (2026-08-07 client bug report:
    # ballast_distance/laden_distance are entered as the full point-to-point
    # nm, already inclusive of any special-passage stretch within that leg).
    # The leg carved from must match the speed used for the bucket's own
    # days, or the total drifts (proven in ADR-022) — hence carving from
    # ballast_distance exactly for the two ballast buckets (ballast_speed
    # used both places) and from laden_distance exactly for the two laden
    # buckets.
    special_legs = (
        (inputs.cjk_laden_nm, True, inputs.cjk_laden_mgo_consumption),
        (inputs.cjk_ballast_nm, False, inputs.cjk_ballast_mgo_consumption),
        (inputs.qz_laden_nm, True, inputs.qz_laden_mgo_consumption),
        (inputs.qz_ballast_nm, False, inputs.qz_ballast_mgo_consumption),
    )

    ballast_special_nm = sum(nm for nm, is_laden, _ in special_legs if not is_laden)
    laden_special_nm = sum(nm for nm, is_laden, _ in special_legs if is_laden)
    ballast_base_nm = inputs.ballast_distance - ballast_special_nm
    laden_base_nm = inputs.laden_distance - laden_special_nm
    if ballast_base_nm < 0 or laden_base_nm < 0:
        raise ValueError("special passage nm exceeds the ballast/laden distance it's carved out of")

    special_days = 0.0
    special_mgo_qty = 0.0
    ballast_special_days = 0.0
    laden_special_days = 0.0
    for nm, is_laden, mgo_rate in special_legs:
        speed = inputs.laden_speed if is_laden else inputs.ballast_speed
        days = _round2(nm / speed / 24)
        special_days += days
        special_mgo_qty += _round2(mgo_rate * days)
        if is_laden:
            laden_special_days += days
        else:
            ballast_special_days += days

    if precision_mode == "display":
        # ADR-023 amendment 2026-09-24 (client): the workbook takes a leg's days as its own rounded
        # figure minus the rounded special-passage days (each cell shown rounded, then subtracted),
        # not "carve the nm out, then round once" — those differ by 0.01 day (laden 4.38 vs 4.37 on
        # the 2026-09-17 case, a few dollars a day). Each leg deducts its own days; rounding is
        # monotonic, so the difference cannot go negative once the nm check above has passed —
        # except a bucket sum rounding up past its leg, hence the floor at 0.
        ballast_days = max(
            0.0,
            _round2(
                _round2(inputs.ballast_distance / inputs.ballast_speed / 24) - ballast_special_days
            ),
        )
        laden_days = max(
            0.0,
            _round2(_round2(inputs.laden_distance / inputs.laden_speed / 24) - laden_special_days),
        )
    else:
        ballast_days = ballast_base_nm / inputs.ballast_speed / 24
        laden_days = laden_base_nm / inputs.laden_speed / 24

    loading_days = _effective_days(
        "loading",
        inputs.loading_mode,
        inputs.loading_days,
        inputs.loading_rate,
        inputs.quantity,
        _round2,
    )
    discharging_days = _effective_days(
        "discharging",
        inputs.discharging_mode,
        inputs.discharging_days,
        inputs.discharging_rate,
        inputs.quantity,
        _round2,
    )
    port_days = _round2(loading_days + discharging_days + inputs.margin_days)
    # ADR-023 (amends ADR-018 S12): total_days is the sum of the already-
    # rounded leg/crossing/port days above — in "display" mode it therefore
    # genuinely differs from the full-precision total, matching a real
    # accountant's Excel reconciliation where each day figure is its own
    # rounded cell.
    total_days = _round2(ballast_days + laden_days + special_days + port_days)

    if total_days <= 0:
        raise ValueError("total_days must be positive")

    hfo_qty = (
        _round2(inputs.hfo_ballast_consumption * ballast_days)
        + _round2(inputs.hfo_laden_consumption * laden_days)
        + _round2(inputs.hfo_port_consumption * port_days)
    )
    mgo_qty = (
        _round2(inputs.mgo_ballast_consumption * ballast_days)
        + _round2(inputs.mgo_laden_consumption * laden_days)
        + _round2(inputs.mgo_port_consumption * port_days)
        + special_mgo_qty
    )
    hfo_cost = _round2(hfo_qty * inputs.hfo_price)
    mgo_cost = _round2(mgo_qty * inputs.mgo_price)
    total_bunker_cost = _round2(hfo_cost + mgo_cost)

    pda_total = _round2(inputs.load_port_pda + inputs.discharge_port_pda)
    other_costs_total = _round2(sum(c.amount for c in inputs.other_costs))
    total_voyage_cost = _round2(
        total_bunker_cost
        + pda_total
        + inputs.loading_cost
        + inputs.discharging_cost
        + inputs.cev_cost
        + inputs.ilohc_cost
        + inputs.lashing_cost
        + other_costs_total
    )

    freight_revenue = _round2(inputs.quantity * inputs.freight_rate)
    commission = _round2(freight_revenue * inputs.commission_rate / 100)
    net_freight_income = _round2(freight_revenue - commission)
    net_voyage_income = _round2(net_freight_income - total_voyage_cost)

    tce = _round2(net_voyage_income / total_days)  # total_days > 0 guaranteed by the raise above

    return TCEResult(
        total_days=total_days,
        loading_days=loading_days,
        discharging_days=discharging_days,
        total_voyage_cost=total_voyage_cost,
        net_voyage_income=net_voyage_income,
        freight_revenue=freight_revenue,
        tce=tce,
    )


def copy_quote_input_validated(inputs: QuoteInput, update: dict) -> QuoteInput:
    """model_copy(update=...) skips validation (Pydantic v2 docs) — re-validate explicitly
    so a perturbed scenario can't silently carry an out-of-range field (e.g. freight_rate <= 0)."""
    return QuoteInput.model_validate({**inputs.model_dump(), **update})


# key -> (display name, zh name, default delta, UI step size, display unit).
# Keys are stable identifiers a caller can target with an override delta —
# decoupled from the display name on purpose, since the display name no
# longer embeds the delta magnitude (the OP edits it separately in the UI).
_RISK_SCENARIO_DEFAULTS: dict[str, tuple[str, str, float, float, str]] = {
    "port_cost": ("Port Cost", "港口使费", 5000.0, 1000.0, "USD"),
    "bunker_price": ("Bunker Price", "燃油价格", 10.0, 50.0, "%"),
    "margin_days": ("Margin Days", "富余天数", 1.0, 0.5, "day"),
    "freight_rate": ("Freight Rate", "单吨运费", -2.0, 0.5, "USD/RT"),
}


def _apply_risk_delta(inputs: QuoteInput, key: str, delta: float) -> QuoteInput:
    if key == "port_cost":
        # v1.1: the delta moves the PDA total, shared in proportion to the two PDAs (evenly
        # when both are 0), so a negative delta never makes one of them negative.
        total = inputs.load_port_pda + inputs.discharge_port_pda
        share = inputs.load_port_pda / total if total > 0 else 0.5
        new_total = total + delta
        return copy_quote_input_validated(
            inputs,
            {"load_port_pda": new_total * share, "discharge_port_pda": new_total * (1 - share)},
        )
    if key == "bunker_price":
        factor = 1 + delta / 100
        return copy_quote_input_validated(
            inputs, {"hfo_price": inputs.hfo_price * factor, "mgo_price": inputs.mgo_price * factor}
        )
    if key == "margin_days":
        return copy_quote_input_validated(inputs, {"margin_days": inputs.margin_days + delta})
    if key == "freight_rate":
        return copy_quote_input_validated(inputs, {"freight_rate": inputs.freight_rate + delta})
    raise ValueError(f"unknown risk scenario key: {key!r}")


def build_risk_scenarios(
    inputs: QuoteInput,
    deltas: dict[str, float] | None = None,
    precision_mode: Literal["full", "display"] = "full",
) -> list[RiskScenarioRow]:
    """E3 · Transform — re-run E2+D1 across Base Case + 4 adjustable perturbations.
    No new decision logic. `deltas` lets a caller override any scenario's default
    perturbation magnitude (e.g. from a UI-editable field) by its stable key.

    `precision_mode` (2026-09-21) is the mode the operator selected for this calculation;
    every row is computed with it, so the risk table reconciles with the Excel workbook the
    same way the TCE panel does. It defaults to "full" for internal callers."""
    from src.backend.d_nodes import (
        analyze_deal,
    )  # local import avoids a circular import with d_nodes

    deltas = deltas or {}
    base_tce = calculate_tce(inputs, precision_mode=precision_mode).tce

    def build_row(
        name: str,
        name_zh: str,
        delta: float | None,
        delta_step: float,
        unit: str,
        row_input: QuoteInput,
    ) -> RiskScenarioRow:
        tce_result = calculate_tce(row_input, precision_mode=precision_mode)
        decision = analyze_deal(tce_result, row_input, precision_mode=precision_mode)
        return RiskScenarioRow(
            scenario_name=name,
            scenario_name_zh=name_zh,
            delta=delta,
            delta_step=delta_step,
            delta_unit=unit,
            estimated_tce=tce_result.tce,
            tce_impact=tce_result.tce - base_tce,
            profit_margin_pct=decision.profit_margin_pct,
            decision=decision.decision,
        )

    rows = [build_row("Base Case", "基准情形", None, 1.0, "", inputs)]
    for key, (name, name_zh, default_delta, step, unit) in _RISK_SCENARIO_DEFAULTS.items():
        delta = deltas.get(key, default_delta)
        rows.append(
            build_row(name, name_zh, delta, step, unit, _apply_risk_delta(inputs, key, delta))
        )
    return rows


def save_quote_record(
    inputs: QuoteInput,
    tce_result: TCEResult,
    decision: DealDecision | None,
    reverse: ReverseQuoteResult | None,
    company_id: int,
    created_at: str | None = None,
) -> bool:
    """E4 · eXecute — persist current state as an audit-trail record, stamped
    with the authenticated session's company_id (ADR-016).

    `decision` is `None` only for the T2.34 historical import (design_backend.md
    §22a): those records have no real `market_benchmark`/`shipowner_asking_tce`
    to judge a deal against, so D1 is never run for them and
    `profit_margin_pct`/`decision`/`deal_decision_snapshot` are stored `NULL`
    rather than computed from placeholder inputs that would misrepresent a
    verdict nobody actually made. Every live `/save` call still always passes a
    real `decision` — this is not a new way for a normal quote to skip D1.

    `created_at` is likewise import-only: `None` (every live call) keeps the
    column's own `DEFAULT now()`; the importer passes each case's real
    historical date so History/dashboards reflect when it actually happened,
    not when it was imported.

    SOFT error strategy: never raises on a DB failure — logs and returns False
    so the frontend can show a non-blocking warning (ADR-008).
    """
    # Local import (not circularity — none exists here) so tests can patch
    # src.backend.db_results.insert_quote_record without a real DB connection.
    from src.backend.db_results import insert_quote_record

    row = {
        "route": inputs.route,
        "cargo_description": inputs.cargo_description,
        "quantity": inputs.quantity,
        "freight_rate": inputs.freight_rate,
        "commission_rate": inputs.commission_rate,
        "market_benchmark": inputs.market_benchmark,
        "shipowner_asking_tce": inputs.shipowner_asking_tce,
        "tce": tce_result.tce,
        "profit_margin_pct": decision.profit_margin_pct if decision is not None else None,
        "decision": decision.decision if decision is not None else None,
        "quote_input_snapshot": inputs.model_dump_json(),
        "deal_decision_snapshot": decision.model_dump_json() if decision is not None else None,
        "reverse_quote_snapshot": reverse.model_dump_json() if reverse is not None else None,
        "company_id": company_id,
        "created_at": created_at,
    }

    try:
        database_url = os.environ["DATABASE_URL"]
        insert_quote_record(database_url, row)
        return True
    except Exception:
        logger.exception("Failed to save quote record")
        return False


def query_quote_history(start_ym: str, end_ym: str, company_id: int) -> list[dict]:
    """E5 · Extract — fetch quote_records in [start_ym, end_ym] from the DB,
    scoped to company_id (ADR-016).

    SOFT error strategy: returns [] on any failure so the UI can show a
    non-blocking message instead of crashing.
    """
    from src.backend.db_results import query_quote_history as _db_query

    try:
        database_url = os.environ["DATABASE_URL"]
        return upgrade_quote_rows(_db_query(database_url, start_ym, end_ym, company_id))
    except Exception:
        logger.exception("Failed to query quote history")
        return []


def search_quote_records(
    company_id: int,
    route: str = "",
    cargo_description: str = "",
    vessel_name: str = "",
    vessel_dwt: int = 0,
) -> list[dict]:
    """E6 · Extract — keyword search of saved quote records, scoped to
    company_id (ADR-016 — silent, non-optional tenant filter).

    SOFT error strategy: returns [] on any failure so the UI shows a
    non-blocking message instead of crashing.
    """
    from src.backend.db_results import search_quote_records as _db_search

    try:
        database_url = os.environ["DATABASE_URL"]
        return upgrade_quote_rows(
            _db_search(database_url, company_id, route, cargo_description, vessel_name, vessel_dwt)
        )
    except Exception:
        logger.exception("Failed to search quote records")
        return []


def register_company(reg_input: RegisterInput) -> RegisterResult:
    """E8 · eXecute — self-service signup (P5, PT-11): create a new tenant
    (companies row) + its first login (users row). Duplicate company name/
    email is an expected rejection returned by db_results.register_company,
    not an exception — only genuine DB connectivity failures hit the SOFT
    except-branch below (ADR-016).
    """
    import bcrypt

    from src.backend.db_results import register_company as _db_register

    try:
        database_url = os.environ["DATABASE_URL"]
        password_hash = bcrypt.hashpw(reg_input.password.encode("utf-8"), bcrypt.gensalt()).decode(
            "utf-8"
        )
        result = _db_register(
            database_url, reg_input.company_name, reg_input.admin_email, password_hash
        )
        return RegisterResult(**result)
    except Exception:
        logger.exception("Failed to register company")
        return RegisterResult(
            success=False,
            company_id=None,
            user_id=None,
            error_message="Registration failed, please try again",
        )


def get_user_by_email(email: str) -> dict | None:
    """E9 · Extract — fetch a users row (with password_hash) by email, for
    D3 to authenticate against (ADR-016).

    SOFT error strategy: returns None on any failure — indistinguishable
    from "no such user," by design (see D3's anti-enumeration behavior).
    """
    from src.backend.db_results import get_user_by_email as _db_get_user

    try:
        database_url = os.environ["DATABASE_URL"]
        return _db_get_user(database_url, email)
    except Exception:
        logger.exception("Failed to look up user by email")
        return None


def save_draft(user_id: int, company_id: int, raw_input_json: dict) -> bool:
    """E12 · eXecute — save an incomplete, unvalidated input snapshot so the
    OP can resume later (PT-14). Deliberately bypasses collect_quote_inputs
    (E1)'s Pydantic validation entirely — a draft's whole purpose is to hold
    state that isn't complete or valid yet.

    **[AMENDMENT 2026-08-03, ADR-021, PT-17]** Every call creates a **new**
    draft row — no more upsert-overwrite (was "at most one draft per user,"
    ADR-019). `route`/`cargo_description` are denormalized out of
    `raw_input_json` for the search/history entry points (E15/E16).

    SOFT error strategy: DB failures are caught, logged, non-blocking.
    """
    from src.backend.db_results import save_draft as _db_save_draft

    try:
        database_url = os.environ["DATABASE_URL"]
        _db_save_draft(database_url, user_id, company_id, raw_input_json)
        return True
    except Exception:
        logger.exception("Failed to save draft")
        return False


def get_draft(user_id: int) -> dict | None:
    """E13 · Extract — fetch this user's own draft, if one exists (PT-14).

    **[AMENDMENT 2026-08-03, ADR-021, PT-17]** With multiple drafts now
    possible, returns the *most recent* one — still exactly one row, same
    "Resume Draft" banner behavior as before. Browsing/loading an *older*
    draft is E15/E16's job (via Search/History), not this node's.

    SOFT error strategy: returns None on any failure — indistinguishable
    from "no draft exists."
    """
    from src.backend.db_results import get_draft as _db_get_draft

    try:
        database_url = os.environ["DATABASE_URL"]
        return upgrade_legacy_snapshot(_db_get_draft(database_url, user_id))
    except Exception:
        logger.exception("Failed to fetch draft")
        return None


def get_draft_updated_at(user_id: int):
    """2026-07-31 — companion to E13, not a renumbered node itself (same
    treatment as other small session/display-only helpers in this file):
    when was the current draft last saved, for the Resume Draft banner's
    timestamp. SOFT error strategy: returns None on any failure — the
    banner just omits the timestamp rather than blocking on it."""
    from src.backend.db_results import get_draft_updated_at as _db_get_draft_updated_at

    try:
        database_url = os.environ["DATABASE_URL"]
        return _db_get_draft_updated_at(database_url, user_id)
    except Exception:
        logger.exception("Failed to fetch draft timestamp")
        return None


def search_draft_records(
    user_id: int,
    route: str = "",
    cargo_description: str = "",
    vessel_name: str = "",
    vessel_dwt: int = 0,
) -> list[dict]:
    """E15 · Extract — keyword search of this OP's own drafts (ADR-021,
    PT-17), scoped by `user_id` — a draft is personal, not company-wide
    like a saved quote (E6). Mirrors E6's filter shape exactly.

    SOFT error strategy: returns [] on any failure so the UI shows a
    non-blocking message instead of crashing.
    """
    from src.backend.db_results import search_draft_records as _db_search_drafts

    try:
        database_url = os.environ["DATABASE_URL"]
        return upgrade_draft_rows(
            _db_search_drafts(
                database_url, user_id, route, cargo_description, vessel_name, vessel_dwt
            )
        )
    except Exception:
        logger.exception("Failed to search draft records")
        return []


def query_draft_history(start_ym: str, end_ym: str, user_id: int) -> list[dict]:
    """E16 · Extract — fetch this OP's own drafts in [start_ym, end_ym]
    (ADR-021, PT-17), scoped by `user_id` like E15. Mirrors E5's shape.

    SOFT error strategy: returns [] on any failure so the UI can show a
    non-blocking message instead of crashing.
    """
    from src.backend.db_results import query_draft_history as _db_query_drafts

    try:
        database_url = os.environ["DATABASE_URL"]
        return upgrade_draft_rows(_db_query_drafts(database_url, start_ym, end_ym, user_id))
    except Exception:
        logger.exception("Failed to query draft history")
        return []


def delete_draft_records(record_ids: list[int], user_id: int) -> int:
    """E17 · eXecute — permanently remove one or more of this OP's own
    drafts (ADR-021 round 2, PT-17), for the History tab's now-unified
    Delete button. Unlike E14, this is a HARD delete at the SQL level (a
    real DELETE, not a deleted_at flag) — a draft is personal in-progress
    scratch work with no audit/compliance retention need. user_id is
    enforced at the query level (db_results.delete_draft_records), not
    trusted from the caller.

    SOFT error strategy: DB failure returns 0, logged, non-blocking.
    """
    from src.backend.db_results import delete_draft_records as _db_delete_drafts

    try:
        database_url = os.environ["DATABASE_URL"]
        return _db_delete_drafts(database_url, record_ids, user_id)
    except Exception:
        logger.exception("Failed to delete draft records")
        return 0


def get_company_routes(company_id: int) -> list[str]:
    """E10 · Extract — this company's own previously-saved routes, for the
    Route field's option list (PT-12). A brand-new company simply gets []
    back — no global/shared list, per ADR-017.

    SOFT error strategy: DB failures return [] (dropdown just shows no
    options rather than crashing).
    """
    from src.backend.db_results import get_company_routes as _db_get_routes

    try:
        database_url = os.environ["DATABASE_URL"]
        return _db_get_routes(database_url, company_id)
    except Exception:
        logger.exception("Failed to fetch company routes")
        return []


def remember_company_route(company_id: int, route: str) -> bool:
    """E11 · eXecute — upsert a route into this company's own remembered
    list; fired only as a side effect of a successful Save Quote (E4),
    never standalone (ADR-017).

    SOFT error strategy: a failed remember must never fail the Save Quote
    action it's attached to.
    """
    from src.backend.db_results import remember_company_route as _db_remember

    try:
        database_url = os.environ["DATABASE_URL"]
        _db_remember(database_url, company_id, route)
        return True
    except Exception:
        logger.exception("Failed to remember company route")
        return False


def get_company_precision_mode(company_id: int) -> Literal["full", "display"]:
    """Hydrate the authenticated session's precision mode right after
    login/register (ADR-018). Not a numbered DEP node — see
    db_results.get_company_precision_mode's docstring.

    SOFT error strategy: any failure (DB down, missing row) falls back to
    "full" — identical to pre-ADR-018 behavior, never blocks login.
    """
    from src.backend.db_results import get_company_precision_mode as _db_get_mode

    try:
        database_url = os.environ["DATABASE_URL"]
        mode = _db_get_mode(database_url, company_id)
        return mode if mode in ("full", "display") else "full"
    except Exception:
        logger.exception("Failed to fetch company precision mode")
        return "full"


def get_company_name(company_id: int) -> str | None:
    """2026-07-31 — hydrate the authenticated session's company name right
    after login/register (account menu now shows this instead of the
    user's email). Not a numbered DEP node — same treatment as
    get_company_precision_mode above.

    SOFT error strategy: returns None on any failure — caller falls back
    to the email, never blocks login.
    """
    from src.backend.db_results import get_company_name as _db_get_company_name

    try:
        database_url = os.environ["DATABASE_URL"]
        return _db_get_company_name(database_url, company_id)
    except Exception:
        logger.exception("Failed to fetch company name")
        return None


def soft_delete_quote_records(record_ids: list[int], company_id: int) -> int:
    """E14 · eXecute — mark one or more of this company's own records as
    deleted (never a real DELETE, PT-15/ADR-020). company_id is enforced at
    the query level (db_results.soft_delete_quote_records), not trusted from
    the caller.

    SOFT error strategy: DB failure returns 0, logged, non-blocking.
    """
    from src.backend.db_results import soft_delete_quote_records as _db_soft_delete

    try:
        database_url = os.environ["DATABASE_URL"]
        return _db_soft_delete(database_url, record_ids, company_id)
    except Exception:
        logger.exception("Failed to soft-delete quote records")
        return 0


def get_bunker_price(port: str) -> BunkerPriceResult | None:
    """E7 · Extract — latest daily-scraped fuel price for a bunkering port.

    SOFT error strategy: returns None on any failure (DB down, port not
    found) so the frontend leaves the price field untouched instead of
    crashing or clobbering a manually-typed value.
    """
    from src.backend.db_results import get_bunker_price as _db_get_bunker_price

    try:
        database_url = os.environ["DATABASE_URL"]
        row = _db_get_bunker_price(database_url, port)
        return BunkerPriceResult(**row) if row is not None else None
    except Exception:
        logger.exception("Failed to get bunker price for port=%s", port)
        return None


def get_bunker_price_history(port: str) -> list[dict]:
    """E24 · Extract — every scraped reference-price row for one port (design_backend.md
    §24). SOFT — [] on any failure."""
    from src.backend.db_results import get_bunker_price_history as _db_get_bunker_price_history

    try:
        database_url = os.environ["DATABASE_URL"]
        return _db_get_bunker_price_history(database_url, port)
    except Exception:
        logger.exception("Failed to get bunker price history for port=%s", port)
        return []


def get_vessel_type_stats(company_id: int) -> list[dict]:
    """E25 · Extract — dashboard 2 (design_backend.md §24): one row per saved quote
    (vessel_dwt, tce, profit_margin_pct). SOFT — [] on any failure."""
    from src.backend.db_results import get_vessel_type_stats as _db_get_vessel_type_stats

    try:
        database_url = os.environ["DATABASE_URL"]
        return _db_get_vessel_type_stats(database_url, company_id)
    except Exception:
        logger.exception("Failed to get vessel type stats for company_id=%s", company_id)
        return []


def get_freight_trend(company_id: int) -> list[dict]:
    """E26 · Extract — dashboard 4 (design_backend.md §24): one row per saved quote
    (quote_date, cargo_description, freight_rate). SOFT — [] on any failure."""
    from src.backend.db_results import get_freight_trend as _db_get_freight_trend

    try:
        database_url = os.environ["DATABASE_URL"]
        return _db_get_freight_trend(database_url, company_id)
    except Exception:
        logger.exception("Failed to get freight trend for company_id=%s", company_id)
        return []


def get_port_cost_stats(company_id: int) -> list[dict]:
    """E27 · Extract — dashboard 5 (design_backend.md §24): one row per saved quote
    (load_port, load_port_pda, discharge_port, discharge_port_pda). SOFT — [] on any
    failure."""
    from src.backend.db_results import get_port_cost_stats as _db_get_port_cost_stats

    try:
        database_url = os.environ["DATABASE_URL"]
        return _db_get_port_cost_stats(database_url, company_id)
    except Exception:
        logger.exception("Failed to get port cost stats for company_id=%s", company_id)
        return []
