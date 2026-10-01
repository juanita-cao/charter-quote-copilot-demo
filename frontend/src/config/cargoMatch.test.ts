import { describe, expect, test } from "vitest";
import { matchCargo } from "./cargoMatch";

// Cargo recognition, PT-18 first slice (design_backend.md §18, design_frontend.md §13): rule-based dictionary match
// against pasted enquiry text, no LLM, mirrors the port dictionary's approach.

describe("matchCargo", () => {
  test("matches a Chinese-only concept", () => {
    expect(matchCargo("大连到群山4400吨饲料，6月7号前ETA")).toBe("饲料");
  });

  test("matches an English-only concept with a word boundary (does not fire on a substring inside another word)", () => {
    expect(matchCargo("ABOUT 5140MT PET IN BIG BAG 4660 BAGS SF:1.4WOG")).toBe("PET");
    expect(matchCargo("a large carpet was delivered")).toBeNull();
  });

  test("matches a concept with both a Chinese and an English surface form, from either language", () => {
    expect(matchCargo("5000吨吨袋硫酸铵，天津到海参崴")).toBe("硫酸铵");
    expect(matchCargo("散装硫酸铵")).toBe("硫酸铵");
  });

  test("is case-insensitive for English forms", () => {
    expect(matchCargo("dolomite in bulk, 5000mt")).toBe("白云石");
    expect(matchCargo("DOLOMITE IN BULK")).toBe("白云石");
  });

  test("no dictionary term present returns null, not an error", () => {
    expect(matchCargo("这段话里完全没有提到任何货物名称")).toBeNull();
  });

  test("empty text returns null", () => {
    expect(matchCargo("")).toBeNull();
  });
});
