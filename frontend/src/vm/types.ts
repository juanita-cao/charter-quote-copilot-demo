import type { QuoteFormValues } from "../form/fields";
import type { SnapshotNotice } from "../form/load";

export type Decision = "GO" | "NO-GO";

// Estimated TCE cards (client layout) + the approved KPI / spread figures, which now live in a collapsible Details section.
export interface VerdictVM {
  decision: Decision;
  marginPct: number;
  operatorProfitUsd: number;
  reason: string;
  reasonZh: string | null;
  freightRate: number;
  totalFreightUsd: number;
  ownerAskTce: number;
  kpis: { tce: number; totalDays: number; voyageCost: number; netIncome: number };
  spreads: { vsOwnerAsk: number; vsMarket: number };
  ownerAskNegative: boolean;
}

// Reverse Quote cards.
export interface SandboxVM {
  resolvedRate: number;
  totalFreightUsd: number;
  resolvedTce: number;
  breakEvenRate: number;
  decision: Decision;
  marginPct: number;
  operatorProfitUsd: number;
  spreadVsOwnerAsk: number;
  ownerAskNegative: boolean;
  ownerAskTce: number;
}

export interface RiskRowVM {
  /** "base", or the backend's stable override key (`port_cost` ...) used in `deltas`. */
  key: string;
  name: string;
  isBase: boolean;
  delta: number | null;
  deltaStep: number;
  deltaUnit: string;
  tce: number;
  tceImpact: number;
  marginPct: number;
  decision: Decision;
}

export interface HistoryRowVM {
  key: string;
  kind: "quote" | "draft";
  typeLabel: "GO" | "NO-GO" | "DRAFT" | "UNKNOWN";
  dateIso: string;
  route: string;
  cargo: string;
  vessel: string;
  quantity: number | null;
  rate: number | null;
  tce: number | null;
  values: QuoteFormValues | null;
  notice: SnapshotNotice | null;
}

export interface DraftBannerVM {
  visible: boolean;
  savedAtIso: string | null;
  values: QuoteFormValues | null;
  notice: SnapshotNotice | null;
}

export interface AccountVM {
  label: string;
}

export interface BunkerAutofillVM {
  patch: Partial<QuoteFormValues>;
  caption: {
    kind: "ok" | "warn";
    key: "ok" | "noData" | "nil" | "stale" | "lowConfidence";
    params?: Record<string, string>;
  } | null;
}
