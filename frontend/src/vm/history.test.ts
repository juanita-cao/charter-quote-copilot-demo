import { buildHistoryRowsVM } from "./history";
import { makeDraftRow, makeQuoteRow } from "../test/dto";

describe("F-VM-History", () => {
  test("S01 quotes + drafts -> merged, newest first", () => {
    const rows = buildHistoryRowsVM(
      [makeQuoteRow({ id: 1, created_at: "2026-09-10T00:00:00Z" }), makeQuoteRow({ id: 2, created_at: "2026-09-18T00:00:00Z" })],
      [makeDraftRow({ id: 5, updated_at: "2026-09-15T00:00:00Z" })],
      "ALL",
    );
    expect(rows.map((r) => r.key)).toEqual(["q2", "d5", "q1"]);
  });
  test("S02 keys are q{id} / d{id}", () => {
    const rows = buildHistoryRowsVM([makeQuoteRow({ id: 12 })], [makeDraftRow({ id: 7 })], "ALL");
    expect(rows.map((r) => r.key).sort()).toEqual(["d7", "q12"]);
  });
  test("S03 draft row -> typeLabel DRAFT; quantity / rate / tce are null", () => {
    const [row] = buildHistoryRowsVM([], [makeDraftRow()], "ALL");
    expect(row).toMatchObject({ kind: "draft", typeLabel: "DRAFT", quantity: null, rate: null, tce: null });
  });
  test("S04 pill QUOTES / DRAFTS filters accordingly", () => {
    const q = [makeQuoteRow()];
    const d = [makeDraftRow()];
    expect(buildHistoryRowsVM(q, d, "QUOTES").map((r) => r.kind)).toEqual(["quote"]);
    expect(buildHistoryRowsVM(q, d, "DRAFTS").map((r) => r.kind)).toEqual(["draft"]);
    expect(buildHistoryRowsVM(q, d, "ALL")).toHaveLength(2);
  });
  test("S05 snapshot as an object -> values parsed", () => {
    expect(buildHistoryRowsVM([makeQuoteRow()], [], "ALL")[0].values?.route).toBe("Singapore-Shanghai");
  });
  test("S06 snapshot as a JSON string -> values parsed", () => {
    const row = makeQuoteRow();
    const asString = makeQuoteRow({ quote_input_snapshot: JSON.stringify(row.quote_input_snapshot) });
    expect(buildHistoryRowsVM([asString], [], "ALL")[0].values).toEqual(buildHistoryRowsVM([row], [], "ALL")[0].values);
  });
  test("S07 unparsable snapshot -> row kept, values=null, a WARN with the record id is logged", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const rows = buildHistoryRowsVM([makeQuoteRow({ id: 99, quote_input_snapshot: "{not json" })], [], "ALL");
    expect(rows).toHaveLength(1);
    expect(rows[0].values).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0].join(" "))).toContain("99");
    warn.mockRestore();
  });
  test("S08 both lists empty -> []", () => {
    expect(buildHistoryRowsVM([], [], "ALL")).toEqual([]);
  });
  test("S09 [REVIEW 6] quote row: vessel from values.vessel_name; quantity / rate / tce from their columns", () => {
    expect(buildHistoryRowsVM([makeQuoteRow()], [], "ALL")[0]).toMatchObject({
      vessel: "MV Test",
      quantity: 5000,
      rate: 20,
      tce: 9100,
      typeLabel: "GO",
      dateIso: "2026-09-18T10:00:00Z",
      route: "Singapore-Shanghai",
      cargo: "Steel coils",
    });
  });
  test("S10 [REVIEW 6] route column blank -> falls back to values.route", () => {
    const row = buildHistoryRowsVM([makeQuoteRow({ route: "   " })], [], "ALL")[0];
    expect(row.route).toBe("Singapore-Shanghai");
    const draft = buildHistoryRowsVM([], [makeDraftRow({ route: null })], "ALL")[0];
    expect(draft.route).toBe("Ningbo-Manila");
  });
  test("S11 [REVIEW 6] a draft whose raw_input_json contains quantity and rate still shows null", () => {
    const [row] = buildHistoryRowsVM([], [makeDraftRow()], "ALL");
    expect(row.values?.quantity).toBe(4000);
    expect(row.quantity).toBeNull();
    expect(row.rate).toBeNull();
    expect(row.tce).toBeNull();
  });
  test("S12 [REVIEW 6] quote row with decision = null -> typeLabel UNKNOWN", () => {
    expect(buildHistoryRowsVM([makeQuoteRow({ decision: null })], [], "ALL")[0].typeLabel).toBe("UNKNOWN");
  });
  test("S13 [REVIEW 6] the column wins when it disagrees with the snapshot; a malformed snapshot -> values null, vessel ''", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const disagree = makeQuoteRow({ route: "Column-Route", quantity: 111 });
    expect(buildHistoryRowsVM([disagree], [], "ALL")[0]).toMatchObject({ route: "Column-Route", quantity: 111 });
    const bad = buildHistoryRowsVM([makeQuoteRow({ quote_input_snapshot: "garbage", quantity: 222, tce: null })], [], "ALL")[0];
    expect(bad).toMatchObject({ values: null, vessel: "", quantity: 222, tce: null, route: "Singapore-Shanghai" });
    warn.mockRestore();
  });
  test("null numeric columns fall back to the snapshot for quantity / rate, and stay null when absent (never 0)", () => {
    const row = buildHistoryRowsVM([makeQuoteRow({ quantity: null, freight_rate: null })], [], "ALL")[0];
    expect(row.quantity).toBe(5000);
    expect(row.rate).toBe(20);
    const none = buildHistoryRowsVM([makeQuoteRow({ quantity: null, freight_rate: null, quote_input_snapshot: { route: "x" } })], [], "ALL")[0];
    expect(none.quantity).toBeNull();
    expect(none.rate).toBeNull();
  });
  test("cargo falls back to the snapshot when the column is null or blank, else ''", () => {
    expect(buildHistoryRowsVM([makeQuoteRow({ cargo_description: null })], [], "ALL")[0].cargo).toBe("Steel coils");
    expect(buildHistoryRowsVM([makeQuoteRow({ cargo_description: " ", quote_input_snapshot: null })], [], "ALL")[0].cargo).toBe("");
  });
});
