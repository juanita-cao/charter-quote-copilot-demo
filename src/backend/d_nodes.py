from __future__ import annotations

from typing import Literal

import bcrypt

from src.backend.e_nodes import calculate_tce, safe_div
from src.backend.rounding import excel_round
from src.backend.schemas import AuthResult, DealDecision, QuoteInput, ReverseQuoteResult, TCEResult

# Dummy hash for D3's anti-timing-attack comparison (ADR-016) — not a real
# account's hash, just something bcrypt.checkpw can compare against so "no
# such user"/malformed-hash paths take the same code path/time as "wrong
# password." Generated once per process at module import time (not a
# hardcoded/precomputed literal baked into the file) — value differs between
# process restarts, which is fine since it's never compared across processes.
_DUMMY_HASH = bcrypt.hashpw(b"dummy-password-for-timing-safety", bcrypt.gensalt()).decode("utf-8")

_INVALID_CREDENTIALS_MESSAGE = "Invalid email or password"


def analyze_deal(
    tce_result: TCEResult,
    inputs: QuoteInput,
    precision_mode: Literal["full", "display"] = "full",
) -> DealDecision:
    """D1 · Matching — binary GO/NO-GO gate on profit margin, net of the
    shipowner's hire cost (ADR-001, amended by ADR-012).

    precision_mode="display" (ADR-018) rounds profit_margin_pct/operator_profit_usd/
    both spreads to 2 decimals — and the GO/NO-GO comparison below uses the
    already-rounded profit_margin_pct, not the raw value, so the decision stays
    internally consistent with what the OP sees (accepted tradeoff: this can, in
    rare boundary cases, differ from what "full" precision would decide)."""
    freight_revenue = inputs.quantity * inputs.freight_rate
    shipowner_cost = inputs.shipowner_asking_tce * tce_result.total_days
    profit_margin_pct = (
        safe_div(tce_result.net_voyage_income - shipowner_cost, freight_revenue) * 100
    )
    operator_profit_usd = tce_result.net_voyage_income - shipowner_cost
    spread_vs_shipowner_ask = tce_result.tce - inputs.shipowner_asking_tce
    spread_vs_market_benchmark = tce_result.tce - inputs.market_benchmark

    if precision_mode == "display":
        profit_margin_pct = excel_round(profit_margin_pct, 2)
        operator_profit_usd = excel_round(operator_profit_usd, 2)
        spread_vs_shipowner_ask = excel_round(spread_vs_shipowner_ask, 2)
        spread_vs_market_benchmark = excel_round(spread_vs_market_benchmark, 2)

    if profit_margin_pct >= inputs.go_threshold_pct:
        decision = "GO"
        rule_triggered = "R1"
        reason = (
            f"Profit margin {profit_margin_pct:.2f}% meets or exceeds the "
            f"{inputs.go_threshold_pct:.2f}% threshold."
        )
        reason_zh = (
            f"利润率 {profit_margin_pct:.2f}% 达到或超过 {inputs.go_threshold_pct:.2f}% 的阈值。"
        )
    else:
        decision = "NO-GO"
        rule_triggered = "R2"
        reason = (
            f"Profit margin {profit_margin_pct:.2f}% is below the "
            f"{inputs.go_threshold_pct:.2f}% threshold."
        )
        reason_zh = f"利润率 {profit_margin_pct:.2f}% 低于 {inputs.go_threshold_pct:.2f}% 的阈值。"

    return DealDecision(
        decision=decision,
        reason=reason,
        reason_zh=reason_zh,
        rule_triggered=rule_triggered,
        profit_margin_pct=profit_margin_pct,
        operator_profit_usd=operator_profit_usd,
        spread_vs_shipowner_ask=spread_vs_shipowner_ask,
        spread_vs_market_benchmark=spread_vs_market_benchmark,
        inputs_snapshot=inputs,
    )


