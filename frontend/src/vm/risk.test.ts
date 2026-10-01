import { buildRiskRowsVM, RISK_SCENARIO_KEYS } from "./risk";
import { makeRiskRow } from "../test/dto";

const rows = [
  makeRiskRow(),
  makeRiskRow({ scenario_name: "Port Cost", scenario_name_zh: "港口使费", delta: 5000, delta_step: 1000, delta_unit: "USD", estimated_tce: 8800, tce_impact: -300, decision: "NO-GO" }),
  makeRiskRow({ scenario_name: "Bunker Price", scenario_name_zh: "燃油价格", delta: 10, delta_step: 50, delta_unit: "%" }),
  makeRiskRow({ scenario_name: "Margin Days", scenario_name_zh: "富余天数", delta: 1, delta_step: 0.5, delta_unit: "day" }),
  makeRiskRow({ scenario_name: "Freight Rate", scenario_name_zh: "单吨运费", delta: -2, delta_step: 0.5, delta_unit: "USD/RT" }),
];

describe("F-VM-Risk", () => {
  test("S01 five rows -> five RiskRowVM, first isBase", () => {
    const vm = buildRiskRowsVM(rows, "en");
    expect(vm).toHaveLength(5);
    expect(vm[0].isBase).toBe(true);
    expect(vm.slice(1).every((r) => !r.isBase)).toBe(true);
  });
  test("S02 base row -> delta === null", () => {
    expect(buildRiskRowsVM(rows, "en")[0].delta).toBeNull();
  });
  test("S03 lang selects the name (one language at a time)", () => {
    expect(buildRiskRowsVM(rows, "zh")[1].name).toBe("港口使费");
    expect(buildRiskRowsVM(rows, "en")[1].name).toBe("Port Cost");
    expect("altName" in buildRiskRowsVM(rows, "en")[1]).toBe(false);
  });
  test("S04 delta_step / delta_unit and the numbers are carried through", () => {
    expect(buildRiskRowsVM(rows, "en")[1]).toEqual({
      key: "port_cost",
      name: "Port Cost",
      isBase: false,
      delta: 5000,
      deltaStep: 1000,
      deltaUnit: "USD",
      tce: 8800,
      tceImpact: -300,
      marginPct: 12,
      decision: "NO-GO",
    });
  });
  test("the override key of each editable row is the backend's stable key, by position (same rule as the predecessor)", () => {
    expect(RISK_SCENARIO_KEYS).toEqual(["port_cost", "bunker_price", "margin_days", "freight_rate"]);
    expect(buildRiskRowsVM(rows, "en").map((r) => r.key)).toEqual(["base", "port_cost", "bunker_price", "margin_days", "freight_rate"]);
  });
  test("more editable rows than known keys is a contract violation, not a silent mis-mapping", () => {
    expect(() => buildRiskRowsVM([...rows, makeRiskRow({ scenario_name: "Extra", delta: 1 })], "en")).toThrow();
  });
  test("an empty list yields an empty list", () => {
    expect(buildRiskRowsVM([], "en")).toEqual([]);
  });
});
