import { parseSnapshot, snapshotNotice } from "./load";
import { collectForm } from "./collect";
import { blankFormValues } from "./fields";
import { completeForm } from "../test/fixtures";

describe("F-Form-Load", () => {
  const full = completeForm({ vessel_dwt: 2800, has_crane: true, contract_terms: "FIO/FILO", vessel_name: "V" });
  const asBody = collectForm(full);

  test("S01 snapshot is an object -> values populated", () => {
    expect(parseSnapshot(asBody)).toEqual(full);
  });
  test("S02 snapshot is a JSON string -> same result as S01", () => {
    expect(parseSnapshot(JSON.stringify(asBody))).toEqual(parseSnapshot(asBody));
  });
  test("S03 a draft with only route and cargo_description -> other fields null", () => {
    expect(parseSnapshot({ route: "A-B", cargo_description: "coal" })).toEqual({
      ...blankFormValues(),
      route: "A-B",
      cargo_description: "coal",
    });
  });
  test("S04 unknown extra keys are ignored", () => {
    const out = parseSnapshot({ ...asBody, route_custom: "x", whatever: 1 });
    expect(out).toEqual(full);
    expect(out).not.toHaveProperty("whatever");
  });
  test("S05 an unparsable string returns null", () => {
    expect(parseSnapshot("{not json")).toBeNull();
    expect(parseSnapshot("")).toBeNull();
  });
  test("S06 round trip: collect(load(x)) preserves every set value", () => {
    expect(collectForm(parseSnapshot(asBody)!)).toEqual(asBody);
    expect(collectForm(parseSnapshot(JSON.stringify(asBody))!)).toEqual(asBody);
  });
  test("non-object payloads (null, number, array, JSON scalar) return null", () => {
    expect(parseSnapshot(null)).toBeNull();
    expect(parseSnapshot(undefined)).toBeNull();
    expect(parseSnapshot(42)).toBeNull();
    expect(parseSnapshot([1, 2])).toBeNull();
    expect(parseSnapshot("42")).toBeNull();
    expect(parseSnapshot("[1]")).toBeNull();
  });
  test("a value of the wrong type becomes null instead of leaking through", () => {
    const out = parseSnapshot({ route: "A", quantity: "5000", has_crane: "yes", vessel_dwt: Number.NaN })!;
    expect(out.quantity).toBeNull();
    expect(out.has_crane).toBeNull();
    expect(out.vessel_dwt).toBeNull();
    expect(out.route).toBe("A");
  });
});

describe("parseSnapshot v1.1", () => {
  test("a snapshot without the new fields gets the defaults: days mode, no Others, dates empty", () => {
    const v = parseSnapshot({ route: "A" })!;
    expect(v.loading_mode).toBe("days");
    expect(v.discharging_mode).toBe("days");
    expect(v.other_costs).toEqual([]);
    expect(v.fill_in_date).toBeNull();
    expect(v.load_port).toBeNull();
  });
  test("the new fields are read", () => {
    const v = parseSnapshot({
      fill_in_date: "2026-09-21", laycan_start: "2026-11-10", laycan_end: "2026-11-15", load_port: "HOCHIMINH", cargo_notes: "note",
      loading_mode: "rate", loading_rate: 2500, discharging_days: 2, load_port_pda: 15000, discharge_port_pda: 15000,
      other_costs: [{ name: "Fumigation", amount: 800 }],
    })!;
    expect(v.loading_mode).toBe("rate");
    expect(v.loading_rate).toBe(2500);
    expect(v.load_port_pda).toBe(15000);
    expect(v.laycan_end).toBe("2026-11-15");
    expect(v.other_costs).toEqual([{ name: "Fumigation", amount: 800 }]);
  });
  test("an unknown mode falls back to days; malformed Others rows are dropped", () => {
    const v = parseSnapshot({ loading_mode: "auto", other_costs: [{ name: "ok", amount: 1 }, { name: 5, amount: 1 }, { name: "x", amount: "y" }, "z", null] })!;
    expect(v.loading_mode).toBe("days");
    expect(v.other_costs).toEqual([{ name: "ok", amount: 1 }]);
  });
});

describe("snapshotNotice: the backend's estimate marker", () => {
  test("an upgraded old record carries the marker", () => {
    expect(snapshotNotice({ _pda_split_estimated: true, load_port_pda: 1, discharge_port_pda: 1 })).toBe("pdaSplitEstimated");
    expect(snapshotNotice(JSON.stringify({ _pda_split_estimated: true }))).toBe("pdaSplitEstimated");
  });
  test("a record without it, or anything unreadable, has none", () => {
    expect(snapshotNotice({ load_port_pda: 1 })).toBeNull();
    expect(snapshotNotice({ _pda_split_estimated: false })).toBeNull();
    expect(snapshotNotice(null)).toBeNull();
    expect(snapshotNotice("not json")).toBeNull();
  });
});
