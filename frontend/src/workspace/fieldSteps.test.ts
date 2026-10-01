import { ALL_FIELDS, BOOLEAN_FIELDS, LIST_FIELDS, PORT_LIST_FIELDS, STRING_FIELDS } from "../form/fields";
import { FIELD_STEPS, OTHER_COST_STEP, TOTAL_FREIGHT_STEP } from "./fieldSteps";

// Source: the predecessor's _INPUT_CATEGORIES (app_streamlit.py), where the client already used these step sizes.
const PREDECESSOR: Record<string, number> = {
  quantity: 100, freight_rate: 0.5, commission_rate: 1.25,
  loading_days: 0.5, discharging_days: 0.5, margin_days: 0.5, ballast_distance: 10, laden_distance: 10,
  cjk_laden_nm: 10, cjk_laden_mgo_consumption: 0.1, cjk_ballast_nm: 10, cjk_ballast_mgo_consumption: 0.1,
  qz_laden_nm: 10, qz_laden_mgo_consumption: 0.1, qz_ballast_nm: 10, qz_ballast_mgo_consumption: 0.1,
  ballast_speed: 0.5, laden_speed: 0.5, hfo_price: 50, mgo_price: 50,
  hfo_laden_consumption: 0.1, mgo_laden_consumption: 0.05, hfo_ballast_consumption: 0.1, mgo_ballast_consumption: 0.05,
  hfo_port_consumption: 0.1, mgo_port_consumption: 0.05,
  loading_cost: 500, discharging_cost: 500, lashing_cost: 100, cev_cost: 100, ilohc_cost: 100,
  shipowner_asking_tce: 100, market_benchmark: 100, go_threshold_pct: 0.1,
};

describe("stepper sizes (the up / down arrows), taken from the predecessor", () => {
  test("every numeric field has exactly the predecessor's step", () => {
    for (const [field, step] of Object.entries(PREDECESSOR)) expect(FIELD_STEPS[field], field).toBe(step);
  });
  test("every numeric form field has a step (vessel_dwt is a tier list, not a stepper)", () => {
    const numeric = ALL_FIELDS.filter(
      (f) => !STRING_FIELDS.has(f) && !BOOLEAN_FIELDS.has(f) && !LIST_FIELDS.has(f) && !PORT_LIST_FIELDS.has(f) && f !== "vessel_dwt",
    );
    for (const f of numeric) expect(FIELD_STEPS[f], `${f} has no step`).toBeGreaterThan(0);
    expect(Object.keys(FIELD_STEPS).sort()).toEqual([...numeric].sort());
  });
  test("v1.1: the two PDA fields step by half the predecessor's single port cost step, the rates and the Others amounts by 100", () => {
    expect(FIELD_STEPS.load_port_pda).toBe(500);
    expect(FIELD_STEPS.discharge_port_pda).toBe(500);
    expect(FIELD_STEPS.loading_rate).toBe(100);
    expect(FIELD_STEPS.discharging_rate).toBe(100);
    expect(OTHER_COST_STEP).toBe(100);
  });
  test("the total freight steps by 1000, as the predecessor's Total Freight field did", () => {
    expect(TOTAL_FREIGHT_STEP).toBe(1000);
  });
});
