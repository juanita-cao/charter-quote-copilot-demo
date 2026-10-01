"""
Rounding for the "display" precision mode (ADR-023).

The client reconciles against an Excel workbook that rounds every cell "as displayed".
Excel's ROUND rounds half away from zero, and it works on the number as written (15
significant digits): 23.625 is 23.63 and 2.675 is 2.68. Python's built-in round() does
neither: it rounds half to even on the exact binary value (round(23.625, 2) == 23.62,
round(2.675, 2) == 2.67). One shared function keeps E2, D1 and D2 from drifting apart.
"""

from __future__ import annotations

import math
from decimal import ROUND_HALF_UP, Decimal


def excel_round(value: float, ndigits: int = 2) -> float:
    if not math.isfinite(value):
        return value
    as_seen = Decimal(format(value, ".15g"))
    return float(as_seen.quantize(Decimal(1).scaleb(-ndigits), rounding=ROUND_HALF_UP))
