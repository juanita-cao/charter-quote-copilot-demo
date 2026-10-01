import { describe, expect, test } from "vitest";
import type { VoyagePort } from "../api/types";
import { dischargePortOf, ladenChain, loadPortOf, postDischargeChain, preLoadChain, validateVoyagePorts } from "./voyagePorts";

const w = (port: string): VoyagePort => ({ port, role: "waypoint" });
const load = (port: string): VoyagePort => ({ port, role: "load" });
const discharge = (port: string): VoyagePort => ({ port, role: "discharge" });

describe("loadPortOf / dischargePortOf", () => {
  test("null when the role is not tagged anywhere", () => {
    expect(loadPortOf([w("A")])).toBeNull();
    expect(dischargePortOf([w("A")])).toBeNull();
  });
  test("the tagged row's port, trimmed", () => {
    expect(loadPortOf([w("A"), load("  Busan  ")])).toBe("Busan");
    expect(dischargePortOf([load("A"), discharge("Tianjin")])).toBe("Tianjin");
  });
});

describe("preLoadChain (the ballast-in leg)", () => {
  test("empty with no load row", () => {
    expect(preLoadChain([w("A"), w("B")])).toEqual([]);
  });
  test("just the load port, with no waypoints before it", () => {
    expect(preLoadChain([load("Vostochny")])).toEqual(["Vostochny"]);
  });
  test("waypoints before the load row, in order, load row included", () => {
    expect(preLoadChain([w("Busan"), w("Ulsan"), load("Vostochny"), discharge("Tianjin")])).toEqual(["Busan", "Ulsan", "Vostochny"]);
  });
  test("a blank waypoint before the load row makes the whole chain unusable", () => {
    expect(preLoadChain([w("Busan"), w(""), load("Vostochny")])).toEqual([]);
  });
});

describe("postDischargeChain (the ballast-out leg)", () => {
  test("empty with no discharge row", () => {
    expect(postDischargeChain([load("A")])).toEqual([]);
  });
  test("just the discharge port, when nothing follows it", () => {
    expect(postDischargeChain([load("A"), discharge("Tianjin")])).toEqual(["Tianjin"]);
  });
  test("discharge row plus whatever comes after", () => {
    expect(postDischargeChain([load("A"), discharge("Tianjin"), w("Dalian")])).toEqual(["Tianjin", "Dalian"]);
  });
});

describe("ladenChain (the loaded leg)", () => {
  test("empty when either tag is missing", () => {
    expect(ladenChain([load("A")])).toEqual([]);
    expect(ladenChain([discharge("A")])).toEqual([]);
  });
  test("empty when discharge is not after load", () => {
    expect(ladenChain([discharge("A"), load("B")])).toEqual([]);
  });
  test("load through discharge, including a stop in between", () => {
    expect(ladenChain([load("Vostochny"), w("CJK"), discharge("Nantong")])).toEqual(["Vostochny", "CJK", "Nantong"]);
  });
});

describe("an invalid sequence chains nothing at all (found 2026-09-22)", () => {
  // Reordering into an invalid sequence used to leave preLoadChain and postDischargeChain both anchored on the same
  // rows (each only looks at "where is my own tag", not the other tag's position), so ballast_distance double-
  // counted one leg while laden_distance correctly went to []. All three must agree: an invalid sequence chains
  // nothing, full stop.
  test("discharge before load: no chain, not even a partial/duplicated one", () => {
    const rows = [discharge("Shanghai"), load("Busan")];
    expect(preLoadChain(rows)).toEqual([]);
    expect(postDischargeChain(rows)).toEqual([]);
    expect(ladenChain(rows)).toEqual([]);
  });

  test("two load rows: no chain either", () => {
    const rows = [load("A"), load("B"), discharge("C")];
    expect(preLoadChain(rows)).toEqual([]);
    expect(postDischargeChain(rows)).toEqual([]);
    expect(ladenChain(rows)).toEqual([]);
  });
});

describe("validateVoyagePorts", () => {
  test("a normal sequence is valid", () => {
    expect(validateVoyagePorts([w("A"), load("B"), discharge("C")])).toBeNull();
  });
  test("no load or discharge tagged yet is valid (mid-edit)", () => {
    expect(validateVoyagePorts([w("A"), w("B")])).toBeNull();
  });
  test("two load rows is an error", () => {
    expect(validateVoyagePorts([load("A"), load("B"), discharge("C")])).toBe("duplicateLoad");
  });
  test("two discharge rows is an error", () => {
    expect(validateVoyagePorts([load("A"), discharge("B"), discharge("C")])).toBe("duplicateDischarge");
  });
  test("discharge before load is an error", () => {
    expect(validateVoyagePorts([discharge("A"), load("B")])).toBe("dischargeBeforeLoad");
  });
});
