"""
Quotation Side sandbox — bidirectional rate<->TCE solve (ADR-009, ported
verbatim from the predecessor's `pipeline.py::run_quotation_sandbox`, which
T1.1 did not copy along with the rest of `pipeline.py`).

Not a DEP node: a pure composition of already-approved primitives (D2 for the
target-TCE direction, E2 on a perturbed input for the freight-rate direction,
D1 for the decision) — invents no new business rule (Primitive Integrity).
"""

from __future__ import annotations

from typing import Literal

from src.backend.d_nodes import analyze_deal, reverse_quote
from src.backend.e_nodes import calculate_tce, copy_quote_input_validated
from src.backend.schemas import QuotationSandboxResult, QuoteInput


def run_quotation_sandbox(
    inputs: QuoteInput,
    target_tce: float | None = None,
    sandbox_freight_rate: float | None = None,
    sandbox_shipowner_ask: float | None = None,
    precision_mode: Literal["full", "display"] = "full",
) -> QuotationSandboxResult:
    """Quotation Side sandbox — bidirectional rate<->TCE solve.

    Exactly one of target_tce / sandbox_freight_rate must be given; the other
    is derived. Reuses D2 (target_tce given) or E2 on a perturbed input
    (sandbox_freight_rate given), then D1 for the decision — invents no new
    business rule (Primitive Integrity).

    `sandbox_shipowner_ask`, when given, overrides `inputs.shipowner_asking_tce`
    for every formula below — break_even_rate and the decision's profit_margin_pct
    both depend on it post-ADR-012, so editing this sandbox field must actually
    move those numbers, not just the display-only spread shown elsewhere.
    """
    if (target_tce is None) == (sandbox_freight_rate is None):
        raise ValueError("exactly one of target_tce or sandbox_freight_rate must be given")

    effective_inputs = (
        inputs
        if sandbox_shipowner_ask is None
        else copy_quote_input_validated(inputs, {"shipowner_asking_tce": sandbox_shipowner_ask})
    )

    if target_tce is not None:
        resolved_rate = reverse_quote(
            effective_inputs, target_tce, precision_mode=precision_mode
        ).minimum_safe_rate
    else:
        resolved_rate = sandbox_freight_rate

    sandbox_inputs = copy_quote_input_validated(effective_inputs, {"freight_rate": resolved_rate})
    tce_result = calculate_tce(sandbox_inputs, precision_mode=precision_mode)
    decision = analyze_deal(tce_result, sandbox_inputs, precision_mode=precision_mode)
    break_even_rate = reverse_quote(
        effective_inputs, tce_result.tce, precision_mode=precision_mode
    ).break_even_rate

    return QuotationSandboxResult(
        resolved_freight_rate=resolved_rate,
        resolved_freight_revenue=tce_result.freight_revenue,
        resolved_tce=tce_result.tce,
        break_even_rate=break_even_rate,
        decision=decision,
    )
