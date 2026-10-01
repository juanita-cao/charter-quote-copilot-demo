import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { parseSnapshot } from "../form/load";
import { MOCK_QUOTE_INPUT } from "../mocks/fixtures";
import { BASE, fillRequired, loggedIn, renderApp, runCalc, server, setField, useMockBackend } from "../test/harness";
import { setWorkspaceDefaults } from "./defaults";

useMockBackend();
afterEach(() => setWorkspaceDefaults(null));
const T = { timeout: 6000 };
const cards = () => within(screen.getByTestId("verdict"));
// a label whose unit sits in its own span: match the label element by its full text
const label = (root: ReturnType<typeof within>, text: string) => root.getByText((_c: string, el: Element | null) => el?.classList.contains("stacked-main") === true && el.textContent === text);
const sandbox = () => screen.findByTestId("sandbox", undefined, T);

async function calculated(over: Record<string, string | number> = {}) {
  loggedIn();
  await renderApp();
  fillRequired({ quantity: 3450, freight_rate: 43.47, shipowner_asking_tce: 4000, ...over });
  runCalc();
  await screen.findByTestId("verdict", undefined, T);
}

describe("Estimated TCE cards (client layout)", () => {
  test("shows the eight cards in the client's order, labelled in English only when the language is English", async () => {
    await calculated();
    const v = screen.getByTestId("verdict");
    const labels = Array.from(v.querySelectorAll(".metric-card .stacked-main")).map((e) => e.textContent);
    expect(labels).toEqual([
      "Freight Rate (USD/RT)",
      "Total Freight (USD)",
      "Net Profit (USD)",
      "Margin",
      "Est. TCE (USD/day)",
      "Owner Ask (USD/day)",
      "Hire Spread (USD/day)",
      "Decision",
    ]);
    // one language at a time: no Chinese label anywhere in the results
    expect(v.textContent).not.toMatch(/[\u4e00-\u9fff]/);
    expect(document.querySelector(".stacked-sub")).toBeNull();
  });

  test("the values come from the response: freight rate and owner ask echo the form; total freight is quantity x rate", async () => {
    await calculated();
    expect(cards().getByText("43.47")).toBeInTheDocument();
    expect(cards().getByText("4,000.00")).toBeInTheDocument(); // owner ask
    expect(cards().getByText("149,971.50")).toBeInTheDocument(); // 3450 x 43.47
    expect(cards().getByText("3.42%")).toBeInTheDocument();
    expect(cards().getByText("+26,586.78")).toBeInTheDocument();
    expect(cards().getByText("+1,296.28")).toBeInTheDocument();
  });

  test("the labels follow the language switch, and only that language is shown", async () => {
    loggedIn();
    setWorkspaceDefaults(parseSnapshot(MOCK_QUOTE_INPUT)); // a filled form, so no field needs to be found by its (English) label
    await renderApp("/workspace", "zh");
    runCalc();
    await screen.findByTestId("verdict", undefined, T);
    const labels = Array.from(screen.getByTestId("verdict").querySelectorAll(".metric-card .stacked-main")).map((e) => e.textContent);
    expect(labels).toEqual(["单吨运费（美元/RT）", "总运费（美元）", "净利润（美元）", "利润率", "预估日租金（美元/天）", "船东要价（美元/天）", "租金价差（美元/天）", "决策"]);
    // no English label in the cards, the section headers or the tables (the backend's own reason text is the only English that may remain)
    const results = document.querySelector(".workspace-results")!;
    for (const english of ["Freight Rate", "Total Freight", "Net Profit", "Margin", "Est. TCE", "Owner Ask", "Hire Spread", "Decision", "Estimated TCE", "Reverse Quote", "Risk Analysis", "Scenario", "Adjust"]) {
      expect(results.textContent, `"${english}" should not appear in Chinese mode`).not.toContain(english);
    }
  });

  test("the reason sentence comes in the language of the page (the backend sends both)", async () => {
    loggedIn();
    setWorkspaceDefaults(parseSnapshot(MOCK_QUOTE_INPUT));
    await renderApp("/workspace", "zh");
    runCalc();
    await screen.findByTestId("verdict", undefined, T);
    const verdict = screen.getByTestId("verdict");
    expect(verdict.textContent).toContain("利润率 3.42% 达到或超过 2.50% 的阈值。");
    expect(verdict.textContent).not.toContain("Profit margin");
  });

  test("the sandbox and the risk table stay hidden until the form is calculated", async () => {
    loggedIn();
    await renderApp();
    expect(screen.queryByTestId("sandbox")).not.toBeInTheDocument();
    expect(screen.queryByTestId("risk")).not.toBeInTheDocument();
    expect(screen.queryByText("Reverse Quote")).not.toBeInTheDocument();
  });
});

