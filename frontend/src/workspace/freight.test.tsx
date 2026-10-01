import { fireEvent, screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { parseSnapshot } from "../form/load";
import { MOCK_QUOTE_INPUT } from "../mocks/fixtures";
import { BASE, loggedIn, renderApp, runCalc, server, setField, useMockBackend } from "../test/harness";
import { setWorkspaceDefaults } from "./defaults";

useMockBackend();
afterEach(() => setWorkspaceDefaults(null));
const T = { timeout: 6000 };
const input = (label: string) => screen.getByLabelText(label) as HTMLInputElement;
const total = () => input("Total freight (USD)");

async function withDefaultCase() {
  loggedIn();
  setWorkspaceDefaults(parseSnapshot(MOCK_QUOTE_INPUT)); // quantity 5000, rate 22
  await renderApp();
}

describe("Total freight: quantity x rate, linked in the input panel (client requirement)", () => {
  test("it sits in the same row as quantity and the freight rate; the commission is on the next row", async () => {
    await withDefaultCase();
    expect(total().closest(".field-row")).toBe(input("Quantity (RT)").closest(".field-row"));
    expect(total().closest(".field-row")).toBe(input("Freight rate (USD/RT)").closest(".field-row"));
    expect(input("Commission (%)").closest(".field-row")).not.toBe(total().closest(".field-row"));
  });

  test("it shows quantity x rate, and follows every change of either input", async () => {
    await withDefaultCase();
    expect(total().value).toBe("110000"); // 5000 x 22
    setField("quantity", "6000");
    await waitFor(() => expect(total().value).toBe("132000"), T);
    setField("freight_rate", "25");
    await waitFor(() => expect(total().value).toBe("150000"), T);
  });

  test("it is empty while the quantity or the rate is blank", async () => {
    loggedIn();
    await renderApp();
    expect(total().value).toBe("");
    setField("quantity", "5000");
    expect(total().value).toBe("");
    setField("freight_rate", "22");
    await waitFor(() => expect(total().value).toBe("110000"), T);
  });

  test("editing the total holds the quantity fixed and changes the freight rate (as the predecessor did)", async () => {
    await withDefaultCase();
    fireEvent.change(total(), { target: { value: "121000" } });
    await waitFor(() => expect(input("Freight rate (USD/RT)").value).toBe("24.2"), T);
    expect(input("Quantity (RT)").value).toBe("5000");
    expect(total().value).toBe("121000"); // what the user typed is not rewritten under them
  });

  test("typing into the total does not reformat what is being typed, character by character", async () => {
    await withDefaultCase();
    for (const partial of ["1", "12", "121", "1210", "12100", "121000"]) {
      fireEvent.change(total(), { target: { value: partial } });
      expect(total().value).toBe(partial);
    }
  });

  test("the recalculation carries the solved rate (and the untouched quantity) after a change made through the total", async () => {
    const bodies: Record<string, unknown>[] = [];
    server.use(
      http.post(`${BASE}/api/v1/quotes/calculate`, async ({ request }) => {
        const b = (await request.json()) as Record<string, unknown>;
        bodies.push(b);
        return HttpResponse.json({
          tce_result: { total_days: 1, total_voyage_cost: 1, net_voyage_income: 1, freight_revenue: Number(b.quantity) * Number(b.freight_rate), tce: 1 },
          deal_decision: { decision: "GO", reason: "r", rule_triggered: "R1", profit_margin_pct: 1, operator_profit_usd: 1, spread_vs_shipowner_ask: 1, spread_vs_market_benchmark: 1, inputs_snapshot: b },
        });
      }),
    );
    await withDefaultCase();
    fireEvent.change(total(), { target: { value: "121000" } });
    await waitFor(() => expect(input("Freight rate (USD/RT)").value).toBe("24.2"), T);
    runCalc(); // nothing calculates on its own
    await waitFor(() => expect(bodies.some((b) => b.quantity === 5000 && b.freight_rate === 24.2)).toBe(true), T);
  });

  test("the total is never sent to the backend: requests carry quantity and freight_rate only", async () => {
    const bodies: Record<string, unknown>[] = [];
    server.use(
      http.post(`${BASE}/api/v1/quotes/calculate`, async ({ request }) => {
        bodies.push((await request.json()) as Record<string, unknown>);
        return HttpResponse.json({ detail: "stop" }, { status: 422 });
      }),
    );
    await withDefaultCase();
    runCalc();
    await waitFor(() => expect(bodies.length).toBeGreaterThan(0), T);
    expect(JSON.stringify(bodies[0])).not.toMatch(/total/i);
    expect(Object.keys(bodies[0])).toEqual(expect.arrayContaining(["quantity", "freight_rate"]));
  });

  test("with no quantity the total cannot be solved: a hint appears and the freight rate is left alone", async () => {
    loggedIn();
    await renderApp();
    setField("freight_rate", "22");
    fireEvent.change(total(), { target: { value: "121000" } });
    expect(await screen.findByText("Enter the quantity first")).toBeInTheDocument();
    expect(input("Freight rate (USD/RT)").value).toBe("22");
  });

  test("a total that is not a positive number shows the usual hint and changes nothing (letters cannot be typed into a number field at all)", async () => {
    await withDefaultCase();
    fireEvent.change(total(), { target: { value: "0" } });
    expect(await screen.findByText("Must be greater than 0")).toBeInTheDocument();
    expect(input("Freight rate (USD/RT)").value).toBe("22");
    expect(input("Quantity (RT)").value).toBe("5000");
  });

  test("leaving the field snaps it back to quantity x rate", async () => {
    await withDefaultCase();
    fireEvent.change(total(), { target: { value: "0" } });
    fireEvent.blur(total());
    await waitFor(() => expect(total().value).toBe("110000"), T);
  });
});
