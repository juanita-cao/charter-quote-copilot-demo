import { fireEvent, screen, waitFor } from "@testing-library/react";
import { parseSnapshot } from "../form/load";
import { MOCK_QUOTE_INPUT } from "../mocks/fixtures";
import { loggedIn, renderApp, runCalc, setField, useMockBackend } from "../test/harness";
import { setWorkspaceDefaults } from "./defaults";

useMockBackend();
afterEach(() => setWorkspaceDefaults(null));
const T = { timeout: 12000 };
const box = (label: string) => screen.getByLabelText(label).closest(".ant-input-number") as HTMLElement;
const value = (label: string) => (screen.getByLabelText(label) as HTMLInputElement).value;
// antd steps on mouse down on the arrow
const click = (label: string, dir: "up" | "down") => {
  const arrow = box(label).querySelector(`.ant-input-number-handler-${dir}`) as HTMLElement;
  fireEvent.mouseDown(arrow);
  fireEvent.mouseUp(arrow);
};

async function withDefaultCase() {
  loggedIn();
  setWorkspaceDefaults(parseSnapshot(MOCK_QUOTE_INPUT)); // quantity 5000, rate 22, commission 2.5, hfo 500, mgo consumption 1 ...
  await renderApp();
}

describe("up / down arrows on the numeric inputs", () => {
  test("every numeric input of the form has an up and a down arrow", async () => {
    await withDefaultCase();
    for (const label of ["Quantity (RT)", "Freight rate (USD/RT)", "Commission (%)", "Loading days", "Ballast distance (nm)", "CJK laden (nm)", "Ballast speed (kn)", "HFO price (USD/t)", "HFO ballast (t/day)", "MGO laden (t/day)", "Load-port PDA (USD)", "Discharge-port PDA (USD)", "Lashing cost (USD)", "Shipowner asking TCE (USD/day)", "Market benchmark (USD/day)", "GO threshold (%)", "Total freight (USD)"]) {
      expect(box(label).querySelector(".ant-input-number-handler-up"), `${label} up`).not.toBeNull();
      expect(box(label).querySelector(".ant-input-number-handler-down"), `${label} down`).not.toBeNull();
    }
  });

  test("quantity steps by 100, freight rate by 0.5, commission by 1.25 (the predecessor's steps)", async () => {
    await withDefaultCase();
    click("Quantity (RT)", "up");
    await waitFor(() => expect(value("Quantity (RT)")).toBe("5100"), T);
    click("Quantity (RT)", "down");
    click("Quantity (RT)", "down");
    await waitFor(() => expect(value("Quantity (RT)")).toBe("4900"), T);
    click("Freight rate (USD/RT)", "up");
    await waitFor(() => expect(value("Freight rate (USD/RT)")).toBe("22.5"), T);
    click("Commission (%)", "up");
    await waitFor(() => expect(value("Commission (%)")).toBe("3.75"), T);
  });

  test("fractional steps leave no float residue: consumption 1 + 0.05 is 1.05, 0.1 steps stay clean", async () => {
    await withDefaultCase();
    click("MGO laden (t/day)", "up");
    await waitFor(() => expect(value("MGO laden (t/day)")).toBe("1.05"), T);
    click("HFO ballast (t/day)", "up"); // 10 -> 10.1
    await waitFor(() => expect(value("HFO ballast (t/day)")).toBe("10.1"), T);
    click("GO threshold (%)", "up"); // 2.5 -> 2.6
    await waitFor(() => expect(value("GO threshold (%)")).toBe("2.6"), T);
  });

  test("stepping is an edit like any other: the total freight follows, and Run then shows the results", async () => {
    await withDefaultCase();
    click("Quantity (RT)", "up");
    await waitFor(() => expect(value("Total freight (USD)")).toBe("112200"), T); // 5100 x 22
    expect(screen.queryByTestId("verdict")).not.toBeInTheDocument(); // stepping never calculates by itself
    runCalc();
    await screen.findByTestId("verdict", undefined, T);
  });

  test("the total freight steps by 1000 and solves the freight rate with the quantity held fixed", async () => {
    await withDefaultCase();
    click("Total freight (USD)", "up"); // 110000 -> 111000
    await waitFor(() => expect(value("Freight rate (USD/RT)")).toBe("22.2"), T); // 111000 / 5000
    expect(value("Quantity (RT)")).toBe("5000");
    click("Total freight (USD)", "down");
    await waitFor(() => expect(value("Freight rate (USD/RT)")).toBe("22"), T);
  });

  test("typing still works alongside the arrows, and a rule breach still gets its hint (arrows do not clamp)", async () => {
    await withDefaultCase();
    setField("quantity", "0");
    expect(await screen.findByText("Must be greater than 0")).toBeInTheDocument();
    click("Quantity (RT)", "up");
    await waitFor(() => expect(value("Quantity (RT)")).toBe("100"), T);
    await waitFor(() => expect(screen.queryByText("Must be greater than 0")).not.toBeInTheDocument());
  });

  test("the arrows of the sandbox and risk fields are still there (Target TCE, Owner Ask, Freight Rate card, an Adjust value)", async () => {
    await withDefaultCase();
    runCalc();
    await screen.findByTestId("sandbox", undefined, T);
    for (const label of ["Target TCE (USD/day)", "Owner Ask (USD/day)"]) expect(box(label).querySelector(".ant-input-number-handler-up")).not.toBeNull();
    await screen.findByTestId("risk", undefined, T);
    expect(box("Bunker Price Adjust").querySelector(".ant-input-number-handler-down")).not.toBeNull();
  });
});
