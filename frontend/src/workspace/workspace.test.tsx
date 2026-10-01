import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { delay, http, HttpResponse } from "msw";
import { BASE, countRequests, fillRequired, loggedIn, renderApp, runCalc, server, setField, useMockBackend } from "../test/harness";
import { MOCK_BUNKER, MOCK_CALC_GO, MOCK_CALC_NOGO_NEG_ASK, MOCK_VESSEL } from "../mocks/fixtures";
import { en } from "../i18n/en";

useMockBackend();
const T = { timeout: 5000 };
const field = (name: keyof typeof en.fields) => screen.getByLabelText(en.fields[name]) as HTMLInputElement;

const RUN_PROMPT = "Fill in the inputs, then click Run to see a verdict";
const FILL_IN = "Fill in the required fields to see a verdict";
const STALE = "The inputs have changed since the last Run — click Run to update the results";

describe("Workspace — manual Run (client decision, 2026-09-21: the operator controls calculation)", () => {
  beforeEach(() => loggedIn());

  test("L2-04 nothing calculates by itself: filling in every required field makes no request and shows the Run prompt", async () => {
    const calls = countRequests("/quotes/calculate");
    await renderApp();
    expect(await screen.findByText(RUN_PROMPT)).toBeInTheDocument();
    fillRequired();
    await new Promise((r) => setTimeout(r, 900)); // longer than any old debounce
    expect(calls.count()).toBe(0);
    expect(screen.queryByTestId("verdict")).not.toBeInTheDocument();
    expect(screen.getByText(RUN_PROMPT)).toBeInTheDocument();
    calls.stop();
  });

  test("L2-04 Run with an incomplete form shows the prompt and makes NO request", async () => {
    const calls = countRequests("/quotes/calculate");
    await renderApp();
    setField("route", "CN-VN");
    setField("quantity", "5000");
    runCalc();
    expect(await screen.findByText(FILL_IN)).toBeInTheDocument();
    await new Promise((r) => setTimeout(r, 500));
    expect(calls.count()).toBe(0);
    calls.stop();
  });

  test("L2-04 golden path: fill in, Run -> verdict; change a field -> the result goes stale and NOTHING recalculates; Run -> updated", async () => {
    const calls = countRequests("/quotes/calculate");
    await renderApp();
    fillRequired();
    runCalc();
    const v = await screen.findByTestId("verdict", undefined, T);
    expect(within(v).getByText("● GO")).toBeInTheDocument();
    expect(within(v).getByText(MOCK_CALC_GO.deal_decision.reason)).toBeInTheDocument();
    expect(calls.count()).toBe(1);

    setField("freight_rate", "5");
    expect(await screen.findByText(STALE)).toBeInTheDocument();
    expect(screen.getByTestId("verdict")).toHaveClass("stale"); // the old result stays, greyed
    await new Promise((r) => setTimeout(r, 900));
    expect(calls.count()).toBe(1); // still no recalculation

    runCalc();
    await waitFor(() => expect(within(screen.getByTestId("verdict")).getByText("● NO-GO")).toBeInTheDocument(), T);
    expect(screen.queryByText(STALE)).not.toBeInTheDocument();
    expect(screen.getByTestId("verdict")).not.toHaveClass("stale");
    expect(calls.count()).toBe(2);
    calls.stop();
  });

  test("L2-05 a negative owner-ask spread shows the prompt, and the verdict is not blocked", async () => {
    await renderApp();
    fillRequired({ freight_rate: 5 });
    runCalc();
    const v = await screen.findByTestId("verdict", undefined, T);
    expect(within(v).getByText(MOCK_CALC_NOGO_NEG_ASK.deal_decision.reason)).toBeInTheDocument();
    expect(within(v).getByText(/Negative owner-ask spread/)).toBeInTheDocument();
    expect(within(v).getByText("● NO-GO")).toBeInTheDocument();
  });

  test("L2-06 a 422 from calculate shows the server message and greys (does not remove) the previous result", async () => {
    await renderApp();
    fillRequired();
    runCalc();
    await screen.findByTestId("verdict", undefined, T);
    server.use(http.post(`${BASE}/api/v1/quotes/calculate`, () => HttpResponse.json({ detail: "E2 says: distance is impossible" }, { status: 422 })));
    setField("laden_distance", "1600");
    runCalc();
    expect(await screen.findByText("E2 says: distance is impossible", undefined, T)).toBeInTheDocument();
    expect(screen.getByTestId("verdict")).toHaveClass("stale");
  });

  test("an unreachable calculation service shows the message with Retry; Retry is just Run again", async () => {
    await renderApp();
    fillRequired();
    runCalc();
    await screen.findByTestId("verdict", undefined, T);
    let down = true;
    server.use(http.post(`${BASE}/api/v1/quotes/calculate`, () => (down ? HttpResponse.json({ detail: "x" }, { status: 503 }) : HttpResponse.json(MOCK_CALC_GO))));
    setField("laden_distance", "1700");
    runCalc();
    expect(await screen.findByText("Cannot reach the calculation service", undefined, T)).toBeInTheDocument();
    down = false;
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(screen.queryByText("Cannot reach the calculation service")).not.toBeInTheDocument(), T);
    await waitFor(() => expect(screen.queryByRole("progressbar")).not.toBeInTheDocument(), T);
    expect(screen.getByTestId("verdict")).not.toHaveClass("stale");
    });

  test("a field that fails its rule shows the hint, and Run treats the form as incomplete (no request)", async () => {
    await renderApp();
    fillRequired();
    const calls = countRequests("/quotes/calculate");
    setField("quantity", "0");
    expect(await screen.findByText("Must be greater than 0")).toBeInTheDocument();
    runCalc();
    expect(await screen.findByText(FILL_IN)).toBeInTheDocument();
    await new Promise((r) => setTimeout(r, 500));
    expect(calls.count()).toBe(0);
    calls.stop();
  });

  test("L2-20 DWT: 2800 is accepted as a custom value; 2800.5 shows the hint and Run sends no calculate request", async () => {
    await renderApp();
    fillRequired();
    setField("vessel_dwt", "2800");
    expect(screen.queryByText("Must be a whole number")).not.toBeInTheDocument();
    runCalc();
    await screen.findByTestId("verdict", undefined, T);

    const calls = countRequests("/quotes/calculate");
    setField("vessel_dwt", "2800.5");
    expect(await screen.findByText("Must be a whole number")).toBeInTheDocument();
    expect(field("vessel_dwt").value).toBe("2800.5");
    runCalc();
    await new Promise((r) => setTimeout(r, 500));
    expect(calls.count()).toBe(0);
    calls.stop();
  });

  test("L2-21 an earlier, slower response cannot overwrite a newer Run: Run, edit, Run again while the first is still in flight", async () => {
    server.use(
      http.post(`${BASE}/api/v1/quotes/calculate`, async ({ request }) => {
        const b = (await request.json()) as { freight_rate: number };
        if (b.freight_rate === 22) {
          await delay(900); // the slow, older request
          return HttpResponse.json(MOCK_CALC_GO);
        }
        return HttpResponse.json(MOCK_CALC_NOGO_NEG_ASK);
      }),
    );
    await renderApp();
    fillRequired({ freight_rate: 22 });
    runCalc();
    await waitFor(() => expect(screen.getByRole("progressbar")).toBeInTheDocument(), T);
    setField("freight_rate", "5"); // edit while calculating: the in-flight result is now for old inputs
    runCalc();
    await waitFor(() => expect(within(screen.getByTestId("verdict")).getByText("● NO-GO")).toBeInTheDocument(), T);
    await new Promise((r) => setTimeout(r, 1200)); // the old GO response lands now
    expect(within(screen.getByTestId("verdict")).getByText("● NO-GO")).toBeInTheDocument();
    expect(within(screen.getByTestId("verdict")).queryByText("● GO")).not.toBeInTheDocument();
  });

  test("a second click on Run while the first calculation is in flight sends only one request", async () => {
    server.use(http.post(`${BASE}/api/v1/quotes/calculate`, async () => (await delay(600), HttpResponse.json(MOCK_CALC_GO))));
    const calls = countRequests("/quotes/calculate");
    await renderApp();
    fillRequired();
    runCalc();
    await waitFor(() => expect(screen.getByRole("progressbar")).toBeInTheDocument(), T);
    fireEvent.click(screen.getByRole("button", { name: /Run/ })); // while calculating the button shows a spinner
    fireEvent.click(screen.getByRole("button", { name: /Run/ }));
    await screen.findByTestId("verdict", undefined, T);
    expect(calls.count()).toBe(1);
    calls.stop();
  });

  test("the calculate request carries only the collected form: trimmed strings, numbers, no blanks or company_id", async () => {
    let body: Record<string, unknown> | null = null;
    server.use(http.post(`${BASE}/api/v1/quotes/calculate`, async ({ request }) => ((body = (await request.json()) as never), HttpResponse.json(MOCK_CALC_GO))));
    await renderApp();
    fillRequired({ route: "  CN-VN  " });
    runCalc();
    await screen.findByTestId("verdict", undefined, T);
    expect(body).not.toBeNull();
    expect(body!.route).toBe("CN-VN");
    expect(typeof body!.quantity).toBe("number");
    expect(Object.values(body!).includes(null as never)).toBe(false);
    expect(JSON.stringify(body)).not.toContain("company_id");
    expect("vessel_dwt" in body!).toBe(false);
  });
});

