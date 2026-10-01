import type { Values } from "./context";

export type FieldKind = "text" | "number" | "route" | "terms" | "dwt" | "crane" | "port" | "total" | "date" | "timing" | "others" | "voyagePorts";
// "total_freight" is a linked view of quantity x rate: not a QuoteInput field, never stored or sent.
export type FieldName = keyof Values | "total_freight";
export interface FieldDef {
  name: FieldName;
  kind: FieldKind;
  /** A control that edits several form values at once (the days / rate switch): all the fields it owns. */
  covers?: (keyof Values)[];
}
export interface GroupDef {
  key: string;
  /** Each row is laid out side by side; homogeneous fields (ballast / laden, HFO / MGO ...) share a row. */
  rows: FieldDef[][];
}

/** The cargo notes are not in a group: they are the "Start from an enquiry" panel at the top of the inputs. */
export const ENQUIRY_FIELD = "cargo_notes" as const;

export const CONTRACT_TERMS = ["FIO", "FILO", "FICO", "FLT", "LIFO"];
export const DWT_TIERS = [2000, 3000, 4000, 5000, 6000, 7000, 8000, 9000, 10000, 15000, 20000];
export const CRANE_TIERS = [8000, 9000, 10000];

const n = (name: keyof Values): FieldDef => ({ name, kind: "number" });
const text = (name: keyof Values, kind: FieldKind = "text"): FieldDef => ({ name, kind });
const total: FieldDef = { name: "total_freight", kind: "total" };
const date = (name: keyof Values): FieldDef => ({ name, kind: "date" });
// Loading / discharging time: the Days | Rate switch with the input it chooses (v1.1). Named after its days field.
const timing = (port: "loading" | "discharging"): FieldDef => ({
  name: `${port}_days`,
  kind: "timing",
  covers: [`${port}_mode`, `${port}_days`, `${port}_rate`],
});

// The seven groups of the predecessor, in the same order; only the first is open by default.
export const FIELD_GROUPS: GroupDef[] = [
  {
    key: "cargo",
    rows: [
      [date("fill_in_date"), date("laycan_start"), date("laycan_end")],
      [text("route", "route")],
      [text("cargo_description"), text("contract_terms", "terms"), n("commission_rate")],
      [n("quantity"), n("freight_rate"), total],
    ],
  },
  { key: "vessel", rows: [[text("vessel_name"), text("vessel_dwt", "dwt"), text("has_crane", "crane")]] },
  {
    key: "schedule",
    rows: [
      [{ name: "voyage_ports", kind: "voyagePorts" }],
      [n("ballast_distance"), n("laden_distance")],
      [timing("loading"), timing("discharging"), n("margin_days")],
    ],
  },
  {
    key: "special",
    rows: [
      [n("cjk_ballast_nm"), n("cjk_laden_nm")],
      [n("cjk_ballast_mgo_consumption"), n("cjk_laden_mgo_consumption")],
      [n("qz_ballast_nm"), n("qz_laden_nm")],
      [n("qz_ballast_mgo_consumption"), n("qz_laden_mgo_consumption")],
    ],
  },
  {
    key: "bunker",
    rows: [
      [n("ballast_speed"), n("laden_speed")],
      [text("bunkering_port", "port"), n("hfo_price"), n("mgo_price")],
      [n("hfo_ballast_consumption"), n("hfo_laden_consumption"), n("hfo_port_consumption")],
      [n("mgo_ballast_consumption"), n("mgo_laden_consumption"), n("mgo_port_consumption")],
    ],
  },
  {
    key: "costs",
    rows: [
      [n("load_port_pda"), n("discharge_port_pda"), n("loading_cost")],
      [n("discharging_cost"), n("lashing_cost"), n("cev_cost")],
      [n("ilohc_cost")],
      [text("other_costs", "others")],
    ],
  },
  { key: "benchmarks", rows: [[n("shipowner_asking_tce"), n("market_benchmark"), n("go_threshold_pct")]] },
];
