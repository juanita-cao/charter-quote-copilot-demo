import { describe, expect, test } from "vitest";
import { buildLaycanRecognitionVM } from "./laycan";

const FILL_IN = "2026-09-23";

describe("buildLaycanRecognitionVM", () => {
  test("no enquiry text -> empty, no caption (the enquiry-box notice belongs to cargo recognition)", () => {
    expect(buildLaycanRecognitionVM(null, null, null, FILL_IN)).toEqual({ patch: {}, caption: null });
  });

  test("both fields empty + an exact match -> fill both", () => {
    expect(buildLaycanRecognitionVM("LAYCAN: 5-10TH, APR, 2025", null, null, FILL_IN)).toEqual({
      patch: { laycan_start: "2025-04-05", laycan_end: "2025-04-10" },
      caption: { kind: "ok", key: "laycanRecognised", params: { start: "2025-04-05", end: "2025-04-10" } },
    });
  });

  test("both fields empty + no match -> warn, no patch", () => {
    expect(buildLaycanRecognitionVM("装港：珠海\n卸港：厦门", null, null, FILL_IN)).toEqual({
      patch: {},
      caption: { kind: "warn", key: "laycanNoMatch" },
    });
  });

  test("a fuzzy phrase is reported directly, bypassing the fill/offer/kept engine entirely", () => {
    expect(buildLaycanRecognitionVM("受载期:七月下旬", "2026-01-01", "2026-01-05", FILL_IN)).toEqual({
      patch: {},
      caption: { kind: "warn", key: "laycanFuzzyFound", params: { text: "下旬" } },
    });
  });

  test("already has a value + no match -> kept, not silent", () => {
    expect(buildLaycanRecognitionVM("装港：珠海\n卸港：厦门", "2026-01-01", "2026-01-05", FILL_IN)).toEqual({
      patch: {},
      caption: { kind: "warn", key: "laycanKept", params: { start: "2026-01-01", end: "2026-01-05" } },
    });
  });

  test("already has the exact same range -> noop, no caption", () => {
    expect(buildLaycanRecognitionVM("LAYCAN: 5-10TH, APR, 2025", "2025-04-05", "2025-04-10", FILL_IN)).toEqual({ patch: {}, caption: null });
  });

  test("already has a different range -> offer, never applied automatically", () => {
    expect(buildLaycanRecognitionVM("LAYCAN: 5-10TH, APR, 2025", "2026-01-01", "2026-01-05", FILL_IN)).toEqual({
      patch: {},
      caption: {
        kind: "offer",
        key: "laycanOffer",
        params: { start: "2025-04-05", end: "2025-04-10", currentStart: "2026-01-01", currentEnd: "2026-01-05" },
      },
      offerValue: { start: "2025-04-05", end: "2025-04-10" },
    });
  });

  test("only one of the two fields already has a value: still counts as non-empty, so a match is offered, not auto-filled", () => {
    expect(buildLaycanRecognitionVM("LAYCAN: 5-10TH, APR, 2025", "2026-01-01", null, FILL_IN)).toEqual({
      patch: {},
      caption: {
        kind: "offer",
        key: "laycanOffer",
        params: { start: "2025-04-05", end: "2025-04-10", currentStart: "2026-01-01", currentEnd: "" },
      },
      offerValue: { start: "2025-04-05", end: "2025-04-10" },
    });
  });
});
