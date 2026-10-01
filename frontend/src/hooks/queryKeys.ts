import type { HistoryFilters } from "../state/historyMachine";

// Every query is keyed by the identity of its request (R2): displayed data always comes from the CURRENT key.
export const QUERY_KEYS = {
  me: ["auth", "me"] as const,
  calculate: (seq: number) => ["calculate", seq] as const,
  sandbox: (seq: number, knobs: unknown) => ["sandbox", seq, knobs] as const,
  risk: (seq: number, deltas: unknown) => ["risk", seq, deltas] as const,
  history: (mode: "range" | "search", params: unknown, listSeq: number) => ["history", mode, params, listSeq] as const,
  historyAll: ["history"] as const,
  bunker: (port: string) => ["bunker", port] as const,
  vessel: (dwt: number, hasCrane: boolean) => ["vessel", dwt, hasCrane] as const,
  companyRoutes: ["company-routes"] as const,
  customPorts: ["custom-ports"] as const,
  distance: (a: string, b: string) => ["distance", ...[a, b].sort()] as const,
  bunkerPriceDashboard: (port: string) => ["dashboards", "bunker-price", port] as const,
  vesselTypeDashboard: ["dashboards", "vessel-type"] as const,
  freightTrendDashboard: ["dashboards", "freight-trend"] as const,
  portCostDashboard: ["dashboards", "port-cost"] as const,
  previousSearch: (filters: unknown) => ["history", "previous", filters] as const,
  latestDraft: ["drafts", "latest"] as const,
};

export type HistoryQuery =
  | { mode: "range"; monthRange: [string, string] }
  | { mode: "search"; filters: HistoryFilters };
