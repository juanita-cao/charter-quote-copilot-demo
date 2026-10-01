import { describe, expect, test } from "vitest";
import { matchPorts } from "./portMatch";

describe("matchPorts", () => {
  // The standard port list (ports.json, from UN/LOCODE) has English/romanized names and aliases only — no Chinese
  // names (design_backend.md §20 finding, 2026-09-23). A Chinese enquiry's port names (大连, 天津 …) will not match
  // until that gap is addressed; these tests use the English/pinyin spellings the dictionary actually has.
  test("finds standard ports mentioned in route text, in text order", () => {
    const matches = matchPorts("Dalian to Qinhuangdao Pt to Ulsan, 8800mt feed", []);
    expect(matches.map((m) => m.name)).toEqual(["Dalian", "Qinhuangdao Pt", "Ulsan"]);
  });

  test("finds a Chinese name and reports it under the canonical English name (design_backend.md §20)", () => {
    const matches = matchPorts("大连到秦皇岛到蔚山 8800吨饲料", []);
    expect(matches.map((m) => m.name)).toEqual(["Dalian", "Qinhuangdao Pt", "Ulsan"]);
  });

  test("finds an alias and reports it under the canonical name", () => {
    const matches = matchPorts("export from Bayuquan to Kunsan, pyrophyllite, no packing", []);
    expect(matches.map((m) => m.name)).toContain("Gunsan");
    expect(matches.map((m) => m.name)).not.toContain("Kunsan");
  });

  test("finds an English port name with a word boundary, case-insensitively", () => {
    const matches = matchPorts("qinzhou to kunsan, abt 4000mt wood chips", []);
    expect(matches.map((m) => m.name)).toContain("Qinzhou");
  });

  test("short standard-list names (<=3 chars) are never matched — collision risk with ordinary words", () => {
    // "Rye", "Med", "Par" are all real (short) UN/LOCODE port names; this text is not about any of them.
    const matches = matchPorts("we will need to sort out a party for the medium-sized vessel", []);
    expect(matches.map((m) => m.name)).not.toContain("Rye");
    expect(matches.map((m) => m.name)).not.toContain("Med");
    expect(matches.map((m) => m.name)).not.toContain("Par");
  });

  test("includes the caller's custom ports alongside the standard list", () => {
    const matches = matchPorts("大连到 Bahodopi 8000吨", ["Bahodopi"]);
    expect(matches.map((m) => m.name)).toEqual(["Dalian", "Bahodopi"]);
  });

  test("no port mentioned returns an empty list, not an error", () => {
    expect(matchPorts("这段话里完全没有提到任何港口名称", [])).toEqual([]);
  });

  test("empty text returns an empty list", () => {
    expect(matchPorts("", [])).toEqual([]);
  });

  test("results are capped, so a text mentioning many ports does not produce an unusable proposal", () => {
    const manyPorts = "Singapore Rotterdam Hamburg Antwerp Shanghai Busan Yokohama Kaohsiung Hong Kong Tianjin Qingdao Ningbo Xiamen Dalian";
    const matches = matchPorts(manyPorts, []);
    expect(matches.length).toBeLessThanOrEqual(12);
  });
});
