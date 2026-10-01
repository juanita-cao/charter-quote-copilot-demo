import { displayTotal, rateForTotal, totalFreight } from "./freightLink";

describe("freight link: quantity x rate = total (an input convenience, not a business result)", () => {
  test("total = quantity x rate when both are numbers", () => {
    expect(totalFreight(5000, 22)).toBe(110000);
    expect(totalFreight(3450, 43.47)).toBeCloseTo(149971.5, 6);
  });
  test("total is null while either side is blank or not a finite number", () => {
    expect(totalFreight(null, 22)).toBeNull();
    expect(totalFreight(5000, null)).toBeNull();
    expect(totalFreight(Number.NaN, 22)).toBeNull();
    expect(totalFreight(5000, Number.POSITIVE_INFINITY)).toBeNull();
  });

  test("editing the total with the quantity held fixed solves the freight rate (the predecessor's rule)", () => {
    expect(rateForTotal(121000, 5500)).toEqual({ ok: true, rate: 22 });
    expect(rateForTotal(150011.06, 3450)).toEqual({ ok: true, rate: Math.round((150011.06 / 3450) * 1e6) / 1e6 });
  });
  test("the solved rate is rounded to 6 decimals, like the predecessor, so a long division leaves no float residue", () => {
    expect(rateForTotal(100000, 3)).toEqual({ ok: true, rate: 33333.333333 });
    expect(rateForTotal(100000, 4347)).toEqual({ ok: true, rate: Math.round((100000 / 4347) * 1e6) / 1e6 });
  });
  test("a round trip stays within a cent for realistic quantities: total -> rate -> total", () => {
    for (const [total, qty] of [[150011.06, 3450], [110000, 5000], [99999.99, 8000], [1234567.89, 6500]] as const) {
      const r = rateForTotal(total, qty);
      if (!r.ok) throw new Error("expected ok");
      expect(Math.abs(totalFreight(qty, r.rate)! - total)).toBeLessThan(0.01);
    }
  });
  test("without a usable quantity the rate cannot be solved, and the reason is reported (nothing is guessed)", () => {
    expect(rateForTotal(100000, null)).toEqual({ ok: false, reason: "needQuantity" });
    expect(rateForTotal(100000, 0)).toEqual({ ok: false, reason: "needQuantity" });
    expect(rateForTotal(100000, -5)).toEqual({ ok: false, reason: "needQuantity" });
    expect(rateForTotal(100000, Number.NaN)).toEqual({ ok: false, reason: "needQuantity" });
  });
  test("a total that is not a positive number is invalid", () => {
    expect(rateForTotal(0, 5000)).toEqual({ ok: false, reason: "invalid" });
    expect(rateForTotal(-1, 5000)).toEqual({ ok: false, reason: "invalid" });
    expect(rateForTotal(Number.NaN, 5000)).toEqual({ ok: false, reason: "invalid" });
  });

  test("the displayed total is trimmed to two decimals without trailing zeros", () => {
    expect(displayTotal(110000)).toBe("110000");
    expect(displayTotal(149971.5)).toBe("149971.5");
    expect(displayTotal(150011.0649)).toBe("150011.06");
    expect(displayTotal(null)).toBe("");
  });
});
