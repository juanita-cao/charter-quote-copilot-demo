"""
Dashboard routes — T2.35 (design_backend.md §24). One route per dashboard, built one
at a time (bunker price first); wraps E24/E25 with zero logic changes, same discipline
as routers/company.py.

Gated behind DASHBOARDS_ELIGIBLE_COMPANY_IDS (design_backend.md §24, client-confirmed
2026-09-23): dashboards are a planned *paid* feature, not on by default for every
company — same eligibility-gate mechanism as vessel-consumption/custom-ports/distance
(routers/company.py), but its own list, since paid-feature access and "is this WON
HENG's own private data" are independent questions. An ineligible caller gets [] from
every route here, same as an eligible caller with no data yet — it never reveals
whether the empty result means "not entitled" or "entitled, nothing recorded".
"""

from __future__ import annotations

from fastapi import APIRouter, Depends

from src.backend.auth.dependencies import get_current_company
from src.backend.configs.feature_flags import DASHBOARDS_ELIGIBLE_COMPANY_IDS
from src.backend.e_nodes import (
    get_bunker_price_history,
    get_freight_trend,
    get_port_cost_stats,
    get_vessel_type_stats,
)
from src.backend.schemas import CurrentUser

router = APIRouter(prefix="/api/v1/dashboards", tags=["dashboards"])


@router.get("/bunker-price")
def get_bunker_price_dashboard(port: str, current_user: CurrentUser = Depends(get_current_company)):
    """The public daily-scraped market price for the selected port (design_backend.md
    §24). A second "actual price paid" series (from the company's own saved quotes) was
    built and then dropped at the client's request — the price an operator types into a
    quote is itself usually copied from this same scraped reference, so it wasn't an
    independent signal. SOFT — [] on failure, missing data, or ineligibility."""
    if current_user.company_id not in DASHBOARDS_ELIGIBLE_COMPANY_IDS:
        return []
    return get_bunker_price_history(port)


@router.get("/vessel-type")
def get_vessel_type_dashboard(current_user: CurrentUser = Depends(get_current_company)):
    """One row per saved quote (quote_date, vessel_dwt, tce, profit_margin_pct),
    company-scoped (design_backend.md §24) — TCE trend over time, split by DWT band.
    Raw, not pre-bucketed/aggregated — the frontend buckets against `DWT_TIERS`, the one
    place that band list already lives. SOFT — [] on failure or ineligibility."""
    if current_user.company_id not in DASHBOARDS_ELIGIBLE_COMPANY_IDS:
        return []
    return get_vessel_type_stats(current_user.company_id)


@router.get("/freight-trend")
def get_freight_trend_dashboard(current_user: CurrentUser = Depends(get_current_company)):
    """One row per saved quote (quote_date, cargo_description, freight_rate),
    company-scoped (design_backend.md §24) — freight-rate trend over time, split by
    cargo. Raw — the frontend matches `cargo_description` against PT-18's `cargo.json`
    (the standard cargo list) rather than a second Python copy of it. SOFT — [] on
    failure or ineligibility."""
    if current_user.company_id not in DASHBOARDS_ELIGIBLE_COMPANY_IDS:
        return []
    return get_freight_trend(current_user.company_id)


@router.get("/port-cost")
def get_port_cost_dashboard(current_user: CurrentUser = Depends(get_current_company)):
    """One row per saved quote (load_port, load_port_pda, discharge_port,
    discharge_port_pda), company-scoped (design_backend.md §24) — port-cost comparison.
    Raw — the frontend flattens each row into up to two (port, pda) observations and
    averages per port. SOFT — [] on failure or ineligibility."""
    if current_user.company_id not in DASHBOARDS_ELIGIBLE_COMPANY_IDS:
        return []
    return get_port_cost_stats(current_user.company_id)
