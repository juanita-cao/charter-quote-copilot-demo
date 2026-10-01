import type {
  BunkerPriceResult,
  CurrentUserProfile,
  DistanceResult,
  DraftLatest,
  DraftRow,
  QuoteCalculationResult,
  QuoteInput,
  QuoteRow,
  RiskScenarioRow,
  VesselConsumptionProfile,
} from "../api/types";

// Illustrative numbers: fixtures test rendering, the frontend never checks them against a formula.
export const MOCK_ME: CurrentUserProfile = {
  user_id: 1,
  company_id: 1,
  company_name: "Acme Shipping Pte Ltd",
  dashboards_eligible: false,
};

export const MOCK_QUOTE_INPUT: QuoteInput = {
  route: "CN-VN",
  cargo_description: "Iron ore",
  quantity: 5000,
  freight_rate: 22,
  commission_rate: 2.5,
  loading_days: 2,
  discharging_days: 2,
  margin_days: 1,
  ballast_distance: 300,
  laden_distance: 1500,
  ballast_speed: 10,
  laden_speed: 11,
  hfo_price: 500,
  mgo_price: 700,
  hfo_ballast_consumption: 10,
  hfo_laden_consumption: 12,
  mgo_ballast_consumption: 1,
  mgo_laden_consumption: 1,
  hfo_port_consumption: 2,
  mgo_port_consumption: 1,
  load_port_pda: 4000,
  discharge_port_pda: 4000,
  market_benchmark: 3000,
  shipowner_asking_tce: 2800,
  go_threshold_pct: 2.5,
  vessel_name: "MV Sample",
};

export const MOCK_CALC_GO: QuoteCalculationResult = {
  tce_result: { total_days: 20.51, loading_days: 2, discharging_days: 2, total_voyage_cost: 62246.0, net_voyage_income: 84014.78, freight_revenue: 110000, tce: 4096.28 },
  deal_decision: {
    decision: "GO",
    reason: "Profit margin 3.42% meets or exceeds the 2.50% threshold.",
    reason_zh: "利润率 3.42% 达到或超过 2.50% 的阈值。",
    rule_triggered: "R1",
    profit_margin_pct: 3.42,
    operator_profit_usd: 26586.78,
    spread_vs_shipowner_ask: 1296.28,
    spread_vs_market_benchmark: 1096.28,
    inputs_snapshot: MOCK_QUOTE_INPUT,
  },
};

export const MOCK_CALC_NOGO_NEG_ASK: QuoteCalculationResult = {
  tce_result: { total_days: 20.51, loading_days: 2, discharging_days: 2, total_voyage_cost: 62246.0, net_voyage_income: 51000.0, freight_revenue: 25000, tce: 2487.5 },
  deal_decision: {
    decision: "NO-GO",
    reason: "Profit margin 0.80% is below the 2.50% threshold.",
    reason_zh: "利润率 0.80% 低于 2.50% 的阈值。",
    rule_triggered: "R2",
    profit_margin_pct: 0.8,
    operator_profit_usd: 4100.0,
    spread_vs_shipowner_ask: -212.5,
    spread_vs_market_benchmark: -512.5,
    inputs_snapshot: { ...MOCK_QUOTE_INPUT, freight_rate: 5 },
  },
};

export const MOCK_HISTORY_QUOTES: QuoteRow[] = [
  {
    id: 12,
    created_at: "2026-09-18T10:00:00Z",
    route: "CN-VN",
    cargo_description: "Iron ore",
    quantity: 5000,
    freight_rate: 22,
    commission_rate: 2.5,
    tce: 4096.28,
    profit_margin_pct: 3.42,
    decision: "GO",
    quote_input_snapshot: MOCK_QUOTE_INPUT,
    deal_decision_snapshot: MOCK_CALC_GO.deal_decision,
  },
  {
    id: 11,
    created_at: "2026-09-16T08:30:00Z",
    route: "TH-ID",
    cargo_description: "Steel coils",
    quantity: 3200,
    freight_rate: 5,
    commission_rate: 1.25,
    tce: 2487.5,
    profit_margin_pct: 0.8,
    decision: "NO-GO",
    quote_input_snapshot: { ...MOCK_QUOTE_INPUT, route: "TH-ID", cargo_description: "Steel coils", quantity: 3200, freight_rate: 5 },
    deal_decision_snapshot: MOCK_CALC_NOGO_NEG_ASK.deal_decision,
  },
];

