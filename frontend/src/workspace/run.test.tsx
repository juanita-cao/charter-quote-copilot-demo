import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { parseSnapshot } from "../form/load";
import { MOCK_QUOTE_INPUT } from "../mocks/fixtures";
import { BASE, loggedIn, renderApp, runCalc, server, useMockBackend } from "../test/harness";
import { setWorkspaceDefaults } from "./defaults";

useMockBackend();
afterEach(() => setWorkspaceDefaults(null));
const T = { timeout: 6000 };
const STALE = "The inputs have changed since the last Run — click Run to update the results";

type Body = Record<string, unknown>;
function record(path: string, bucket: Body[]) {
  server.events.on("request:start", async ({ request }) => {
    if (request.method === "POST" && new URL(request.url).pathname.endsWith(path)) bucket.push((await request.clone().json()) as Body);
  });
}

async function start(language: "en" | "zh" = "en") {
  loggedIn();
  setWorkspaceDefaults(parseSnapshot(MOCK_QUOTE_INPUT));
  await renderApp("/workspace", language);
}
const precisionBox = () => screen.getByRole("combobox", { name: /Calculation precision|计算精度/ });
async function choose(optionText: string) {
  fireEvent.mouseDown(precisionBox());
  fireEvent.click(await screen.findByText(optionText, { selector: ".ant-select-item-option-content" }));
}

describe("Run and calculation precision (client decisions, 2026-09-21)", () => {
  afterEach(() => server.events.removeAllListeners());

  test("the action bar has a Run button and a precision selector; display precision is the default", async () => {
    await start();
    expect(screen.getByRole("toolbar", { name: "Calculation" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Run" })).toBeInTheDocument();
    expect(within(precisionBox().closest(".ant-select") as HTMLElement).getByText("Display precision")).toBeInTheDocument();
  });

  test("both precision choices are offered: display precision and full precision", async () => {
    await start();
    fireEvent.mouseDown(precisionBox());
    expect(await screen.findByText("Full precision", { selector: ".ant-select-item-option-content" })).toBeInTheDocument();
    expect(screen.getByText("Display precision", { selector: ".ant-select-item-option-content" })).toBeInTheDocument();
  });

  test("Run sends precision_mode 'display' by default, and 'full' after the operator switches", async () => {
    const bodies: Body[] = [];
    record("/quotes/calculate", bodies);
    await start();
    runCalc();
    await screen.findByTestId("verdict", undefined, T);
    expect(bodies[0].precision_mode).toBe("display");

    await choose("Full precision");
    runCalc();
    await waitFor(() => expect(bodies).toHaveLength(2), T);
    expect(bodies[1].precision_mode).toBe("full");
  });

  test("changing the precision makes the result stale and calculates nothing until Run", async () => {
    const bodies: Body[] = [];
    record("/quotes/calculate", bodies);
    await start();
    runCalc();
    await screen.findByTestId("verdict", undefined, T);
    await choose("Full precision");
    expect(await screen.findByText(STALE)).toBeInTheDocument();
    expect(screen.getByTestId("verdict")).toHaveClass("stale");
    await new Promise((r) => setTimeout(r, 800));
    expect(bodies).toHaveLength(1);
    runCalc();
    await waitFor(() => expect(screen.queryByText(STALE)).not.toBeInTheDocument(), T);
    expect(bodies).toHaveLength(2);
  });

  test("choosing the precision that is already selected changes nothing", async () => {
    await start();
    runCalc();
    await screen.findByTestId("verdict", undefined, T);
    await choose("Display precision");
    expect(screen.queryByText(STALE)).not.toBeInTheDocument();
  });

  test("the sandbox and the risk table use the precision of the Run that produced the result", async () => {
    const sandbox: Body[] = [];
    const risk: Body[] = [];
    record("/quotes/sandbox", sandbox);
    record("/quotes/risk-scenarios", risk);
    await start();
    await choose("Full precision");
    runCalc();
    await screen.findByTestId("risk", undefined, T);
    await waitFor(() => expect(sandbox.length).toBeGreaterThan(0), T);
    expect(sandbox.every((b) => b.precision_mode === "full")).toBe(true);
    expect(risk.every((b) => b.precision_mode === "full")).toBe(true);
  });

  test("editing an input greys the sandbox and the risk table and locks their fields until the next Run", async () => {
    await start();
    runCalc();
    await screen.findByTestId("sandbox", undefined, T);
    await screen.findByTestId("risk", undefined, T);
    expect(screen.getByLabelText("Target TCE (USD/day)")).not.toBeDisabled();

    fireEvent.change(screen.getByLabelText("Quantity (RT)"), { target: { value: "5100" } });
    expect(await screen.findByText(STALE)).toBeInTheDocument();
    for (const label of ["Target TCE (USD/day)", "Owner Ask (USD/day)", "Bunker Price Adjust"]) {
      expect(screen.getByLabelText(label), label).toBeDisabled();
    }
    expect(screen.getByRole("button", { name: /Reset/ })).toBeDisabled();
    expect(screen.getByTestId("sandbox")).toHaveClass("stale");
    expect(screen.getByTestId("risk")).toHaveClass("stale");

    runCalc();
    await waitFor(() => expect(screen.getByLabelText("Target TCE (USD/day)")).not.toBeDisabled(), T);
  });

  test("the sandbox and the risk requests come from the inputs as they were at Run, not from later edits", async () => {
    const sandbox: Body[] = [];
    record("/quotes/sandbox", sandbox);
    await start();
    runCalc();
    await screen.findByTestId("sandbox", undefined, T);
    await waitFor(() => expect(sandbox.length).toBeGreaterThan(0), T);
    const before = sandbox.length;
    fireEvent.change(screen.getByLabelText("Quantity (RT)"), { target: { value: "9999" } });
    await new Promise((r) => setTimeout(r, 900));
    expect(sandbox.length).toBe(before); // no request for the edited inputs
    expect(sandbox.every((b) => b.quantity === 5000)).toBe(true);
  });

  test("Chinese: 计算精度, 全精度, 以显示精度为准 and the 航次测算 button", async () => {
    await start("zh");
    expect(screen.getByRole("button", { name: "航次测算" })).toBeInTheDocument();
    expect(within(precisionBox().closest(".ant-select") as HTMLElement).getByText("以显示精度为准")).toBeInTheDocument();
    fireEvent.mouseDown(precisionBox());
    expect(await screen.findByText("全精度", { selector: ".ant-select-item-option-content" })).toBeInTheDocument();
    runCalc();
    await screen.findByTestId("verdict", undefined, T);
    fireEvent.change(screen.getByLabelText("货物数量（RT）"), { target: { value: "5100" } });
    expect(await screen.findByText("输入项在上次测算后已修改 —— 请重新点击“航次测算”更新结果")).toBeInTheDocument();
  });

  test("a rejected precision_mode (422) is shown like any other server message", async () => {
    server.use(http.post(`${BASE}/api/v1/quotes/calculate`, () => HttpResponse.json({ detail: "precision_mode must be 'full' or 'display'" }, { status: 422 })));
    await start();
    runCalc();
    expect(await screen.findByText("precision_mode must be 'full' or 'display'", undefined, T)).toBeInTheDocument();
  });
});