describe("Reverse Quote (L2-07)", () => {
  test("starts from the form's own rate and owner ask; the Target TCE field shows the resolved TCE", async () => {
    await calculated();
    await sandbox();
    await waitFor(() => expect((within(screen.getByTestId("sandbox")).getByLabelText("Freight Rate (USD/RT)") as HTMLInputElement).value).toMatch(/43\.47/), T);
    expect((screen.getByLabelText("Target TCE (USD/day)") as HTMLInputElement).value).toMatch(/4,?096\.28/);
    expect((screen.getByLabelText("Owner Ask (USD/day)") as HTMLInputElement).value).toMatch(/4,?000\.00/);
  });

  test("editing Target TCE re-solves the freight rate, total freight and hire spread", async () => {
    await calculated();
    await sandbox();
    expect((within(screen.getByTestId("sandbox")).getByLabelText("Freight Rate (USD/RT)") as HTMLInputElement).value).toMatch(/43\.47/);
    fireEvent.change(screen.getByLabelText("Target TCE (USD/day)"), { target: { value: "4296.28" } });
    // mock: +200 TCE = +1 USD/RT  ->  rate 44.47, total freight 3450 x 44.47
    await waitFor(() => expect((within(screen.getByTestId("sandbox")).getByLabelText("Freight Rate (USD/RT)") as HTMLInputElement).value).toMatch(/44\.47/), T);
    expect(within(screen.getByTestId("sandbox")).getByText("153,421.50")).toBeInTheDocument();
    expect(within(screen.getByTestId("sandbox")).getByText("+296.28")).toBeInTheDocument();
  });

  test("editing the owner ask moves the break-even rate, not just a display value", async () => {
    await calculated();
    await sandbox();
    await waitFor(() => expect(within(screen.getByTestId("sandbox")).getByText("44.00")).toBeInTheDocument(), T);
    fireEvent.change(screen.getByLabelText("Owner Ask (USD/day)"), { target: { value: "5000" } });
    await waitFor(() => expect(within(screen.getByTestId("sandbox")).getByText("45.00")).toBeInTheDocument(), T);
  });

  test("Reset returns both fields to the form's own values", async () => {
    await calculated();
    await sandbox();
    fireEvent.change(screen.getByLabelText("Target TCE (USD/day)"), { target: { value: "4296.28" } });
    await waitFor(() => expect((within(screen.getByTestId("sandbox")).getByLabelText("Freight Rate (USD/RT)") as HTMLInputElement).value).toMatch(/44\.47/), T);
    fireEvent.click(screen.getByRole("button", { name: /Reset/ }));
    await waitFor(() => expect((within(screen.getByTestId("sandbox")).getByLabelText("Freight Rate (USD/RT)") as HTMLInputElement).value).toMatch(/43\.47/), T);
    expect((screen.getByLabelText("Owner Ask (USD/day)") as HTMLInputElement).value).toMatch(/4,?000\.00/);
  });

  test("sends exactly one of target_tce / sandbox_freight_rate (the backend rule), and the ask only once edited", async () => {
    const bodies: Record<string, unknown>[] = [];
    server.use(
      http.post(`${BASE}/api/v1/quotes/sandbox`, async ({ request }) => {
        bodies.push((await request.json()) as Record<string, unknown>);
        return HttpResponse.json({ detail: "stop" }, { status: 422 });
      }),
    );
    await calculated();
    await waitFor(() => expect(bodies.length).toBeGreaterThan(0), T);
    const first = bodies[0];
    expect(first.sandbox_freight_rate).toBe(43.47);
    expect("target_tce" in first).toBe(false);
    expect("sandbox_shipowner_ask" in first).toBe(false);
    fireEvent.change(screen.getByLabelText("Target TCE (USD/day)"), { target: { value: "4500" } });
    await waitFor(() => expect(bodies.some((b) => b.target_tce === 4500)).toBe(true), T);
    const withTarget = bodies.find((b) => b.target_tce === 4500)!;
    expect("sandbox_freight_rate" in withTarget).toBe(false);
  });

  test("a 422 from the sandbox shows the server message and keeps the panel", async () => {
    await calculated();
    await sandbox();
    server.use(http.post(`${BASE}/api/v1/quotes/sandbox`, () => HttpResponse.json({ detail: "target is impossible" }, { status: 422 })));
    fireEvent.change(screen.getByLabelText("Target TCE (USD/day)"), { target: { value: "1" } });
    expect(await screen.findByText("target is impossible", undefined, T)).toBeInTheDocument();
  });
});

