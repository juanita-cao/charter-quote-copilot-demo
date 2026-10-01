"""
Quotes routes — T2.11+ (design_backend.md §8). Wraps E1/E2/D1/... with zero
logic changes; this file is the thin adapter layer, same discipline as
routers/auth.py.
"""

from __future__ import annotations

import os
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import ValidationError

from src.backend.auth.dependencies import get_current_company
from src.backend.d_nodes import analyze_deal, reverse_quote
from src.backend.db.audit import soft_delete_quote_records_with_audit
from src.backend.e_nodes import (
    build_risk_scenarios,
    calculate_tce,
    collect_quote_inputs,
    get_bunker_price,
    get_company_precision_mode,
    query_quote_history,
    remember_company_route,
    save_quote_record,
    search_quote_records,
)
from src.backend.quotation_sandbox import run_quotation_sandbox
from src.backend.schemas import (
    BulkDeleteRequest,
    BunkerPriceResult,
    CurrentUser,
    QuotationSandboxResult,
    QuoteCalculationResult,
    ReverseQuoteResult,
    RiskScenarioRow,
)

router = APIRouter(prefix="/api/v1/quotes", tags=["quotes"])

_PRECISION_MODES = ("full", "display")


def _resolve_precision_mode(body: dict[str, Any], company_id: int) -> str:
    """The operator's choice for THIS calculation (client requirement, 2026-09-21), popped from
    the raw body before E1 like `target_tce`; absent or JSON null -> the company's own setting.
    Anything else is a 422, never a silent fallback."""
    chosen = body.pop("precision_mode", None)
    if chosen is None:
        return get_company_precision_mode(company_id)
    if chosen not in _PRECISION_MODES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="precision_mode must be 'full' or 'display'",
        )
    return chosen

# Not nested under /api/v1/quotes — E7's own path is a top-level sibling
# (design_backend.md §8), but there's no dedicated router file for it in the
# file tree (§7.2), and it exists to auto-fill the quote form, so it lives
# here as a second, unprefixed router rather than inventing a new file.
bunker_router = APIRouter(prefix="/api/v1", tags=["bunker"])


@router.post("/calculate", response_model=QuoteCalculationResult)
def calculate(body: dict[str, Any], current_user: CurrentUser = Depends(get_current_company)):
    """E1 -> E2 + D1 (design_backend.md §8). Live-preview loop, no DB write.
    `precision_mode` is the authenticated company's own setting (E2's
    docstring / ADR-018), resolved here — never accepted from the request
    body, so a client can't request a precision mode its company hasn't
    configured."""
    precision_mode = _resolve_precision_mode(body, current_user.company_id)

    try:
        inputs = collect_quote_inputs(raw_ui_state=body)
    except ValidationError as e:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(e)
        ) from None

    try:
        tce_result = calculate_tce(inputs, precision_mode=precision_mode)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(e)
        ) from None

    decision = analyze_deal(tce_result, inputs, precision_mode=precision_mode)
    return QuoteCalculationResult(tce_result=tce_result, deal_decision=decision)


@router.post("/reverse-quote", response_model=ReverseQuoteResult)
def calculate_reverse_quote(
    body: dict[str, Any], current_user: CurrentUser = Depends(get_current_company)
):
    """D2 (design_backend.md §8). `target_tce` has no place in QuoteInput's
    own schema, so it's extracted from the raw body before E1 validates the
    rest — same treatment as `precision_mode` on /calculate: read from the
    request body here, never accepted as a QuoteInput field."""
    precision_mode = _resolve_precision_mode(body, current_user.company_id)

    target_tce_raw = body.pop("target_tce", None)
    try:
        target_tce = float(target_tce_raw)
    except (TypeError, ValueError):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="target_tce is required and must be a number",
        ) from None

    try:
        inputs = collect_quote_inputs(raw_ui_state=body)
    except ValidationError as e:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(e)
        ) from None

    try:
        return reverse_quote(inputs, target_tce, precision_mode=precision_mode)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(e)
        ) from None


@router.post("/risk-scenarios", response_model=list[RiskScenarioRow])
def calculate_risk_scenarios(
    body: dict[str, Any], current_user: CurrentUser = Depends(get_current_company)
):
    """E3 (design_backend.md §8). Follows the selected precision like every other calculating
    route (2026-09-21): the operator's `precision_mode` if sent, else the company's setting.
    `deltas` has no place in QuoteInput's own schema, same extraction treatment as
    reverse-quote's `target_tce`."""
    precision_mode = _resolve_precision_mode(body, current_user.company_id)
    deltas = body.pop("deltas", None)
    if deltas is not None and not isinstance(deltas, dict):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="deltas must be an object of scenario_key -> number",
        )

    try:
        inputs = collect_quote_inputs(raw_ui_state=body)
    except ValidationError as e:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(e)
        ) from None

    try:
        return build_risk_scenarios(inputs, deltas, precision_mode=precision_mode)
    except (TypeError, ValueError) as e:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(e)
        ) from None


