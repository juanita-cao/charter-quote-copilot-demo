import { describe, expect, test } from "vitest";
import { buildQuantityRecognitionVM } from "./quantity";

describe("buildQuantityRecognitionVM", () => {
  test("no enquiry text -> empty, no caption (the enquiry-box notice belongs to cargo recognition)", () => {
    expect(buildQuantityRecognitionVM(null, null)).toEqual({ patch: {}, caption: null });
  });

  test("empty field + single-value match -> fill", () => {
    expect(buildQuantityRecognitionVM("大连到蔚山4400吨饲料", null)).toEqual({
      patch: { quantity: 4400 },
      caption: { kind: "ok", key: "quantityRecognised", params: { quantity: "4400" } },
    });
  });

  test("empty field + no match -> warn, no patch", () => {
    expect(buildQuantityRecognitionVM("装港：珠海\n卸港：厦门", null)).toEqual({
      patch: {},
      caption: { kind: "warn", key: "quantityNoMatch" },
    });
  });

  test("field has a value + no match -> kept, not silent", () => {
    expect(buildQuantityRecognitionVM("装港：珠海\n卸港：厦门", 4400)).toEqual({
      patch: {},
      caption: { kind: "warn", key: "quantityKept", params: { quantity: "4400" } },
    });
  });

  test("field has the same value already -> noop, no caption", () => {
    expect(buildQuantityRecognitionVM("大连到蔚山4400吨饲料", 4400)).toEqual({ patch: {}, caption: null });
  });

  test("field has a different value -> offer, never applied automatically", () => {
    expect(buildQuantityRecognitionVM("大连到蔚山4400吨饲料", 3000)).toEqual({
      patch: {},
      caption: { kind: "offer", key: "quantityOffer", params: { quantity: "4400", current: "3000" } },
      offerValue: 4400,
    });
  });

  test("a range is reported and never applied, regardless of whether the field is empty or already has a value", () => {
    expect(buildQuantityRecognitionVM("贡布-厦门，7000-8000吨大理石", null)).toEqual({
      patch: {},
      caption: { kind: "warn", key: "quantityRangeFound", params: { min: "7000", max: "8000" } },
    });
    expect(buildQuantityRecognitionVM("贡布-厦门，7000-8000吨大理石", 5000)).toEqual({
      patch: {},
      caption: { kind: "warn", key: "quantityRangeFound", params: { min: "7000", max: "8000" } },
    });
  });
});