describe("Risk Analysis", () => {
  test("lists the base case and the four scenarios with bilingual names, adjust fields and decisions", async () => {
    await calculated();
    const table = await screen.findByTestId("risk", undefined, T);
    expect(within(table).getByText("Base Case")).toBeInTheDocument();
    expect(within(table).queryByText("基准情景")).not.toBeInTheDocument(); // English mode: no Chinese name
    for (const key of ["port_cost", "bunker_price", "margin_days", "freight_rate"]) {
      expect(within(table).getByTestId(`risk-row-${key}`)).toBeInTheDocument();
    }
    expect(within(table).getByTestId("risk-row-base")).toHaveTextContent("—");
    expect(within(table).getAllByText(/● (NO-)?GO/).length).toBe(5);
  });

  test("editing a scenario's adjust value sends it under the backend's stable key, and only that row changes", async () => {
    const bodies: Record<string, unknown>[] = [];
    server.use(
      http.post(`${BASE}/api/v1/quotes/risk-scenarios`, async ({ request, params: _p }) => {
        const b = (await request.json()) as Record<string, unknown>;
        bodies.push(b);
        const deltas = (b.deltas ?? {}) as Record<string, number>;
        const row = (name: string, zh: string, delta: number | null, step: number, unit: string) => ({
          scenario_name: name, scenario_name_zh: zh, delta, delta_step: step, delta_unit: unit,
          estimated_tce: 4000, tce_impact: -96.28, profit_margin_pct: 0, decision: "GO",
        });
        return HttpResponse.json([
          row("Base Case", "基准情景", null, 0, ""),
          row("Port Cost", "港口使费", deltas.port_cost ?? 5000, 1000, "USD"),
          row("Bunker Price", "燃油价格", deltas.bunker_price ?? 10, 50, "%"),
          row("Margin Days", "富余天数", deltas.margin_days ?? 1, 0.5, "day"),
          row("Freight Rate", "单吨运费", deltas.freight_rate ?? -2, 0.5, "USD/RT"),
        ]);
      }),
    );
    await calculated();
    await screen.findByTestId("risk", undefined, T);
    expect("deltas" in bodies[0]).toBe(false);
    fireEvent.change(screen.getByLabelText("Bunker Price Adjust"), { target: { value: "25" } });
    await waitFor(() => expect(bodies.some((b) => (b.deltas as Record<string, number> | undefined)?.bunker_price === 25)).toBe(true), T);
    const sent = bodies.find((b) => b.deltas)!.deltas as Record<string, number>;
    expect(Object.keys(sent)).toEqual(["bunker_price"]);
  });

  test("the row names follow the language switch", async () => {
    loggedIn();
    setWorkspaceDefaults(parseSnapshot(MOCK_QUOTE_INPUT));
    await renderApp("/workspace", "zh");
    runCalc();
    const table = await screen.findByTestId("risk", undefined, T);
    expect(within(table).getByText("港口使费")).toBeInTheDocument();
    expect(within(table).queryByText("Port Cost")).not.toBeInTheDocument();
    for (const h of ["场景", "调整", "预估 TCE", "TCE 变化", "利润率", "决策"]) expect(within(table).getByText(h)).toBeInTheDocument();
  });

  test("a 422 from the risk route is shown, not swallowed", async () => {
    server.use(http.post(`${BASE}/api/v1/quotes/risk-scenarios`, () => HttpResponse.json({ detail: "risk failed" }, { status: 422 })));
    await calculated();
    expect(await screen.findByText("risk failed", undefined, T)).toBeInTheDocument();
  });
});

