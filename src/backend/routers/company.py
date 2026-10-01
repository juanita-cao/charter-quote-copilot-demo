"""
Company routes — T2.18 (design_backend.md §8). Wraps E10 with zero logic
changes; same discipline as routers/auth.py/quotes.py.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends

from src.backend.auth.dependencies import get_current_company
from src.backend.configs.custom_ports import CUSTOM_PORTS
from src.backend.configs.feature_flags import (
    CUSTOM_PORT_ELIGIBLE_COMPANY_IDS,
    DISTANCE_HISTORY_ELIGIBLE_COMPANY_IDS,
    VESSEL_CONSUMPTION_ELIGIBLE_COMPANY_IDS,
)
from src.backend.configs.route_distances import lookup_distance
from src.backend.configs.route_estimate import estimate_distance
from src.backend.configs.vessel_consumption import lookup_vessel_consumption
from src.backend.e_nodes import get_company_routes
from src.backend.schemas import CurrentUser, VesselConsumptionProfile

router = APIRouter(prefix="/api/v1/company", tags=["company"])


@router.get("/routes", response_model=list[str])
def get_routes(current_user: CurrentUser = Depends(get_current_company)):
    """E10 (design_backend.md §8). SOFT — returns [] on any failure."""
    return get_company_routes(current_user.company_id)


@router.get("/vessel-consumption", response_model=VesselConsumptionProfile | None)
def get_vessel_consumption(
    dwt: int, has_crane: bool = False, current_user: CurrentUser = Depends(get_current_company)
):
    """DWT -> speed/consumption auto-fill (PT-08, T2.25). The table is one
    client's real fleet data, so eligibility is decided here, server-side, by
    company_id allow-list. Ineligible callers and unmatched DWTs both get
    `null` — the caller can't tell which reason applied."""
    if current_user.company_id not in VESSEL_CONSUMPTION_ELIGIBLE_COMPANY_IDS:
        return None
    return lookup_vessel_consumption(dwt, has_crane)


@router.get("/custom-ports", response_model=list[str])
def get_custom_ports(current_user: CurrentUser = Depends(get_current_company)):
    """Ports the client trades to/from with no official UN/LOCODE entry
    (design_problem.md PT-18 follow-up). Same eligibility discipline as
    vessel-consumption: an ineligible caller gets [], not an error."""
    if current_user.company_id not in CUSTOM_PORT_ELIGIBLE_COMPANY_IDS:
        return []
    return list(CUSTOM_PORTS)


@router.get("/distance")
def get_distance(a: str, b: str, current_user: CurrentUser = Depends(get_current_company)):
    """Port-pair distance (design_backend.md §17, PT-21): the client's own history first
    (Phase 1, §17.1) — gated the same as custom-ports / vessel-consumption, since that table is
    one client's real trading data — then a free `searoute` estimate (Phase 2, §17.5) for
    everyone, history or not, since that source is public and not tenant-specific. `null` only
    when neither source has an answer; the caller cannot tell which source did (or whether
    eligibility, rather than missing data, is why history was skipped)."""
    if current_user.company_id in DISTANCE_HISTORY_ELIGIBLE_COMPANY_IDS:
        history = lookup_distance(a, b)
        if history is not None:
            return {"nm": history["nm"], "samples": history["samples"], "source": "history"}
    estimate = estimate_distance(a, b)
    if estimate is not None:
        return {"nm": estimate, "samples": 0, "source": "estimate"}
    return None
