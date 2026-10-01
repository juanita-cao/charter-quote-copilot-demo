"""POST /api/v1/export — T2.22 (design_backend.md §8): E22 -> E23, plus one SOFT
`excel_export` audit row per exported record (§11)."""

from __future__ import annotations

import logging
import os
import re
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel, field_validator

from src.backend.auth.audit import write_audit_log_soft
from src.backend.auth.dependencies import get_current_company
from src.backend.db_results import fetch_records_for_export
from src.backend.excel_export import build_history_workbook
from src.backend.schemas import CurrentUser

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/export", tags=["export"])

XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
MAX_KEYS = 100
_KEY = re.compile(r"^([qd])([1-9][0-9]*)$")


class ExportRequest(BaseModel):
    """`q{id}` / `d{id}` keys, the History convention."""

    record_keys: list[str]

    @field_validator("record_keys")
    @classmethod
    def _valid_keys(cls, keys: list[str]) -> list[str]:
        if not 1 <= len(keys) <= MAX_KEYS:
            raise ValueError(f"select between 1 and {MAX_KEYS} records")
        if any(_KEY.match(k) is None for k in keys):
            raise ValueError("record keys look like q12 or d7")
        return keys


@router.post("")
def export_records(body: ExportRequest, current_user: CurrentUser = Depends(get_current_company)):
    quote_ids: list[int] = []
    draft_ids: list[int] = []
    for key in dict.fromkeys(body.record_keys):
        m = _KEY.match(key)
        (quote_ids if m.group(1) == "q" else draft_ids).append(int(m.group(2)))  # type: ignore[union-attr]

    records = fetch_records_for_export(
        os.environ["DATABASE_URL"],
        quote_ids,
        draft_ids,
        current_user.company_id,
        current_user.user_id,
    )
    if not records:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No matching records")

    content = build_history_workbook(records)

    for rec in records:
        try:
            write_audit_log_soft(
                user_id=current_user.user_id,
                company_id=current_user.company_id,
                action="excel_export",
                target_type="quote_drafts" if rec["_kind"] == "draft" else "quote_records",
                target_id=rec["id"],
            )
        except Exception:
            logger.exception("excel_export audit write failed (SOFT)")

    return Response(
        content=content,
        media_type=XLSX,
        headers={
            "Content-Disposition": f'attachment; filename="history_{date.today().isoformat()}.xlsx"'
        },
    )
