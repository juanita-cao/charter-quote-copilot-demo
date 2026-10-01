import type { DealDecision, QuotationSandboxResult, QuoteCalculationResult } from "../api/types";
import type { SandboxVM, VerdictVM } from "./types";

function need<T>(value: T | null | undefined, name: string): T {
  if (value === null || value === undefined) throw new Error(`contract violation: missing ${name}`);
  return value;
}

function decisionCards(d: DealDecision) {
  const snapshot = need(d.inputs_snapshot, "inputs_snapshot");
  const spread = need(d.spread_vs_shipowner_ask, "spread_vs_shipowner_ask");
  return {
    freightRate: need(snapshot.freight_rate, "inputs_snapshot.freight_rate"),
    ownerAskTce: need(snapshot.shipowner_asking_tce, "inputs_snapshot.shipowner_asking_tce"),
    decision: need(d.decision, "decision"),
    marginPct: need(d.profit_margin_pct, "profit_margin_pct"),
    operatorProfitUsd: need(d.operator_profit_usd, "operator_profit_usd"),
    spreadVsOwnerAsk: spread,
    ownerAskNegative: spread < 0, // the sign of a backend value, never recomputed
  };
}

export function buildVerdictVM(res: QuoteCalculationResult): VerdictVM {
  const t = need(res?.tce_result, "tce_result");
  const d = need(res?.deal_decision, "deal_decision");
  const c = decisionCards(d);
  return {
    decision: c.decision,
    marginPct: c.marginPct,
    operatorProfitUsd: c.operatorProfitUsd,
    reason: need(d.reason, "reason"),
    reasonZh: d.reason_zh ? d.reason_zh : null,
    freightRate: c.freightRate,
    totalFreightUsd: need(t.freight_revenue, "freight_revenue"), // the backend's figure (T2.29): never multiplied here
    ownerAskTce: c.ownerAskTce,
    kpis: {
      tce: need(t.tce, "tce"),
      totalDays: need(t.total_days, "total_days"),
      voyageCost: need(t.total_voyage_cost, "total_voyage_cost"),
      netIncome: need(t.net_voyage_income, "net_voyage_income"),
    },
    spreads: { vsOwnerAsk: c.spreadVsOwnerAsk, vsMarket: need(d.spread_vs_market_benchmark, "spread_vs_market_benchmark") },
    ownerAskNegative: c.ownerAskNegative,
  };
}

export function buildSandboxVM(res: QuotationSandboxResult): SandboxVM {
  const d = need(res?.decision, "decision");
  const c = decisionCards(d);
  const resolvedRate = need(res.resolved_freight_rate, "resolved_freight_rate");
  return {
    resolvedRate,
    totalFreightUsd: need(res.resolved_freight_revenue, "resolved_freight_revenue"), // for the RESOLVED rate, from the backend
    resolvedTce: need(res.resolved_tce, "resolved_tce"),
    breakEvenRate: need(res.break_even_rate, "break_even_rate"),
    decision: c.decision,
    marginPct: c.marginPct,
    operatorProfitUsd: c.operatorProfitUsd,
    spreadVsOwnerAsk: c.spreadVsOwnerAsk,
    ownerAskNegative: c.ownerAskNegative,
    ownerAskTce: c.ownerAskTce,
  };
}
