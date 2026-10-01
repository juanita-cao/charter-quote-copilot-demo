import { collectForm } from "./collect";
import { ALL_FIELDS } from "./fields";
import { completeForm } from "../test/fixtures";

describe("F-Form-Collect", () => {
  test("S01 blank optional fields -> keys omitted, not null or 0", () => {
    const body = collectForm(completeForm({ contract_terms: "", vessel_name: "   ", vessel_dwt: null, loading_cost: null }));
    for (const k of ["contract_terms", "vessel_name", "vessel_dwt", "loading_cost", "bunkering_port", "has_crane"]) {
      expect(Object.prototype.hasOwnProperty.call(body, k)).toBe(false);
    }
  });
  test("S02 numbers are sent as numbers, not strings", () => {
    const body = collectForm(completeForm({ vessel_dwt: 2800 }));
    expect(body.quantity).toBe(5000);
    expect(typeof body.quantity).toBe("number");
    expect(body.vessel_dwt).toBe(2800);
  });
  test("S03 strings with padding are trimmed", () => {
    const body = collectForm(completeForm({ route: "  A-B  ", contract_terms: " FILO " }));
    expect(body.route).toBe("A-B");
    expect(body.contract_terms).toBe("FILO");
  });
  test("S04 the output never contains null", () => {
    const body = collectForm(completeForm());
    expect(Object.values(body).some((v) => v === null)).toBe(false);
    expect(Object.keys(body).length).toBe(25); // 23 always required + the two days fields (days mode)
  });
  test("S05 has_crane false is sent (a boolean is a value, not blank)", () => {
    expect(collectForm(completeForm({ has_crane: false })).has_crane).toBe(false);
    expect(collectForm(completeForm({ has_crane: true })).has_crane).toBe(true);
  });
  test("S06 a non-finite number throws", () => {
    expect(() => collectForm(completeForm({ quantity: Number.NaN }))).toThrow();
    expect(() => collectForm(completeForm({ load_port_pda: Number.POSITIVE_INFINITY }))).toThrow();
  });
  test("a custom contract_terms value is sent verbatim; a set numeric optional zero is sent", () => {
    const body = collectForm(completeForm({ contract_terms: "FIO/FILO", loading_cost: 0 }));
    expect(body.contract_terms).toBe("FIO/FILO");
    expect(body.loading_cost).toBe(0);
  });
  test("no key outside QuoteInput is ever emitted (no _custom twins)", () => {
    const body = collectForm(completeForm({ vessel_dwt: 2800, has_crane: true, vessel_name: "V", bunkering_port: "Singapore" }));
    for (const k of Object.keys(body)) expect(ALL_FIELDS as readonly string[]).toContain(k);
  });
});

import { collectDraftBody } from "./collect";
import { blankFormValues } from "./fields";

describe("collectDraftBody (Save Draft, SA-21)", () => {
  test("an incomplete form is sent as-is, without null / blank keys", () => {
    expect(collectDraftBody({ ...blankFormValues(), route: " A-B ", cargo_description: "", quantity: 5000 })).toEqual({ route: "A-B", quantity: 5000 });
  });
  test("an empty form yields an empty dict (a draft is always allowed)", () => {
    expect(collectDraftBody(blankFormValues())).toEqual({});
  });
  test("NaN and Infinity are dropped instead of throwing; booleans are kept", () => {
    expect(collectDraftBody({ ...blankFormValues(), quantity: Number.NaN, freight_rate: Number.POSITIVE_INFINITY, has_crane: false, vessel_dwt: 2800 })).toEqual({
      has_crane: false,
      vessel_dwt: 2800,
    });
  });
});

describe("collectForm v1.1: dates, ports, notes, the days / rate mode, PDA pair, Others", () => {
  test("a port in days mode sends its days and no rate; in rate mode its rate and no days", () => {
    const days = collectForm(completeForm({ loading_mode: "days", loading_days: 3.5, loading_rate: 2500 }));
    expect(days.loading_days).toBe(3.5);
    expect("loading_rate" in days).toBe(false);
    expect("loading_mode" in days).toBe(false); // days is the default: nothing to say

    const rate = collectForm(completeForm({ loading_mode: "rate", loading_days: 3.5, loading_rate: 2500 }));
    expect(rate.loading_mode).toBe("rate");
    expect(rate.loading_rate).toBe(2500);
    expect("loading_days" in rate).toBe(false);
  });
  test("loading and discharging are independent", () => {
    const body = collectForm(completeForm({ loading_mode: "rate", loading_rate: 2500, discharging_mode: "days", discharging_days: 2 }));
    expect(body.loading_mode).toBe("rate");
    expect(body.discharging_days).toBe(2);
    expect("discharging_mode" in body).toBe(false);
  });
  test("dates, ports and notes are sent trimmed; blank ones are omitted", () => {
    const body = collectForm(
      completeForm({ fill_in_date: "2026-09-21", laycan_start: "2026-11-10", laycan_end: "2026-11-15", load_port: " HOCHIMINH ", discharge_port: "", cargo_notes: "line 1\nline 2 " }),
    );
    expect(body.fill_in_date).toBe("2026-09-21");
    expect(body.laycan_start).toBe("2026-11-10");
    expect(body.load_port).toBe("HOCHIMINH");
    expect("discharge_port" in body).toBe(false);
    expect(body.cargo_notes).toBe("line 1\nline 2");
  });
  test("both PDA fields are sent, and there is no port_cost", () => {
    const body = collectForm(completeForm({ load_port_pda: 1000, discharge_port_pda: 0 }));
    expect(body.load_port_pda).toBe(1000);
    expect(body.discharge_port_pda).toBe(0);
    expect("port_cost" in body).toBe(false);
  });
  test("Others: complete rows are sent as {name, amount}; an empty list is omitted", () => {
    expect("other_costs" in collectForm(completeForm({ other_costs: [] }))).toBe(false);
    const body = collectForm(completeForm({ other_costs: [{ name: " Fumigation ", amount: 800 }, { name: "Survey", amount: 0 }] }));
    expect(body.other_costs).toEqual([{ name: "Fumigation", amount: 800 }, { name: "Survey", amount: 0 }]);
  });
  test("Others: a row nobody filled in is dropped", () => {
    const body = collectForm(completeForm({ other_costs: [{ name: "", amount: null as unknown as number }, { name: "X", amount: 5 }] }));
    expect(body.other_costs).toEqual([{ name: "X", amount: 5 }]);
  });
});

describe("collectDraftBody v1.1", () => {
  test("keeps what was typed: both the days and the rate, Others rows as typed, the mode only when it is rate", () => {
    const body = collectDraftBody({
      ...blankFormValues(),
      loading_mode: "rate",
      loading_days: 3,
      loading_rate: 2500,
      other_costs: [{ name: "Fumigation", amount: 800 }, { name: "Half", amount: null as unknown as number }],
    });
    expect(body).toEqual({
      loading_mode: "rate",
      loading_days: 3,
      loading_rate: 2500,
      other_costs: [{ name: "Fumigation", amount: 800 }, { name: "Half" }],
    });
  });
  test("the defaults (days mode, no Others) add nothing", () => {
    expect(collectDraftBody({ ...blankFormValues(), route: "A" })).toEqual({ route: "A" });
  });
});