def authenticate_user(user_row: dict | None, password: str) -> AuthResult:
    """D3 · Matching — login decision gate (P5, PT-10). Pure function, no DB
    access itself (E9 already fetched user_row). Never raises. Never reveals
    *which* part was wrong — "no such user," "wrong password," and "stored
    credential is malformed" all return the identical generic error_message
    (anti-enumeration).

    Always runs a bcrypt comparison, even when there's no usable stored hash
    (against a fixed dummy hash) — closes a timing side-channel that an early
    return would otherwise leave open (ADR-016). A malformed stored hash
    (wrong type, or a string that isn't valid bcrypt output — e.g. DB
    corruption) is handled deliberately, not via a blanket except: it falls
    back to the same dummy-hash comparison rather than raising, but this is
    not "catch everything" — only the two specific failure shapes bcrypt
    itself can raise for a badly-formed hash are caught (fixed 2026-09-18,
    code review — the previous version could raise AttributeError/ValueError/
    KeyError under these conditions, violating this docstring's own
    "never raises" contract).
    """
    stored_hash: str | None = None
    if user_row is not None:
        candidate = user_row.get("password_hash")
        if isinstance(candidate, str) and candidate:
            stored_hash = candidate

    hash_to_check = stored_hash if stored_hash is not None else _DUMMY_HASH
    try:
        matched = bcrypt.checkpw(password.encode("utf-8"), hash_to_check.encode("utf-8"))
    except (ValueError, TypeError):
        # hash_to_check was a string but not valid bcrypt output (e.g. a
        # corrupted stored hash) — still run a real comparison for timing
        # safety, then treat as a failed auth like any other mismatch.
        bcrypt.checkpw(password.encode("utf-8"), _DUMMY_HASH.encode("utf-8"))
        matched = False

    if user_row is not None and matched and stored_hash is not None:
        user_id = user_row.get("id")
        company_id = user_row.get("company_id")
        if user_id is not None and company_id is not None:
            return AuthResult(
                success=True,
                company_id=company_id,
                user_id=user_id,
                error_message=None,
            )
        # Password matched a well-formed hash, but the row itself is missing
        # id/company_id — a data-integrity anomaly, not a credential problem,
        # but the external contract stays identical: generic failure, same
        # message, no hint that this is a different case than wrong password.

    return AuthResult(
        success=False,
        company_id=None,
        user_id=None,
        error_message=_INVALID_CREDENTIALS_MESSAGE,
    )


def reverse_quote(
    inputs: QuoteInput,
    target_tce: float,
    precision_mode: Literal["full", "display"] = "full",
) -> ReverseQuoteResult:
    """D2 · Pricing — what rate to quote the cargo owner to hit a target TCE.

    Ignores `go_threshold_pct` entirely — this is purely "what rate hits my own
    target_tce," independent of the company's GO/NO-GO floor used by D1.

    precision_mode="display" (ADR-018) rounds break_even_rate/minimum_safe_rate
    to 2 decimals; also passed through to the internal calculate_tce call so
    total_voyage_cost feeding these formulas is consistently rounded too.
    """
    tce_result = calculate_tce(
        inputs, precision_mode=precision_mode
    )  # raises ValueError if total_days <= 0
    total_days = tce_result.total_days
    total_voyage_cost = tce_result.total_voyage_cost

    commission_factor = 1 - inputs.commission_rate / 100
    denominator = inputs.quantity * commission_factor

    if denominator <= 0:
        raise ValueError("reverse_quote denominator must be positive")

    # break_even_rate is the rate at which the operator's real profit (net of
    # the shipowner's hire cost) is exactly zero — i.e. TCE == shipowner_asking_tce
    # (ADR-012, kept consistent with D1's shipowner-cost-netted profit_margin_pct).
    shipowner_cost = inputs.shipowner_asking_tce * total_days
    break_even_rate = (total_voyage_cost + shipowner_cost) / denominator

    target_net_voyage_income = target_tce * total_days
    minimum_safe_rate = (target_net_voyage_income + total_voyage_cost) / denominator

    if precision_mode == "display":
        break_even_rate = excel_round(break_even_rate, 2)
        minimum_safe_rate = excel_round(minimum_safe_rate, 2)

    return ReverseQuoteResult(
        break_even_rate=break_even_rate,
        minimum_safe_rate=minimum_safe_rate,
        current_rate=inputs.freight_rate,
    )
