import { describe, expect, test } from "vitest";
import { matchTerms } from "./termsMatch";

describe("matchTerms", () => {
  test("matches each contract term, case-insensitively, with a word boundary", () => {
    expect(matchTerms("CARGO: STEEL SCRAP\nL/D RATES: 700/800 MT PWWD SHINC\nFRT: INVITE OWS BSS 1/1 FILO")).toBe("FILO");
    expect(matchTerms("fio terms apply")).toBe("FIO");
  });

  test("FIO and FILO do not falsely match each other", () => {
    expect(matchTerms("terms are FILO only")).toBe("FILO");
    expect(matchTerms("terms are FIO only")).toBe("FIO");
  });

  test("no contract term present returns null", () => {
    expect(matchTerms("5000吨吨袋氯化钙，大连到釜山")).toBeNull();
  });

  test("empty text returns null", () => {
    expect(matchTerms("")).toBeNull();
  });
});