describe("input layout (client request)", () => {
  test("ballast and laden distance are rendered in the same row of the form", async () => {
    loggedIn();
    await renderApp();
    const ballast = screen.getByLabelText("Ballast distance (nm)");
    const laden = screen.getByLabelText("Laden distance (nm)");
    expect(ballast.closest(".field-row")).toBe(laden.closest(".field-row"));
    setField("route", "x");
    const hfo = screen.getByLabelText("HFO ballast (t/day)");
    expect(hfo.closest(".field-row")).toBe(screen.getByLabelText("HFO in port (t/day)").closest(".field-row"));
    expect(hfo.closest(".field-row")).not.toBe(screen.getByLabelText("MGO ballast (t/day)").closest(".field-row"));
  });
});

describe("Details (approved figures kept, moved out of the primary cards)", () => {
  test("total days, voyage cost, net income and the market-benchmark spread are in a collapsible Details section, collapsed by default", async () => {
    await calculated();
    const toggle = screen.getByRole("button", { name: /Details/ });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(toggle);
    const d = within(await screen.findByTestId("details"));
    expect(label(d, "Total days")).toBeInTheDocument();
    expect(d.getByText("20.51")).toBeInTheDocument();
    expect(d.getByText("62,246.00")).toBeInTheDocument();
    expect(d.getByText("84,014.78")).toBeInTheDocument();
    expect(d.getByText("+1,096.28")).toBeInTheDocument();
    expect(d.queryByText("对比市场基准")).not.toBeInTheDocument(); // English mode: no Chinese label
    expect(screen.getByRole("button", { name: /Details/ })).toHaveAttribute("aria-expanded", "true");
  });

  test("the primary card grid still shows only the eight client cards", async () => {
    await calculated();
    expect(screen.getByTestId("verdict").querySelectorAll(".metric-grid .metric-card")).toHaveLength(8);
  });
});

