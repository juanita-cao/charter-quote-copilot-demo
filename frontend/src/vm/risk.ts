import type { RiskScenarioRow } from "../api/types";
import type { RiskRowVM } from "./types";

// The backend applies `deltas` by these stable keys, but a response row carries only its display name, so the
// key is taken from the row's position (row 0 is the base case) — the same rule the predecessor used.
export const RISK_SCENARIO_KEYS = ["port_cost", "bunker_price", "margin_days", "freight_rate"] as const;

export function buildRiskRowsVM(rows: RiskScenarioRow[], lang: "en" | "zh"): RiskRowVM[] {
  return rows.map((r, i) => {
    const isBase = r.delta === null;
    const key = isBase ? "base" : RISK_SCENARIO_KEYS[i - 1];
    if (key === undefined) throw new Error(`contract violation: risk row ${i} has no known override key`);
    return {
      key,
      name: lang === "zh" ? r.scenario_name_zh : r.scenario_name,
      isBase,
      delta: r.delta,
      deltaStep: r.delta_step,
      deltaUnit: r.delta_unit,
      tce: r.estimated_tce,
      tceImpact: r.tce_impact,
      marginPct: r.profit_margin_pct,
      decision: r.decision,
    };
  });
}
