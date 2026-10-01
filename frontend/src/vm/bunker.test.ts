import { buildBunkerAutofillVM } from "./bunker";
import { makeBunker } from "../test/dto";

const today = new Date("2026-09-20T00:00:00Z");
const req = { port: "Singapore" };
const cur = { bunkering_port: "Singapore" };

describe("F-VM-Bunker", () => {
  test("S01 fresh, confident report -> caption ok, patch set", () => {
    const vm = buildBunkerAutofillVM(req, cur, makeBunker({ report_date: "2026-09-19" }), today);
    expect(vm.caption).toMatchObject({ kind: "ok", key: "ok" });
    expect(vm.patch).toEqual({ hfo_price: 520, mgo_price: 720 });
  });
  test("S02 report older than 5 days -> caption stale, the patch is still set", () => {
    const vm = buildBunkerAutofillVM(req, cur, makeBunker({ report_date: "2026-09-14" }), today);
    expect(vm.caption).toMatchObject({ kind: "warn", key: "stale" });
    expect(vm.patch).toEqual({ hfo_price: 520, mgo_price: 720 });
  });
  test("the 5-day boundary: exactly 5 days old is not stale, 6 is", () => {
    expect(buildBunkerAutofillVM(req, cur, makeBunker({ report_date: "2026-09-15" }), today).caption?.key).toBe("ok");
    expect(buildBunkerAutofillVM(req, cur, makeBunker({ report_date: "2026-09-14" }), today).caption?.key).toBe("stale");
  });
  test("S03 vote_agreement < 0.6 -> caption lowConfidence, the patch is still set", () => {
    const vm = buildBunkerAutofillVM(req, cur, makeBunker({ report_date: "2026-09-19", vote_agreement: 0.59 }), today);
    expect(vm.caption).toMatchObject({ kind: "warn", key: "lowConfidence" });
    expect(vm.patch).toEqual({ hfo_price: 520, mgo_price: 720 });
    expect(buildBunkerAutofillVM(req, cur, makeBunker({ report_date: "2026-09-19", vote_agreement: 0.6 }), today).caption?.key).toBe("ok");
  });
  test("S04 both highs null -> caption nil, prices cleared (not left stale)", () => {
    const vm = buildBunkerAutofillVM(req, cur, makeBunker({ vlsfo_high: null, lsmgo_high: null }), today);
    expect(vm.caption?.key).toBe("nil");
    expect(vm.patch).toEqual({ hfo_price: null, mgo_price: null });
  });
  test("S05 result null -> caption noData, prices cleared (found 2026-09-22: a stale price from a previous port must not sit next to this warning)", () => {
    const vm = buildBunkerAutofillVM(req, cur, null, today);
    expect(vm.caption?.key).toBe("noData");
    expect(vm.patch).toEqual({ hfo_price: null, mgo_price: null });
  });
  test("S06 [REVIEW 7] both stale and low-confidence -> patch set, caption stale (precedence)", () => {
    const vm = buildBunkerAutofillVM(req, cur, makeBunker({ report_date: "2026-09-01", vote_agreement: 0.3 }), today);
    expect(vm.caption?.key).toBe("stale");
    expect(vm.patch).toEqual({ hfo_price: 520, mgo_price: 720 });
  });
  test("[REVIEW 4] request/form mismatch -> empty patch and NO caption, even for a null result", () => {
    const other = { bunkering_port: "Ningbo" };
    expect(buildBunkerAutofillVM(req, other, makeBunker(), today)).toEqual({ patch: {}, caption: null });
    expect(buildBunkerAutofillVM(req, other, null, today)).toEqual({ patch: {}, caption: null });
  });
  test("the stale caption carries the report date and age as params", () => {
    const vm = buildBunkerAutofillVM(req, cur, makeBunker({ report_date: "2026-09-10" }), today);
    expect(vm.caption?.params).toMatchObject({ date: "2026-09-10", days: "10" });
  });
});
