import { blankFormValues, type QuoteFormValues } from "../form/fields";

export function completeForm(over: Partial<QuoteFormValues> = {}): QuoteFormValues {
  return {
    ...blankFormValues(),
    route: "Singapore-Shanghai",
    cargo_description: "Steel coils",
    quantity: 5000,
    freight_rate: 20,
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
    market_benchmark: 9000,
    shipowner_asking_tce: 8500,
    go_threshold_pct: 10,
    ...over,
  };
}