export const MOCK_HISTORY_QUOTE_STRING_SNAPSHOT: QuoteRow = {
  ...MOCK_HISTORY_QUOTES[0],
  id: 10,
  created_at: "2026-09-14T09:00:00Z",
  route: "SG-MY",
  quote_input_snapshot: JSON.stringify({ ...MOCK_QUOTE_INPUT, route: "SG-MY" }),
};

export const MOCK_HISTORY_DRAFTS: DraftRow[] = [
  {
    id: 7,
    user_id: 1,
    route: "CN-VN",
    cargo_description: "ore",
    updated_at: "2026-09-18T14:02:00Z",
    raw_input_json: { route: "CN-VN", cargo_description: "ore" },
  },
];

export const MOCK_DRAFT_LATEST: DraftLatest = {
  draft: { route: "CN-VN", cargo_description: "ore" },
  updated_at: "2026-09-18T14:02:00Z",
};

export const MOCK_RISK_ROWS: RiskScenarioRow[] = [
  { scenario_name: "Base Case", scenario_name_zh: "基准情景", delta: null, delta_step: 0, delta_unit: "", estimated_tce: 4096.28, tce_impact: 0, profit_margin_pct: 3.42, decision: "GO" },
  { scenario_name: "Port Cost", scenario_name_zh: "港口费用", delta: 20, delta_step: 5, delta_unit: "%", estimated_tce: 3850.1, tce_impact: -246.18, profit_margin_pct: 2.9, decision: "GO" },
  { scenario_name: "Bunker Price", scenario_name_zh: "燃油价格", delta: 15, delta_step: 5, delta_unit: "%", estimated_tce: 3520.4, tce_impact: -575.88, profit_margin_pct: 2.1, decision: "NO-GO" },
  { scenario_name: "Margin Days", scenario_name_zh: "预留天数", delta: 2, delta_step: 1, delta_unit: "days", estimated_tce: 3700.0, tce_impact: -396.28, profit_margin_pct: 2.4, decision: "NO-GO" },
  { scenario_name: "Freight Rate", scenario_name_zh: "运价", delta: -5, delta_step: 1, delta_unit: "%", estimated_tce: 3300.0, tce_impact: -796.28, profit_margin_pct: 1.7, decision: "NO-GO" },
];

export const MOCK_BUNKER: BunkerPriceResult = {
  port: "SINGAPORE",
  vlsfo_low: 480,
  vlsfo_high: 520,
  lsmgo_low: 680,
  lsmgo_high: 720,
  report_date: new Date().toISOString().slice(0, 10),
  scraped_at: new Date().toISOString(),
  vote_agreement: 0.92,
};

export const MOCK_BUNKER_NIL: BunkerPriceResult = { ...MOCK_BUNKER, port: "NIL-PORT", vlsfo_high: null, lsmgo_high: null };

export const MOCK_VESSEL: VesselConsumptionProfile = {
  ballast_speed: 11,
  laden_speed: 10,
  hfo_ballast_consumption: 18,
  hfo_laden_consumption: 20,
  mgo_ballast_consumption: 1.5,
  mgo_laden_consumption: 2,
  hfo_port_consumption: 3,
  mgo_port_consumption: 1,
};

export const MOCK_ROUTES: string[] = ["CN-VN", "TH-ID", "SG-MY"];
export const MOCK_CUSTOM_PORTS: string[] = ["Bahodopi", "Kampot", "Palopo", "Cigading", "Bantaeng", "Obi", "Kao", "Pelintung"];

// Distance lookup, Phase 1 (PT-21): a few real pairs from design_backend.md §17.1, keyed the same order-independent
// way the backend does (sorted). Unknown pairs return null, exactly like the real endpoint.
export const MOCK_DISTANCES: Record<string, DistanceResult> = {
  "Dalian|Gunsan": { nm: 303, samples: 65, source: "history" },
  "Busan|Vostochny": { nm: 507, samples: 3, source: "history" },
  "Tianjin|Vostochny": { nm: 1222, samples: 40, source: "history" },
};
