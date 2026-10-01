"""
Drafts routes — T2.19 (design_backend.md §8). Wraps E12/E13/E15/E16/E17 with
zero logic changes; same discipline as routers/auth.py/quotes.py.
"""

from __future__ import annotations

import os
from typing import Any

from fastapi import APIRouter, Depends

from src.backend.auth.dependencies import get_current_company
from src.backend.db.audit import delete_draft_records_with_audit
from src.backend.e_nodes import (
    get_draft,
    get_draft_updated_at,
    query_draft_history,
    save_draft,
    search_draft_records,
)
from src.backend.schemas import BulkDeleteRequest, CurrentUser

router = APIRouter(prefix="/api/v1/drafts", tags=["drafts"])


@router.post("")
def create_draft(
    raw_input_json: dict[str, Any], current_user: CurrentUser = Depends(get_current_company)
):
    """E12 (design_backend.md §8). Deliberately bypasses E1's validation
    (e_nodes.py E12 docstring) — a draft's whole purpose is to hold state
    that isn't complete or valid yet, so this route does not call
    collect_quote_inputs. SOFT — {"success": False} on any DB failure, never
    a 4xx/5xx for that."""
    success = save_draft(current_user.user_id, current_user.company_id, raw_input_json)
    return {"success": success}


@router.get("/latest")
def get_latest_draft(current_user: CurrentUser = Depends(get_current_company)):
    """E13 + its companion get_draft_updated_at (design_backend.md §8,
    e_nodes.py E13 docstring — "not a renumbered node itself"), always
    called together to build the Resume Draft banner (mirrors predecessor's
    app_streamlit.py). Both SOFT — None/[] on failure, never a 4xx/5xx."""
    return {
        "draft": get_draft(current_user.user_id),
        "updated_at": get_draft_updated_at(current_user.user_id),
    }


@router.get("/search")
def search_drafts(
    route: str = "",
    cargo_description: str = "",
    vessel_name: str = "",
    vessel_dwt: int = 0,
    current_user: CurrentUser = Depends(get_current_company),
):
    """E15 (design_backend.md §8) — mirrors E6's route shape, scoped by
    user_id, not company_id (a draft is personal, ADR-021/PT-17). SOFT."""
    return search_draft_records(
        current_user.user_id, route, cargo_description, vessel_name, vessel_dwt
    )


@router.get("")
def get_draft_history(
    start_ym: str, end_ym: str, current_user: CurrentUser = Depends(get_current_company)
):
    """E16 (design_backend.md §8) — mirrors E5's route shape, scoped by
    user_id, not company_id. SOFT."""
    return query_draft_history(start_ym, end_ym, current_user.user_id)


@router.post("/bulk-delete")
def bulk_delete_drafts(
    body: BulkDeleteRequest, current_user: CurrentUser = Depends(get_current_company)
):
    """E17, HARD/audited variant (design_backend.md §11, §8 T2.19 note) —
    the hard-DELETE and its `audit_log` INSERT are one transaction
    (`db/audit.py::delete_draft_records_with_audit`), not e_nodes.py's own
    inherited (SOFT, un-audited) E17. Unlike E17's own SOFT contract, a DB
    failure here is never swallowed — it propagates as a `500`."""
    database_url = os.environ["DATABASE_URL"]
    deleted_count = delete_draft_records_with_audit(
        database_url, body.record_ids, current_user.user_id, current_user.company_id
    )
    return {"deleted_count": deleted_count}
