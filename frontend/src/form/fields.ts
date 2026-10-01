import type { QuoteInput, VoyagePort } from "../api/types";

/** An Others row while it is being typed: the amount may still be blank. */
export interface OtherCostRow {
  name: string;
  amount: number | null;
}

export type QuoteFormValues = Omit<
  { [K in keyof Required<QuoteInput>]: Required<QuoteInput>[K] | null },
  "other_costs" | "voyage_ports"
> & {
  other_costs: OtherCostRow[];
  voyage_ports: VoyagePort[];
};

export const REQUIRED_FIELDS = [
  "route",
  "quantity",
  "freight_rate",
  "commission_rate",
  "margin_days",
  "ballast_distance",
  "laden_distance",
  "ballast_speed",
  "laden_speed",
  "hfo_price",
  "mgo_price",
  "hfo_ballast_consumption",
  "hfo_laden_consumption",
  "mgo_ballast_consumption",
  "mgo_laden_consumption",
  "hfo_port_consumption",
  "mgo_port_consumption",
  "load_port_pda",
  "discharge_port_pda",
  "market_benchmark",
  "shipowner_asking_tce",
  "go_threshold_pct",
] as const satisfies readonly (keyof QuoteInput)[];

export const OPTIONAL_FIELDS = [
  // cargo_description is a label, not a calculation input — optional since 2026-09-24 (a case
  // with no recognisable cargo, e.g. the client's "设备" lump-sum jobs, must still be Runnable)
  "cargo_description",
  "fill_in_date",
  "laycan_start",
  "laycan_end",
  "load_port",
  "discharge_port",
  "cargo_notes",
  "loading_mode",
  "discharging_mode",
  "loading_days",
  "discharging_days",
  "loading_rate",
  "discharging_rate",
  "other_costs",
  "voyage_ports",
  "loading_cost",
  "discharging_cost",
  "cev_cost",
  "ilohc_cost",
  "lashing_cost",
  "cjk_laden_nm",
  "cjk_laden_mgo_consumption",
  "cjk_ballast_nm",
  "cjk_ballast_mgo_consumption",
  "qz_laden_nm",
  "qz_laden_mgo_consumption",
  "qz_ballast_nm",
  "qz_ballast_mgo_consumption",
  "contract_terms",
  "vessel_name",
  "vessel_dwt",
  "has_crane",
  "bunkering_port",
] as const satisfies readonly (keyof QuoteInput)[];

export const ALL_FIELDS = [...REQUIRED_FIELDS, ...OPTIONAL_FIELDS] as const;

// Compile-time exhaustiveness: fails to type-check if a QuoteInput key is missing from the two lists.
type MissingFields = Exclude<keyof QuoteInput, (typeof ALL_FIELDS)[number]>;
export const _allFieldsCovered: MissingFields extends never ? true : never = true;

export const STRING_FIELDS: ReadonlySet<string> = new Set([
  "route",
  "cargo_description",
  "fill_in_date",
  "laycan_start",
  "laycan_end",
  "load_port",
  "discharge_port",
  "cargo_notes",
  "loading_mode",
  "discharging_mode",
  "contract_terms",
  "vessel_name",
  "bunkering_port",
]);
export const BOOLEAN_FIELDS: ReadonlySet<string> = new Set(["has_crane"]);
export const LIST_FIELDS: ReadonlySet<string> = new Set(["other_costs"]);
/** Like LIST_FIELDS but each row is {port, role}, not {name, amount} — the voyage port sequence (v1.2, PT-21). */
export const PORT_LIST_FIELDS: ReadonlySet<string> = new Set(["voyage_ports"]);

/** The per-port switch and the two inputs it chooses between. */
export const PORT_TIME = {
  loading: { mode: "loading_mode", days: "loading_days", rate: "loading_rate" },
  discharging: { mode: "discharging_mode", days: "discharging_days", rate: "discharging_rate" },
} as const;

export function blankFormValues(): QuoteFormValues {
  const values = Object.fromEntries(ALL_FIELDS.map((f) => [f, null])) as Record<string, unknown>;
  values.loading_mode = "days";
  values.discharging_mode = "days";
  values.other_costs = [];
  values.voyage_ports = [];
  return values as QuoteFormValues;
}

const pad = (n: number) => String(n).padStart(2, "0");
export const todayIso = (now: Date = new Date()) => `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

/** A form that starts a new quote: blank, with today as the fill-in date (editable). */
export function startingFormValues(now: Date = new Date()): QuoteFormValues {
  return { ...blankFormValues(), fill_in_date: todayIso(now) };
}
