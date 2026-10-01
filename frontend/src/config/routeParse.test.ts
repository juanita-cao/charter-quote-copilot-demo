import { describe, expect, test } from "vitest";
import { matchPorts } from "./portMatch";
import { proposeRoute } from "./routeParse";

describe("proposeRoute", () => {
  test("labelled 装港/卸港 gives a confident load/discharge order", () => {
    const text = "装港： 珠海\n卸港： 厦门\n受载期:10月初都行";
    const matches = matchPorts(text, []);
    expect(proposeRoute(text, matches)).toEqual([
      { port: "Zhuhai", role: "load" },
      { port: "Xiamen", role: "discharge" },
    ]);
  });

  test("labelled L/P and D/P gives a confident order, picking the port nearest each label among several mentioned", () => {
    const text = "L/P: 1SBP NAOETSU OR ISHIKARI, JAPAN\nD/P: 1SBP SON DUONG PORT, VIETNAM";
    const matches = matchPorts(text, []);
    expect(proposeRoute(text, matches)).toEqual([
      { port: "Naoetsu", role: "load" },
      { port: "Son Duong Port", role: "discharge" },
    ]);
  });

  test("two ports joined by 到 gives a confident order, first is load", () => {
    const text = "大连到秦皇岛 8800吨饲料";
    const matches = matchPorts(text, []);
    expect(proposeRoute(text, matches)).toEqual([
      { port: "Dalian", role: "load" },
      { port: "Qinhuangdao Pt", role: "discharge" },
    ]);
  });

  test("two ports joined by a hyphen gives a confident order", () => {
    const text = "SHANGHAI-YOKOHAMA equipment";
    const matches = matchPorts(text, []);
    expect(proposeRoute(text, matches)?.map((r) => r.role)).toEqual(["load", "discharge"]);
  });

  test("three or more ports with no labels: not confident, returns null", () => {
    const text = "大连到秦皇岛到蔚山 8800吨饲料";
    const matches = matchPorts(text, []);
    expect(proposeRoute(text, matches)).toBeNull();
  });

  test("two ports mentioned with no separator or label between them: not confident, returns null", () => {
    const text = "大连群山食用葡萄糖4400吨"; // the two port names are simply adjacent, no delimiter at all
    const matches = matchPorts(text, []);
    expect(proposeRoute(text, matches)).toBeNull();
  });

  test("fewer than two ports found: returns null", () => {
    expect(proposeRoute("Dalian only, nothing else", matchPorts("Dalian only, nothing else", []))).toBeNull();
    expect(proposeRoute("no ports here", [])).toBeNull();
  });
});