describe("Reverse Quote — bidirectional Target TCE <-> Freight Rate, independent Owner Ask (approved ADR-009 behaviour)", () => {
  const box = () => within(screen.getByTestId("sandbox"));
  const rateField = () => box().getByLabelText("Freight Rate (USD/RT)") as HTMLInputElement;
  const targetField = () => screen.getByLabelText("Target TCE (USD/day)") as HTMLInputElement;
  const askField = () => screen.getByLabelText("Owner Ask (USD/day)") as HTMLInputElement;

  test("the Freight Rate card is an editable field, not a read-only figure", async () => {
    await calculated();
    await sandbox();
    expect(rateField().tagName).toBe("INPUT");
    expect(rateField().value).toMatch(/43\.47/);
    expect(rateField()).not.toHaveAttribute("readonly");
    expect(rateField()).not.toBeDisabled();
  });

  test("editing the Freight Rate re-solves the Target TCE and the total freight uses the resolved rate", async () => {
    await calculated();
    await sandbox();
    fireEvent.change(rateField(), { target: { value: "44.47" } });
    // mock: +1 USD/RT = +200 TCE
    await waitFor(() => expect(targetField().value).toMatch(/4,?296\.28/), T);
    expect(box().getByText("153,421.50")).toBeInTheDocument(); // 3450 x 44.47, not the form's 43.47
    expect(rateField().value).toMatch(/44\.47/);
  });

  test("editing the Target TCE re-solves the Freight Rate (the other direction)", async () => {
    await calculated();
    await sandbox();
    fireEvent.change(targetField(), { target: { value: "4296.28" } });
    await waitFor(() => expect(rateField().value).toMatch(/44\.47/), T);
  });

  test("the last edited one drives: exactly one of target_tce / sandbox_freight_rate is sent, switching as the user switches", async () => {
    const bodies: Record<string, unknown>[] = [];
    server.use(
      http.post(`${BASE}/api/v1/quotes/sandbox`, async ({ request }) => {
        const b = (await request.json()) as Record<string, unknown>;
        bodies.push(b);
        return HttpResponse.json({ detail: "stop" }, { status: 422 });
      }),
    );
    await calculated();
    await waitFor(() => expect(bodies.length).toBeGreaterThan(0), T);
    // the panel shows nothing without a result, so the fields come from a normal response first
    server.resetHandlers();
    server.use(...(await import("../mocks/handlers")).createHandlers({ baseUrl: BASE, latencyMs: 0, idleExpiryMs: Infinity }));
    server.use(
      http.post(`${BASE}/api/v1/quotes/sandbox`, async ({ request }) => {
        const b = (await request.json()) as Record<string, unknown>;
        bodies.push(b);
        return HttpResponse.json({
          resolved_freight_rate: Number(b.sandbox_freight_rate ?? 44),
          resolved_freight_revenue: 3450 * Number(b.sandbox_freight_rate ?? 44),
          resolved_tce: Number(b.target_tce ?? 4100),
          break_even_rate: 42,
          decision: { decision: "GO", reason: "", rule_triggered: "R1", profit_margin_pct: 1, operator_profit_usd: 1, spread_vs_shipowner_ask: 1, spread_vs_market_benchmark: 1, inputs_snapshot: { quantity: 3450, freight_rate: 44, shipowner_asking_tce: 4000 } },
        });
      }),
    );
    fireEvent.change(targetField(), { target: { value: "4500" } });
    await waitFor(() => expect(bodies.some((b) => b.target_tce === 4500)).toBe(true), T);
    fireEvent.change(rateField(), { target: { value: "45" } });
    await waitFor(() => expect(bodies.some((b) => b.sandbox_freight_rate === 45)).toBe(true), T);
    const rateCall = bodies.find((b) => b.sandbox_freight_rate === 45)!;
    expect("target_tce" in rateCall).toBe(false);
    fireEvent.change(targetField(), { target: { value: "4600" } });
    await waitFor(() => expect(bodies.some((b) => b.target_tce === 4600)).toBe(true), T);
    const targetCall = bodies.find((b) => b.target_tce === 4600)!;
    expect("sandbox_freight_rate" in targetCall).toBe(false);
  });

  test("the Owner Ask is independent: editing it does not change which of the two drives, nor their values", async () => {
    await calculated();
    await sandbox();
    fireEvent.change(rateField(), { target: { value: "44.47" } });
    await waitFor(() => expect(targetField().value).toMatch(/4,?296\.28/), T);
    fireEvent.change(askField(), { target: { value: "5000" } });
    await waitFor(() => expect(box().getByText("45.00")).toBeInTheDocument(), T); // break-even moved with the ask
    expect(rateField().value).toMatch(/44\.47/);
    expect(targetField().value).toMatch(/4,?296\.28/);
  });

  test("Reset returns the driver, the rate, the target and the ask to the form's own values", async () => {
    await calculated();
    await sandbox();
    fireEvent.change(rateField(), { target: { value: "44.47" } });
    fireEvent.change(askField(), { target: { value: "5000" } });
    await waitFor(() => expect(box().getByText("45.00")).toBeInTheDocument(), T);
    fireEvent.click(screen.getByRole("button", { name: /Reset/ }));
    await waitFor(() => expect(rateField().value).toMatch(/43\.47/), T);
    expect(targetField().value).toMatch(/4,?096\.28/);
    expect(askField().value).toMatch(/4,?000\.00/);
  });
});


describe("one language at a time (user decision 2026-09-20)", () => {
  test("English mode: no Chinese character anywhere in the results column", async () => {
    await calculated();
    await sandbox();
    await screen.findByTestId("risk", undefined, T);
    expect(document.querySelector(".workspace-results")!.textContent).not.toMatch(/[\u4e00-\u9fff]/);
  });

  test("Chinese mode: the sandbox labels, its help text and the details are Chinese only", async () => {
    loggedIn();
    setWorkspaceDefaults(parseSnapshot(MOCK_QUOTE_INPUT));
    await renderApp("/workspace", "zh");
    runCalc();
    await sandbox();
    expect(screen.getByLabelText("目标 TCE（美元/天）")).toBeInTheDocument();
    expect(screen.getByLabelText("船东要价（美元/天）")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /反向推算/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /详情/ }));
    const d = within(await screen.findByTestId("details"));
    for (const text of ["总天数", "航次成本（美元）", "净收入（美元）", "对比市场基准（美元/天）"]) expect(label(d, text)).toBeInTheDocument();
    expect(d.queryByText("Total days")).not.toBeInTheDocument();
  });
});
