import type {
  BunkerPriceResult,
  DealDecision,
  DraftRow,
  QuoteCalculationResult,
  QuoteRow,
  RiskScenarioRow,
  VesselConsumptionProfile,
} from "../api/types";
import { collectForm } from "../form/collect";
import { completeForm } from "./fixtures";

export function makeDecision(over: Partial<DealDecision> = {}): DealDecision {
  return {
    decision: "GO",
    reason: "Margin 12% exceeds the 10% threshold",
    rule_triggered: "R1",
    profit_margin_pct: 12,
    operator_profit_usd: 3400,
    spread_vs_shipowner_ask: 250,
    spread_vs_market_benchmark: 100,
    inputs_snapshot: collectForm(completeForm()),
    ...over,
  };
}

export function makeQuoteResult(over: Partial<DealDecision> = {}): QuoteCalculationResult {
  return {
    tce_result: { total_days: 14, loading_days: 2, discharging_days: 2, total_voyage_cost: 90000, net_voyage_income: 120000, freight_revenue: 200000, tce: 9100 },
    deal_decision: makeDecision(over),
  };
}

export function makeRiskRow(over: Partial<RiskScenarioRow> = {}): RiskScenarioRow {
  return {
    scenario_name: "Base",
    scenario_name_zh: "基准",
    delta: null,
    delta_step: 0,
    delta_unit: "",
    estimated_tce: 9100,
    tce_impact: 0,
    profit_margin_pct: 12,
    decision: "GO",
    ...over,
  };
}

export function makeBunker(over: Partial<BunkerPriceResult> = {}): BunkerPriceResult {
  return {
    port: "Singapore",
    vlsfo_low: 480,
    vlsfo_high: 520,
    lsmgo_low: 680,
    lsmgo_high: 720,
    report_date: "2026-09-18",
    scraped_at: "2026-09-18T02:00:00Z",
    vote_agreement: 0.9,
    ...over,
  };
}

export function makeVessel(over: Partial<VesselConsumptionProfile> = {}): VesselConsumptionProfile {
  return {
    ballast_speed: 11,
    laden_speed: 10,
    hfo_ballast_consumption: 18,
    hfo_laden_consumption: 20,
    mgo_ballast_consumption: 1.5,
    mgo_laden_consumption: 2,
    hfo_port_consumption: 3,
    mgo_port_consumption: 1,
    ...over,
  };
}

export function makeQuoteRow(over: Partial<QuoteRow> = {}): QuoteRow {
  return {
    id: 12,
    created_at: "2026-09-18T10:00:00Z",
    route: "Singapore-Shanghai",
    cargo_description: "Steel coils",
    quantity: 5000,
    freight_rate: 20,
    commission_rate: 2.5,
    tce: 9100,
    profit_margin_pct: 12,
    decision: "GO",
    quote_input_snapshot: collectForm(completeForm({ vessel_name: "MV Test" })),
    deal_decision_snapshot: {},
    ...over,
  };
}

export function makeDraftRow(over: Partial<DraftRow> = {}): DraftRow {
  return {
    id: 7,
    user_id: 2,
    route: "Ningbo-Manila",
    cargo_description: "Coal",
    updated_at: "2026-09-19T08:00:00Z",
    raw_input_json: { route: "Ningbo-Manila", cargo_description: "Coal", quantity: 4000, freight_rate: 15 },
    ...over,
  };
}
