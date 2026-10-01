import { buildBunkerPrefillPatch, buildVesselPrefillPatch } from "./prefill";
import { makeBunker, makeVessel } from "../test/dto";

const today = new Date("2026-09-20T00:00:00Z");
const bunkerReq = { port: "Singapore" };
const bunkerCur = { bunkering_port: "Singapore" };

describe("F-Prefill", () => {
  test("S01 bunker result with both highs -> hfo_price = vlsfo_high, mgo_price = lsmgo_high", () => {
    expect(buildBunkerPrefillPatch(bunkerReq, bunkerCur, makeBunker(), today)).toEqual({ hfo_price: 520, mgo_price: 720 });
  });
  test("S02 only vlsfo_high non-null -> hfo_price set, mgo_price cleared (not left stale)", () => {
    expect(buildBunkerPrefillPatch(bunkerReq, bunkerCur, makeBunker({ lsmgo_high: null }), today)).toEqual({ hfo_price: 520, mgo_price: null });
  });
  test("S03 both highs null (NIL) -> prices cleared (found 2026-09-22: a stale price must not survive a lookup that found nothing usable)", () => {
    expect(buildBunkerPrefillPatch(bunkerReq, bunkerCur, makeBunker({ vlsfo_high: null, lsmgo_high: null }), today)).toEqual({ hfo_price: null, mgo_price: null });
  });
  test("S04 bunker result null -> prices cleared, not left stale", () => {
    expect(buildBunkerPrefillPatch(bunkerReq, bunkerCur, null, today)).toEqual({ hfo_price: null, mgo_price: null });
  });
  test("S05 vessel profile -> all 8 speed/consumption fields set", () => {
    const patch = buildVesselPrefillPatch({ dwt: 5000, hasCrane: false }, { vessel_dwt: 5000, has_crane: false }, makeVessel());
    expect(patch).toEqual(makeVessel());
    expect(Object.keys(patch)).toHaveLength(8);
  });
  test("S06 vessel result null -> empty patch", () => {
    expect(buildVesselPrefillPatch({ dwt: 5000, hasCrane: false }, { vessel_dwt: 5000, has_crane: false }, null)).toEqual({});
  });
  test("S07 the vessel patch never sets a field to null (its table has no 'nil' concept — a matched tier always fills all 8)", () => {
    const patches = [
      buildVesselPrefillPatch({ dwt: 5000, hasCrane: false }, { vessel_dwt: 5000, has_crane: false }, makeVessel()),
      buildVesselPrefillPatch({ dwt: 5000, hasCrane: false }, { vessel_dwt: 5000, has_crane: false }, null),
    ];
    for (const p of patches) expect(Object.values(p).some((v) => v === null)).toBe(false);
  });
  test("S07b a half-filled bunker result only clears the missing half, it does not null out the one that came back", () => {
    expect(buildBunkerPrefillPatch(bunkerReq, bunkerCur, makeBunker({ vlsfo_high: null }), today)).toEqual({ hfo_price: null, mgo_price: 720 });
  });
  test("S08 [REVIEW 4] bunker response for port A while the form's port is now B -> empty patch", () => {
    expect(buildBunkerPrefillPatch({ port: "Singapore" }, { bunkering_port: "Ningbo" }, makeBunker(), today)).toEqual({});
    expect(buildBunkerPrefillPatch({ port: "Singapore" }, { bunkering_port: null }, makeBunker(), today)).toEqual({});
  });
  test("S09 [REVIEW 4] bunker response for port A while the form's port is still A -> patch applied", () => {
    expect(buildBunkerPrefillPatch({ port: "Singapore" }, { bunkering_port: "Singapore" }, makeBunker(), today)).toEqual({
      hfo_price: 520,
      mgo_price: 720,
    });
  });
  test("S10 [REVIEW 4] vessel response for DWT 5000 while the form's DWT is now 8000 -> empty patch", () => {
    expect(buildVesselPrefillPatch({ dwt: 5000, hasCrane: false }, { vessel_dwt: 8000, has_crane: false }, makeVessel())).toEqual({});
    expect(buildVesselPrefillPatch({ dwt: 5000, hasCrane: false }, { vessel_dwt: null, has_crane: false }, makeVessel())).toEqual({});
  });
  test("S11 [REVIEW 4] crane flag differs but the tier has no crane variant (5000) -> equal, patch applied", () => {
    expect(Object.keys(buildVesselPrefillPatch({ dwt: 5000, hasCrane: false }, { vessel_dwt: 5000, has_crane: true }, makeVessel()))).toHaveLength(8);
    expect(Object.keys(buildVesselPrefillPatch({ dwt: 5000, hasCrane: true }, { vessel_dwt: 5000, has_crane: null }, makeVessel()))).toHaveLength(8);
  });
  test("S12 [REVIEW 4] crane flag differs for a crane tier (8000) -> empty patch", () => {
    for (const dwt of [8000, 9000, 10000]) {
      expect(buildVesselPrefillPatch({ dwt, hasCrane: true }, { vessel_dwt: dwt, has_crane: false }, makeVessel())).toEqual({});
      expect(Object.keys(buildVesselPrefillPatch({ dwt, hasCrane: false }, { vessel_dwt: dwt, has_crane: null }, makeVessel()))).toHaveLength(8);
    }
    expect(Object.keys(buildVesselPrefillPatch({ dwt: 8000, hasCrane: true }, { vessel_dwt: 8000, has_crane: true }, makeVessel()))).toHaveLength(8);
  });
});