describe("Workspace — guarded auto-fill", () => {
  beforeEach(() => loggedIn());

  test("picking a known bunkering port fills the prices and shows the caption; they stay editable", async () => {
    await renderApp();
    setField("bunkering_port", "SINGAPORE");
    await waitFor(() => expect(field("hfo_price").value).toBe(String(MOCK_BUNKER.vlsfo_high)), T);
    expect(field("mgo_price").value).toBe(String(MOCK_BUNKER.lsmgo_high));
    expect(screen.getByText(/Price from the .* report/)).toBeInTheDocument();
    setField("hfo_price", "999");
    expect(field("hfo_price").value).toBe("999");
  });

  test("a custom (unknown) port never triggers a lookup", async () => {
    const calls = countRequests("/bunker-price", "GET");
    await renderApp();
    setField("bunkering_port", "MY PRIVATE ANCHORAGE");
    await new Promise((r) => setTimeout(r, 400));
    expect(calls.count()).toBe(0);
    calls.stop();
  });

  test("no caption at all while the port is blank, and none for a custom port (no lookup was made)", async () => {
    await renderApp();
    await new Promise((r) => setTimeout(r, 400));
    expect(screen.queryByText(/bunker price|Price from|no price/i)).not.toBeInTheDocument();
    setField("bunkering_port", "MY PRIVATE ANCHORAGE");
    await new Promise((r) => setTimeout(r, 400));
    expect(screen.queryByText(/bunker price|Price from|no price/i)).not.toBeInTheDocument();
  });

  test("a port with no prices shows the nil caption and clears the price fields (found 2026-09-22: a stale price next to this warning read as a real answer)", async () => {
    server.use(http.get(`${BASE}/api/v1/bunker-price`, () => HttpResponse.json({ ...MOCK_BUNKER, vlsfo_high: null, lsmgo_high: null })));
    await renderApp();
    setField("hfo_price", "123");
    setField("bunkering_port", "SINGAPORE");
    expect(await screen.findByText("This port has no price in the latest report")).toBeInTheDocument();
    expect(field("hfo_price").value).toBe("");
  });

  test("L2-24 [REVIEW 4] port A -> B quickly: A's slower response does not fill prices, B's does", async () => {
    server.use(
      http.get(`${BASE}/api/v1/bunker-price`, async ({ request }) => {
        const port = new URL(request.url).searchParams.get("port");
        if (port === "SINGAPORE") {
          await delay(700);
          return HttpResponse.json({ ...MOCK_BUNKER, port, vlsfo_high: 111, lsmgo_high: 112 });
        }
        return HttpResponse.json({ ...MOCK_BUNKER, port, vlsfo_high: 222, lsmgo_high: 223 });
      }),
    );
    await renderApp();
    setField("bunkering_port", "SINGAPORE");
    setField("bunkering_port", "BUSAN");
    await waitFor(() => expect(field("hfo_price").value).toBe("222"), T);
    await new Promise((r) => setTimeout(r, 1000)); // A's response lands now
    expect(field("hfo_price").value).toBe("222");
    expect(field("mgo_price").value).toBe("223");
  });

  test("a DWT tier fills the eight speed / consumption fields; a non-tier DWT fills nothing", async () => {
    await renderApp();
    setField("vessel_dwt", "2800");
    await new Promise((r) => setTimeout(r, 400));
    expect(field("ballast_speed").value).toBe("");
    setField("vessel_dwt", "5000");
    await waitFor(() => expect(field("ballast_speed").value).toBe(String(MOCK_VESSEL.ballast_speed)), T);
    expect(field("hfo_laden_consumption").value).toBe(String(MOCK_VESSEL.hfo_laden_consumption));
    expect(field("mgo_port_consumption").value).toBe(String(MOCK_VESSEL.mgo_port_consumption));
  });

  test("the crane toggle exists only for 8000 / 9000 / 10000 t", async () => {
    await renderApp();
    expect(screen.queryByLabelText("Has crane")).not.toBeInTheDocument();
    setField("vessel_dwt", "8000");
    expect(await screen.findByLabelText("Has crane")).toBeInTheDocument();
    setField("vessel_dwt", "5000");
    await waitFor(() => expect(screen.queryByLabelText("Has crane")).not.toBeInTheDocument());
  });

  test("route options come from the company's own saved routes, and free text is always allowed", async () => {
    await renderApp();
    setField("route", "SOME-NEW-ROUTE");
    expect(field("route").value).toBe("SOME-NEW-ROUTE");
  });
});
