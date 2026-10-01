import { ALL_FIELDS } from "../form/fields";
import { ENQUIRY_FIELD, FIELD_GROUPS } from "./fieldGroups";

const rowsOf = (group: string) => FIELD_GROUPS.find((g) => g.key === group)!.rows.map((r) => r.map((f) => f.name));

describe("input layout: homogeneous fields share a row (client request 2026-09-20)", () => {
  test("every QuoteInput field appears exactly once across the groups", () => {
    // a control that edits several values (the days / rate switch) owns all of them
    const names = FIELD_GROUPS.flatMap((g) => g.rows.flat().flatMap((f) => (f.covers ?? [f.name]) as string[]));
    // "total_freight" is a linked view of quantity x rate, not a QuoteInput field: it is never sent to the backend
    expect(names.filter((n) => n === "total_freight")).toHaveLength(1);
    // the cargo notes are not in a group: they are the "Start from an enquiry" panel above the groups
    expect(names).not.toContain(ENQUIRY_FIELD);
    // load_port / discharge_port are derived from the voyage_ports sequence (v1.2, PT-21), not their own fields
    expect(names).not.toContain("load_port");
    expect(names).not.toContain("discharge_port");
    const all = [...names.filter((n) => n !== "total_freight"), ENQUIRY_FIELD, "load_port", "discharge_port"].sort();
    expect(all).toEqual([...ALL_FIELDS].sort());
    expect(new Set(all).size).toBe(all.length);
  });

  test("the seven groups keep their order, and no row holds more than three fields", () => {
    expect(FIELD_GROUPS.map((g) => g.key)).toEqual(["cargo", "vessel", "schedule", "special", "bunker", "costs", "benchmarks"]);
    for (const g of FIELD_GROUPS) for (const r of g.rows) expect(r.length).toBeLessThanOrEqual(3);
  });

  test("ballast and laden distance sit on one row, and so do ballast and laden speed", () => {
    expect(rowsOf("schedule")).toContainEqual(["ballast_distance", "laden_distance"]);
    expect(rowsOf("bunker")).toContainEqual(["ballast_speed", "laden_speed"]);
  });

  test("loading time, discharging time and the margin days share a row (the first two are days / rate switches)", () => {
    expect(rowsOf("schedule")).toContainEqual(["loading_days", "discharging_days", "margin_days"]);
    const timingRow = FIELD_GROUPS.find((g) => g.key === "schedule")!.rows.find((r) => r.some((f) => f.kind === "timing"))!;
    const timing = timingRow.filter((f) => f.kind === "timing");
    expect(timing.map((f) => f.covers)).toEqual([
      ["loading_mode", "loading_days", "loading_rate"],
      ["discharging_mode", "discharging_days", "discharging_rate"],
    ]);
  });

  test("Cargo & Voyage Terms: dates, then route, then cargo terms, then quantity and freight — load/discharge port moved to the voyage port sequence (v1.2, PT-21)", () => {
    expect(rowsOf("cargo")).toEqual([
      ["fill_in_date", "laycan_start", "laycan_end"],
      ["route"],
      ["cargo_description", "contract_terms", "commission_rate"],
      ["quantity", "freight_rate", "total_freight"],
    ]);
  });

  test("the voyage port sequence sits above ballast / laden distance in Voyage Schedule", () => {
    expect(rowsOf("schedule")).toContainEqual(["voyage_ports"]);
  });

  test("consumption fields are grouped by fuel: HFO ballast / laden / port, then MGO ballast / laden / port", () => {
    expect(rowsOf("bunker")).toContainEqual(["hfo_ballast_consumption", "hfo_laden_consumption", "hfo_port_consumption"]);
    expect(rowsOf("bunker")).toContainEqual(["mgo_ballast_consumption", "mgo_laden_consumption", "mgo_port_consumption"]);
  });

  test("the two fuel prices share a row with the bunkering port that fills them", () => {
    expect(rowsOf("bunker")).toContainEqual(["bunkering_port", "hfo_price", "mgo_price"]);
  });

  test("special passages pair ballast with laden for each of nm and MGO, per passage", () => {
    const rows = rowsOf("special");
    expect(rows).toContainEqual(["cjk_ballast_nm", "cjk_laden_nm"]);
    expect(rows).toContainEqual(["cjk_ballast_mgo_consumption", "cjk_laden_mgo_consumption"]);
    expect(rows).toContainEqual(["qz_ballast_nm", "qz_laden_nm"]);
    expect(rows).toContainEqual(["qz_ballast_mgo_consumption", "qz_laden_mgo_consumption"]);
  });

  test("voyage costs and the benchmark trio are rows of three", () => {
    expect(rowsOf("costs")).toEqual([
      ["load_port_pda", "discharge_port_pda", "loading_cost"],
      ["discharging_cost", "lashing_cost", "cev_cost"],
      ["ilohc_cost"],
      ["other_costs"],
    ]);
    expect(rowsOf("benchmarks")).toEqual([["shipowner_asking_tce", "market_benchmark", "go_threshold_pct"]]);
  });
});