@router.post("")
def save_quote(body: dict[str, Any], current_user: CurrentUser = Depends(get_current_company)):
    """E4 (+ E11 side effect) — design_backend.md §8/§8 T2.14 note. Recomputes
    tce_result/decision(/reverse) server-side from the raw QuoteInput via the
    same E1->E2->D1(+D2) pipeline as /calculate and /reverse-quote, rather
    than accepting a client-submitted TCEResult/DealDecision snapshot —
    quote_records is the audit trail, so what it records must be something
    the server itself computed, never something an HTTP client could
    fabricate (a risk /calculate's own live-preview loop doesn't carry, since
    nothing there is persisted). E11 fires only when E4 returns True
    (ADR-017) — both are SOFT, neither ever raises."""
    precision_mode = _resolve_precision_mode(body, current_user.company_id)
    target_tce_raw = body.pop("target_tce", None)

    try:
        inputs = collect_quote_inputs(raw_ui_state=body)
    except ValidationError as e:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(e)
        ) from None

    try:
        tce_result = calculate_tce(inputs, precision_mode=precision_mode)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(e)
        ) from None

    decision = analyze_deal(tce_result, inputs, precision_mode=precision_mode)

    reverse = None
    if target_tce_raw is not None:
        try:
            target_tce = float(target_tce_raw)
        except (TypeError, ValueError):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="target_tce must be a number",
            ) from None
        try:
            reverse = reverse_quote(inputs, target_tce, precision_mode=precision_mode)
        except ValueError as e:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(e)
            ) from None

    success = save_quote_record(inputs, tce_result, decision, reverse, current_user.company_id)
    if success:
        remember_company_route(current_user.company_id, inputs.route)
    return {"success": success}


@router.get("")
def get_quote_history(
    start_ym: str, end_ym: str, current_user: CurrentUser = Depends(get_current_company)
):
    """E5 (design_backend.md §8). SOFT — returns [] on any failure,
    including a malformed start_ym/end_ym (e_nodes.py E5 docstring), so
    there is no separate validation/error-mapping step here."""
    return query_quote_history(start_ym, end_ym, current_user.company_id)


@router.get("/search")
def search_quotes(
    route: str = "",
    cargo_description: str = "",
    vessel_name: str = "",
    vessel_dwt: int = 0,
    current_user: CurrentUser = Depends(get_current_company),
):
    """E6 (design_backend.md §8). SOFT — returns [] on any failure."""
    return search_quote_records(
        current_user.company_id, route, cargo_description, vessel_name, vessel_dwt
    )


@router.post("/bulk-delete")
def bulk_delete_quotes(
    body: BulkDeleteRequest, current_user: CurrentUser = Depends(get_current_company)
):
    """E14, HARD/audited variant (design_backend.md §11, §8 T2.16 note) — the
    soft-delete UPDATE and its `audit_log` INSERT are one transaction
    (`db/audit.py::soft_delete_quote_records_with_audit`), not e_nodes.py's
    own inherited (SOFT, un-audited) E14. Unlike E14's own SOFT contract, a
    DB failure here is never swallowed — it propagates as a `500`."""
    database_url = os.environ["DATABASE_URL"]
    deleted_count = soft_delete_quote_records_with_audit(
        database_url, body.record_ids, current_user.company_id, current_user.user_id
    )
    return {"deleted_count": deleted_count}


@bunker_router.get("/bunker-price", response_model=BunkerPriceResult | None)
def get_bunker_price_route(port: str, _current_user: CurrentUser = Depends(get_current_company)):
    """E7 (design_backend.md §8). SOFT — returns None on any failure
    (DB down, port not found), never a 4xx/5xx for that."""
    return get_bunker_price(port)


def _optional_number(body: dict[str, Any], key: str) -> float | None:
    """Pops `key` from the raw body; absent or JSON null -> None, non-numeric -> 422."""
    raw = body.pop(key, None)
    if raw is None:
        return None
    try:
        return float(raw)
    except (TypeError, ValueError):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=f"{key} must be a number",
        ) from None


@router.post("/sandbox", response_model=QuotationSandboxResult)
def quotation_sandbox(
    body: dict[str, Any], current_user: CurrentUser = Depends(get_current_company)
):
    """Quotation Side sandbox (design_frontend.md §5.1 GAP-4, T2.26; ADR-009).
    The direction knobs have no place in QuoteInput's schema, so — like
    reverse-quote's `target_tce` — they are popped from the raw body before E1
    validates the rest. Exactly one of `target_tce` / `sandbox_freight_rate`
    must be given; both-or-neither is a client-input `422`, as is any ValueError
    from E2/D2 underneath."""
    precision_mode = _resolve_precision_mode(body, current_user.company_id)

    target_tce = _optional_number(body, "target_tce")
    sandbox_freight_rate = _optional_number(body, "sandbox_freight_rate")
    sandbox_shipowner_ask = _optional_number(body, "sandbox_shipowner_ask")

    try:
        inputs = collect_quote_inputs(raw_ui_state=body)
    except ValidationError as e:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(e)
        ) from None

    try:
        return run_quotation_sandbox(
            inputs,
            target_tce=target_tce,
            sandbox_freight_rate=sandbox_freight_rate,
            sandbox_shipowner_ask=sandbox_shipowner_ask,
            precision_mode=precision_mode,
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(e)
        ) from None
