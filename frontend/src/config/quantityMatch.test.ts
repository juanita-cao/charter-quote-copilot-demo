import { describe, expect, test } from "vitest";
import { matchQuantity } from "./quantityMatch";

describe("matchQuantity", () => {
  test("a plain number + 吨 is a single match", () => {
    expect(matchQuantity("大连到蔚山4400吨饲料")).toEqual({ kind: "single", value: 4400 });
  });

  test("a plain number + MT/mts is a single match, case-insensitive", () => {
    expect(matchQuantity("843MT of steel")).toEqual({ kind: "single", value: 843 });
    expect(matchQuantity("2700mt of boric acid")).toEqual({ kind: "single", value: 2700 });
  });

  test("万 (ten-thousand) is converted", () => {
    expect(matchQuantity("1万吨化肥 积载1.3")).toEqual({ kind: "single", value: 10000 });
  });

  test("thousands separators and decimals are parsed", () => {
    expect(matchQuantity("Quantity:2,200MT")).toEqual({ kind: "single", value: 2200 });
    expect(matchQuantity("单重：58.23吨")).toEqual({ kind: "single", value: 58.23 });
  });

  test("a range is reported as a range, never resolved to one number (client decision 2026-09-23)", () => {
    expect(matchQuantity("贡布-厦门，7000-8000吨大理石")).toEqual({ kind: "range", min: 7000, max: 8000 });
    expect(matchQuantity("3000-4000吨钢板，常熟到光阳")).toEqual({ kind: "range", min: 3000, max: 4000 });
  });

  test("a range with 万 applies the conversion to both ends", () => {
    expect(matchQuantity("1-2万吨货物")).toEqual({ kind: "range", min: 10000, max: 20000 });
  });

  test("when several numbers appear, the earliest one wins — later ones are usually rates/weights/prices, not the quantity", () => {
    expect(matchQuantity("张家港-胡志明 6200吨\n硫酸铵什么价格 一天装5000吨/卸5000吨")).toEqual({ kind: "single", value: 6200 });
  });

  test("a range earlier in the text wins over a later single number", () => {
    expect(matchQuantity("4500—6000MT KAOLIN（2-3000MT IN BULK + 2-3000MT BAGS SF1.0）")).toEqual({ kind: "range", min: 4500, max: 6000 });
  });

  test("no number+unit at all returns null", () => {
    expect(matchQuantity("装港：珠海\n卸港：厦门")).toBeNull();
  });

  test("empty text returns null", () => {
    expect(matchQuantity("")).toBeNull();
  });
});
