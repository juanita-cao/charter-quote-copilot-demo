import { isComplete } from "./guard";
import { REQUIRED_FIELDS } from "./fields";
import { completeForm } from "../test/fixtures";

describe("F-Guard-Complete", () => {
  test("S01 all required fields present -> true", () => {
    expect(isComplete(completeForm())).toBe(true);
  });
  test("S02 any one required field null -> false", () => {
    for (const f of REQUIRED_FIELDS) {
      expect(isComplete(completeForm({ [f]: null }))).toBe(false);
    }
  });
  test("S03 optional fields blank -> true", () => {
    expect(isComplete(completeForm({ contract_terms: null, vessel_dwt: null, has_crane: null }))).toBe(true);
  });
  test("S04 required string is whitespace only -> false", () => {
    expect(isComplete(completeForm({ route: "   " }))).toBe(false);
    expect(isComplete(completeForm({ route: "" }))).toBe(false);
  });
  test("S04b cargo description is optional (2026-09-24: a label, not a calculation input)", () => {
    expect(isComplete(completeForm({ cargo_description: "" }))).toBe(true);
    expect(isComplete(completeForm({ cargo_description: null }))).toBe(true);
  });
  test("S05 required number is NaN -> false", () => {
    expect(isComplete(completeForm({ quantity: Number.NaN }))).toBe(false);
    expect(isComplete(completeForm({ freight_rate: Number.POSITIVE_INFINITY }))).toBe(false);
  });
  test("S06 a field currently failing F-Field-Rules -> false (no request is sent)", () => {
    expect(isComplete(completeForm({ quantity: 0 }))).toBe(false);
    expect(isComplete(completeForm({ commission_rate: 101 }))).toBe(false);
  });
  test("an invalid OPTIONAL field also blocks (e.g. vessel_dwt = 2800.5)", () => {
    expect(isComplete(completeForm({ vessel_dwt: 2800.5 }))).toBe(false);
    expect(isComplete(completeForm({ loading_cost: -1 }))).toBe(false);
  });
  test("a boundary value that is valid stays complete", () => {
    expect(isComplete(completeForm({ commission_rate: 0, go_threshold_pct: 100, load_port_pda: 0 }))).toBe(true);
  });
});

describe("F-Guard-Complete v1.1", () => {
  test("days mode needs the days, rate mode needs the rate (per port)", () => {
    expect(isComplete(completeForm({ loading_days: null }))).toBe(false);
    expect(isComplete(completeForm({ loading_mode: "rate", loading_days: null, loading_rate: 2500 }))).toBe(true);
    expect(isComplete(completeForm({ loading_mode: "rate", loading_rate: null }))).toBe(false);
    expect(isComplete(completeForm({ discharging_mode: "rate", discharging_days: null, discharging_rate: 2000 }))).toBe(true);
    expect(isComplete(completeForm({ discharging_mode: "rate", discharging_rate: null }))).toBe(false);
  });
  test("the field the mode does not use is ignored, even when it holds an invalid value", () => {
    expect(isComplete(completeForm({ loading_mode: "days", loading_rate: -5 }))).toBe(true);
    expect(isComplete(completeForm({ loading_mode: "rate", loading_rate: 2500, loading_days: -1 }))).toBe(true);
  });
  test("a rate of zero or below is not valid in rate mode", () => {
    expect(isComplete(completeForm({ loading_mode: "rate", loading_rate: 0 }))).toBe(false);
  });
  test("both PDA fields are required; zero is fine", () => {
    expect(isComplete(completeForm({ load_port_pda: null }))).toBe(false);
    expect(isComplete(completeForm({ discharge_port_pda: null }))).toBe(false);
    expect(isComplete(completeForm({ load_port_pda: 0, discharge_port_pda: 0 }))).toBe(true);
  });
  test("Others: a half-filled row is incomplete, an untouched row is ignored, a negative amount is a valid credit", () => {
    expect(isComplete(completeForm({ other_costs: [{ name: "Fumigation", amount: null as unknown as number }] }))).toBe(false);
    expect(isComplete(completeForm({ other_costs: [{ name: "", amount: 100 }] }))).toBe(false);
    expect(isComplete(completeForm({ other_costs: [{ name: "", amount: null as unknown as number }] }))).toBe(true);
    expect(isComplete(completeForm({ other_costs: [{ name: "X", amount: -1 }] }))).toBe(true);
    expect(isComplete(completeForm({ other_costs: [{ name: "X", amount: 0 }] }))).toBe(true);
  });
  test("laycan: both ends or none, and the end not before the start", () => {
    expect(isComplete(completeForm({ laycan_start: "2026-11-10" }))).toBe(false);
    expect(isComplete(completeForm({ laycan_end: "2026-11-10" }))).toBe(false);
    expect(isComplete(completeForm({ laycan_start: "2026-11-15", laycan_end: "2026-11-10" }))).toBe(false);
    expect(isComplete(completeForm({ laycan_start: "2026-11-10", laycan_end: "2026-11-10" }))).toBe(true);
    expect(isComplete(completeForm({ laycan_start: "2026-11-10", laycan_end: "2026-11-15" }))).toBe(true);
  });
  test("dates, ports and notes are never required", () => {
    expect(isComplete(completeForm({ fill_in_date: null, load_port: null, cargo_notes: null }))).toBe(true);
  });
});
