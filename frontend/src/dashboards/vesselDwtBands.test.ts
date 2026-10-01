import { describe, expect, test } from "vitest";
import { DWT_BAND_LABELS, DWT_UNKNOWN, dwtBandColor, dwtBandLabel } from "./vesselDwtBands";

// [AMENDMENT 2026-09-24] A quote with no vessel DWT on record (0 / null — T2.34's historical cases
// whose title names no tonnage) used to be counted in "< 2000", which made that band wrong.
// It now has its own "unknown" group.
describe("dwtBandLabel", () => {
  test("no vessel DWT on record is its own unknown group, not '< 2000'", () => {
    for (const v of [0, null, undefined, -5]) expect(dwtBandLabel(v)).toBe(DWT_UNKNOWN);
    expect(DWT_BAND_LABELS).not.toContain(DWT_UNKNOWN);
  });

  test("a real small vessel is still '< 2000', and the tier edges are unchanged", () => {
    expect(dwtBandLabel(1500)).toBe("< 2000");
    expect(dwtBandLabel(2000)).toBe("2000–3000");
    expect(dwtBandLabel(5000)).toBe("5000–6000");
    expect(dwtBandLabel(25000)).toBe("> 20000");
  });

  test("the unknown group gets its own neutral colour", () => {
    expect(dwtBandColor(DWT_UNKNOWN)).toBe("#8C8C8C");
  });
});
