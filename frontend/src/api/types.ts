export type PrecisionMode = "full" | "display";

// How a port's time is given: the days directly, or a rate per day from which the backend calculates the days.
export type PortTimeMode = "days" | "rate";

export interface OtherCost {
  name: string;
  amount: number;
}

export type VoyagePortRole = "load" | "discharge" | "waypoint";
export interface VoyagePort {
  port: string;
  role: VoyagePortRole;
}

export interface QuoteInput {
  route: string;
  cargo_description?: string;
  fill_in_date?: string | null;
  laycan_start?: string | null;
  laycan_end?: string | null;
  load_port?: string;
  discharge_port?: string;
  cargo_notes?: string;
  voyage_ports?: VoyagePort[];
  quantity: number;
  freight_rate: number;
  commission_rate: number;
  loading_mode?: PortTimeMode;
  discharging_mode?: PortTimeMode;
  loading_days?: number | null;
  discharging_days?: number | null;
  loading_rate?: number | null;
  discharging_rate?: number | null;
  margin_days: number;
  ballast_distance: number;
  laden_distance: number;
  ballast_speed: number;
  laden_speed: number;
  hfo_price: number;
  mgo_price: number;
  hfo_ballast_consumption: number;
  hfo_laden_consumption: number;
  mgo_ballast_consumption: number;
  mgo_laden_consumption: number;
  hfo_port_consumption: number;
  mgo_port_consumption: number;
  load_port_pda: number;
  discharge_port_pda: number;
  market_benchmark: number;
  shipowner_asking_tce: number;
  go_threshold_pct: number;
  other_costs?: OtherCost[];
  loading_cost?: number;
  discharging_cost?: number;
  cev_cost?: number;
  ilohc_cost?: number;
  lashing_cost?: number;
  cjk_laden_nm?: number;
  cjk_laden_mgo_consumption?: number;
  cjk_ballast_nm?: number;
  cjk_ballast_mgo_consumption?: number;
  qz_laden_nm?: number;
  qz_laden_mgo_consumption?: number;
  qz_ballast_nm?: number;
  qz_ballast_mgo_consumption?: number;
  contract_terms?: string;
  vessel_name?: string;
  vessel_dwt?: number;
  has_crane?: boolean;
  bunkering_port?: string;
}

export interface TCEResult {
  total_days: number;
  loading_days: number;
  discharging_days: number;
  total_voyage_cost: number;
  net_voyage_income: number;
  freight_revenue: number;
  tce: number;
}

export interface DealDecision {
  decision: "GO" | "NO-GO";
  reason: string;
  reason_zh?: string; // absent on records saved before 2026-09-21
  rule_triggered: string;
  profit_margin_pct: number;
  operator_profit_usd: number;
  spread_vs_shipowner_ask: number;
  spread_vs_market_benchmark: number;
  inputs_snapshot: QuoteInput;
}

export interface QuoteCalculationResult {
  tce_result: TCEResult;
  deal_decision: DealDecision;
}

export interface ReverseQuoteResult {
  break_even_rate: number;
  minimum_safe_rate: number;
  current_rate: number;
}

export interface QuotationSandboxResult {
  resolved_freight_rate: number;
  resolved_freight_revenue: number;
  resolved_tce: number;
  break_even_rate: number;
  decision: DealDecision;
}

export interface RiskScenarioRow {
  scenario_name: string;
  scenario_name_zh: string;
  delta: number | null;
  delta_step: number;
  delta_unit: string;
  estimated_tce: number;
  tce_impact: number;
  profit_margin_pct: number;
  decision: "GO" | "NO-GO";
}

export interface BunkerPriceResult {
  port: string;
  vlsfo_low: number | null;
  vlsfo_high: number | null;
  lsmgo_low: number | null;
  lsmgo_high: number | null;
  report_date: string;
  scraped_at: string;
  vote_agreement: number;
}

export interface BunkerPriceReferencePoint {
  report_date: string;
  vlsfo_low: number | null;
  vlsfo_high: number | null;
  lsmgo_low: number | null;
  lsmgo_high: number | null;
}

export interface VesselTypeStatRow {
  quote_date: string;
  vessel_dwt: number | null;
  tce: number;
  profit_margin_pct: number | null;
}

export interface FreightTrendRow {
  quote_date: string;
  cargo_description: string;
  freight_rate: number;
}

export interface PortCostRow {
  quote_date: string;
  load_port: string;
  load_port_pda: number | null;
  discharge_port: string;
  discharge_port_pda: number | null;
}

export interface DistanceResult {
  nm: number;
  samples: number;
  /** "history" = the client's own real voyages; "estimate" = a free searoute computation, no match in history (PT-21 Phase 2). */
  source: "history" | "estimate";
}

export interface VesselConsumptionProfile {
  ballast_speed: number;
  laden_speed: number;
  hfo_ballast_consumption: number;
  hfo_laden_consumption: number;
  mgo_ballast_consumption: number;
  mgo_laden_consumption: number;
  hfo_port_consumption: number;
  mgo_port_consumption: number;
}

export interface CurrentUserProfile {
  user_id: number;
  company_id: number;
  company_name: string | null;
  dashboards_eligible: boolean;
}

export interface RegisterInput {
  company_name: string;
  admin_email: string;
  password: string;
  password_confirm: string;
}

export interface RegisterResult {
  success: boolean;
  company_id: number | null;
  user_id: number | null;
  error_message: string | null;
}

export interface QuoteRow {
  id: number;
  created_at: string;
  route: string;
  cargo_description: string | null;
  quantity: number | null;
  freight_rate: number | null;
  commission_rate: number | null;
  tce: number | null;
  profit_margin_pct: number | null;
  decision: "GO" | "NO-GO" | null;
  quote_input_snapshot: unknown;
  deal_decision_snapshot: unknown;
}

export interface DraftRow {
  id: number;
  user_id: number;
  route: string | null;
  cargo_description: string | null;
  updated_at: string;
  raw_input_json: unknown;
}

export interface DraftLatest {
  draft: unknown | null;
  updated_at: string | null;
}
