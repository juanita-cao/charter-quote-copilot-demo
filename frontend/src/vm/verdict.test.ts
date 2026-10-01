import { buildSandboxVM, buildVerdictVM } from "./verdict";
import { collectForm } from "../form/collect";
import { completeForm } from "../test/fixtures";
import { makeDecision, makeQuoteResult } from "../test/dto";

const snapshot = collectForm(completeForm({ quantity: 3450, freight_rate: 43.47, shipowner_asking_tce: 4000 }));
const withRevenue = (revenue: number) => {
  const r = makeQuoteResult({ inputs_snapshot: snapshot });
  r.tce_result.freight_revenue = revenue;
  return r;
};

describe("F-VM-Verdict (client layout: Estimated TCE cards)", () => {
  test("S01 GO result -> every card value mapped, and the approved KPI / spread mappings are preserved", () => {
    const res = makeQuoteResult({ inputs_snapshot: snapshot, spread_vs_shipowner_ask: 96.28, spread_vs_market_benchmark: 55.5, profit_margin_pct: 1.32, operator_profit_usd: 1974.78 });
    res.tce_result.freight_revenue = 149971.5;
    const vm = buildVerdictVM(res);
    expect(vm).toEqual({
      decision: "GO",
      reason: "Margin 12% exceeds the 10% threshold",
      reasonZh: null,
      marginPct: 1.32,
      operatorProfitUsd: 1974.78,
      freightRate: 43.47,
      totalFreightUsd: 149971.5,
      ownerAskTce: 4000,
      kpis: { tce: 9100, totalDays: 14, voyageCost: 90000, netIncome: 120000 },
      spreads: { vsOwnerAsk: 96.28, vsMarket: 55.5 },
      ownerAskNegative: false,
    });
  });
  test("S02 NO-GO result -> decision NO-GO", () => {
    expect(buildVerdictVM(makeQuoteResult({ decision: "NO-GO" })).decision).toBe("NO-GO");
  });
  test("S03 owner-ask spread < 0 -> ownerAskNegative=true (sign only, value untouched)", () => {
    const vm = buildVerdictVM(makeQuoteResult({ spread_vs_shipowner_ask: -50 }));
    expect(vm.ownerAskNegative).toBe(true);
    expect(vm.spreads.vsOwnerAsk).toBe(-50);
  });
  test("S04 owner-ask spread exactly 0 -> false", () => {
    expect(buildVerdictVM(makeQuoteResult({ spread_vs_shipowner_ask: 0 })).ownerAskNegative).toBe(false);
  });
  test("S05 reason is passed through verbatim", () => {
    const reason = "  Odd   spacing & <b>markup</b>  ";
    expect(buildVerdictVM(makeQuoteResult({ reason })).reason).toBe(reason);
  });
  test("S06 a required field missing -> throws (including inputs_snapshot values the cards need)", () => {
    const bad = makeQuoteResult();
    delete (bad.tce_result as Partial<typeof bad.tce_result>).tce;
    expect(() => buildVerdictVM(bad)).toThrow();
    const bad2 = makeQuoteResult();
    delete (bad2.deal_decision as Partial<typeof bad2.deal_decision>).profit_margin_pct;
    expect(() => buildVerdictVM(bad2)).toThrow();
    const bad3 = makeQuoteResult();
    delete (bad3.tce_result as Partial<typeof bad3.tce_result>).freight_revenue;
    expect(() => buildVerdictVM(bad3)).toThrow();
    const bad4 = makeQuoteResult();
    delete (bad4.deal_decision.inputs_snapshot as Partial<typeof snapshot>).freight_rate;
    expect(() => buildVerdictVM(bad4)).toThrow();
  });
});

describe("Total Freight comes from the backend (T2.29), never from a client-side product", () => {
  test("the card shows tce_result.freight_revenue even when it differs from quantity x rate (e.g. rounded by the precision mode)", () => {
    const vm = buildVerdictVM(withRevenue(149971.51));
    expect(vm.totalFreightUsd).toBe(149971.51);
    expect(vm.totalFreightUsd).not.toBe(3450 * 43.47);
  });
  test("a missing freight_revenue is a contract violation, not a silent recomputation", () => {
    const res = withRevenue(1);
    delete (res.tce_result as Partial<typeof res.tce_result>).freight_revenue;
    expect(() => buildVerdictVM(res)).toThrow(/freight_revenue/);
  });
});

describe("F-VM-Sandbox (client layout: Reverse Quote cards)", () => {
  const res = {
    resolved_freight_rate: 43.47,
    resolved_freight_revenue: 149971.5,
    resolved_tce: 4096.28,
    break_even_rate: 42.88,
    decision: makeDecision({ inputs_snapshot: snapshot, profit_margin_pct: 1.32, operator_profit_usd: 1974.78, spread_vs_shipowner_ask: 96.28, decision: "NO-GO" }),
  };
  test("S01 sandbox result -> every card value mapped; the spread comes from the backend decision, never a subtraction", () => {
    expect(buildSandboxVM(res)).toEqual({
      resolvedRate: 43.47,
      totalFreightUsd: 149971.5,
      resolvedTce: 4096.28,
      breakEvenRate: 42.88,
      decision: "NO-GO",
      marginPct: 1.32,
      operatorProfitUsd: 1974.78,
      spreadVsOwnerAsk: 96.28,
      ownerAskNegative: false,
      ownerAskTce: 4000,
    });
  });
  test("the total freight is the backend's resolved_freight_revenue (for the resolved rate), not a product of the form's values", () => {
    const vm = buildSandboxVM({ ...res, resolved_freight_rate: 50, resolved_freight_revenue: 172500 });
    expect(vm.totalFreightUsd).toBe(172500);
    expect(vm.totalFreightUsd).not.toBe(3450 * 50 + 1);
  });
  test("a missing resolved_freight_revenue is a contract violation", () => {
    const { resolved_freight_revenue: _omit, ...without } = res;
    expect(() => buildSandboxVM(without as never)).toThrow(/resolved_freight_revenue/);
  });
  test("a negative sandbox spread flags ownerAskNegative", () => {
    expect(buildSandboxVM({ ...res, decision: makeDecision({ inputs_snapshot: snapshot, spread_vs_shipowner_ask: -1 }) }).ownerAskNegative).toBe(true);
  });
  test("a missing field throws", () => {
    expect(() => buildSandboxVM({ resolved_freight_rate: 21, decision: makeDecision() } as never)).toThrow();
  });
});

describe("F-VM-Verdict reason in two languages", () => {
  test("the Chinese sentence is carried when the backend sends it", () => {
    const res = makeQuoteResult({ inputs_snapshot: snapshot });
    res.deal_decision.reason_zh = "利润率 3.42% 达到或超过 2.50% 的阈值。";
    expect(buildVerdictVM(res).reasonZh).toBe("利润率 3.42% 达到或超过 2.50% 的阈值。");
  });

  test("a record saved before the field existed (or an empty one) has none: the page then shows the English reason", () => {
    const res = makeQuoteResult({ inputs_snapshot: snapshot });
    delete res.deal_decision.reason_zh;
    expect(buildVerdictVM(res).reasonZh).toBeNull();
    res.deal_decision.reason_zh = "";
    expect(buildVerdictVM(res).reasonZh).toBeNull();
  });
});
