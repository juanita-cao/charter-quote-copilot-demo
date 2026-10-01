"""Legacy record upgrade (design_backend.md §15.3).

Records saved before v1.1 hold one `port_cost` (the PDA total). v1.1 has a load-port and a
discharge-port PDA.
The client's rule (2026-09-21): the total is split evenly, and the two halves always add up to the
original
total. One pure function does it, so nothing else in the system needs to know the old shape:

- E1 (QuoteInput's before-validator): a request that still sends `port_cost`;
- the readers E5 / E6 / E13 / E15 / E16 on the way out, so History, search, the Resume banner and
  "Start from a previous quote" load old records without any client-side rule;
- E22 / E23 (the Excel export).

An upgraded dict carries `_pda_split_estimated: True` (output only; E1 ignores it) so the UI can
say the split
is an estimate.
"""

from __future__ import annotations

import json
from typing import Any

from src.backend.rounding import excel_round

MARKER = "_pda_split_estimated"


def _is_number(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def upgrade_legacy_snapshot(raw: Any) -> Any:
    """Return `raw` with `port_cost` replaced by the two PDA halves. Pure and idempotent; anything
    that is not a
    dict, has no `port_cost`, or has a `port_cost` that is not a number is returned unchanged (E1
    then rejects it)."""
    if not isinstance(raw, dict) or "port_cost" not in raw:
        return raw
    out = {k: v for k, v in raw.items() if k != "port_cost"}
    if "load_port_pda" in raw or "discharge_port_pda" in raw:
        return out  # the new fields win; the stale total is dropped, nothing was split
    total = raw["port_cost"]
    if not _is_number(total):
        return raw
    load = excel_round(total / 2)
    out["load_port_pda"] = load
    out["discharge_port_pda"] = excel_round(total - load)
    out[MARKER] = True
    return out


def _upgrade_field(row: dict, key: str) -> dict:
    value = row.get(key)
    if isinstance(value, str):
        try:
            value = json.loads(value)
        except ValueError:
            return row
    if not isinstance(value, dict):
        return row
    return {**row, key: upgrade_legacy_snapshot(value)}


def upgrade_quote_rows(rows: list[dict]) -> list[dict]:
    return [_upgrade_field(r, "quote_input_snapshot") for r in rows]


def upgrade_draft_rows(rows: list[dict]) -> list[dict]:
    return [_upgrade_field(r, "raw_input_json") for r in rows]
