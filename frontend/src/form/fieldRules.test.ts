import { validateField, FIELD_RULES, laycanHint } from "./fieldRules";

describe("F-Field-Rules", () => {
  test("S01 quantity = 0 -> hint (must be > 0)", () => {
    expect(validateField("quantity", 0)).toBe("mustBeGreaterThanZero");
  });
  test("S02 quantity = 1 -> no hint", () => {
    expect(validateField("quantity", 1)).toBeNull();
  });
  test("S03 commission_rate 100 ok, 101 hint, -1 hint", () => {
    expect(validateField("commission_rate", 100)).toBeNull();
    expect(validateField("commission_rate", 0)).toBeNull();
    expect(validateField("commission_rate", 101)).toBe("mustBeBetween0And100");
    expect(validateField("commission_rate", -1)).toBe("mustBeBetween0And100");
  });
  test("S04 vessel_dwt = 2800 (custom, not a tier) -> no hint", () => {
    expect(validateField("vessel_dwt", 2800)).toBeNull();
  });
  test("S05 vessel_dwt = 2800.5 -> hint (whole number)", () => {
    expect(validateField("vessel_dwt", 2800.5)).toBe("mustBeWholeNumber");
  });
  test("S06 vessel_dwt = -1 -> hint", () => {
    expect(validateField("vessel_dwt", -1)).toBe("mustBeAtLeastZero");
  });
  test("S07 vessel_dwt = 'abc' -> hint", () => {
    expect(validateField("vessel_dwt", "abc")).toBe("mustBeANumber");
    expect(validateField("vessel_dwt", Number.NaN)).toBe("mustBeANumber");
  });
  test("S08 contract_terms blank -> no hint", () => {
    expect(validateField("contract_terms", "")).toBeNull();
    expect(validateField("contract_terms", null)).toBeNull();
  });
  test("S09 contract_terms custom text -> no hint", () => {
    expect(validateField("contract_terms", "FIO/FILO")).toBeNull();
  });
  test("S10 ballast_speed = 0 -> hint (must be > 0)", () => {
    expect(validateField("ballast_speed", 0)).toBe("mustBeGreaterThanZero");
    expect(validateField("laden_speed", 0)).toBe("mustBeGreaterThanZero");
    expect(validateField("freight_rate", 0)).toBe("mustBeGreaterThanZero");
  });

  test("every other numeric field is >= 0", () => {
    expect(validateField("port_cost", 0)).toBeNull();
    expect(validateField("load_port_pda", -0.01)).toBe("mustBeAtLeastZero");
    expect(validateField("qz_ballast_nm", -5)).toBe("mustBeAtLeastZero");
  });
  test("a blank numeric field gets no hint (completeness is the guard's job)", () => {
    expect(validateField("quantity", null)).toBeNull();
    expect(validateField("quantity", "")).toBeNull();
  });
  test("fields without numeric rules never produce a hint", () => {
    expect(validateField("route", "x")).toBeNull();
    expect(validateField("has_crane", true)).toBeNull();
  });
  test("FIELD_RULES exposes the numeric constraints as data (pinned to the backend by CT-05)", () => {
    expect(FIELD_RULES.quantity).toEqual({ exclusiveMin: 0 });
    expect(FIELD_RULES.commission_rate).toEqual({ min: 0, max: 100 });
    expect(FIELD_RULES.go_threshold_pct).toEqual({ min: 0, max: 100 });
    expect(FIELD_RULES.vessel_dwt).toEqual({ min: 0, integer: true });
    expect(FIELD_RULES.load_port_pda).toEqual({ min: 0 });
    expect(FIELD_RULES.loading_rate).toEqual({ exclusiveMin: 0 });
  });
});

describe("F-Field-Rules v1.1", () => {
  test("the rates must be greater than 0", () => {
    expect(validateField("loading_rate", 0)).toBe("mustBeGreaterThanZero");
    expect(validateField("discharging_rate", 2000)).toBeNull();
  });
  test("the two PDA fields are 0 or more", () => {
    expect(validateField("load_port_pda", -1)).toBe("mustBeAtLeastZero");
    expect(validateField("discharge_port_pda", 0)).toBeNull();
  });
  test("there is no rule for port_cost any more, nor for text, date or list fields", () => {
    expect("port_cost" in FIELD_RULES).toBe(false);
    for (const f of ["fill_in_date", "laycan_start", "load_port", "cargo_notes", "loading_mode", "other_costs"]) expect(f in FIELD_RULES).toBe(false);
  });
  test("laycan order hint", () => {
    expect(laycanHint("2026-11-15", "2026-11-10")).toBe("laycanOrder");
    expect(laycanHint("2026-11-10", "2026-11-10")).toBeNull();
    expect(laycanHint(null, "2026-11-10")).toBeNull(); // one end only is a completeness matter, not an order hint
  });
});
