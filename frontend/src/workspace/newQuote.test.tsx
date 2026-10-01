import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { delay, http, HttpResponse } from "msw";
import { parseSnapshot } from "../form/load";
import { MOCK_QUOTE_INPUT } from "../mocks/fixtures";
import { BASE, loggedIn, renderApp, runCalc, server, setField, useMockBackend } from "../test/harness";
import { setWorkspaceDefaults } from "./defaults";

useMockBackend();
afterEach(() => setWorkspaceDefaults(null));
const T = { timeout: 8000 };

async function start(language: "en" | "zh" = "en") {
  loggedIn();
  setWorkspaceDefaults(parseSnapshot(MOCK_QUOTE_INPUT));
  await renderApp("/workspace", language);
}
const newQuote = () => screen.getByRole("button", { name: /^(New quote|新建报价)$/ });
const routeBox = () => screen.getByLabelText("Route") as HTMLInputElement;
const PROMPT = "Fill in the inputs, then click Run to see a verdict";

describe("New quote (client parity: the predecessor's 'Reset All'; M4 event F-08 `formReset`)", () => {
  test("the action bar has a New quote button, in both languages", async () => {
    await start();
    expect(newQuote()).toBeInTheDocument();
  });

  test("a form nobody has edited is cleared at once, without a question", async () => {
    await start();
    expect(routeBox().value).toBe("CN-VN");
    fireEvent.click(newQuote());
    await waitFor(() => expect(routeBox().value).toBe(""), T);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  test("a form with unsaved edits asks first; Cancel keeps it, confirming clears it", async () => {
    await start();
    setField("route", "SG-MY");
    fireEvent.click(newQuote());
    const dialog = await screen.findByRole("dialog", undefined, T);
    expect(within(dialog).getByText("Start a new quote?")).toBeInTheDocument();
    expect(within(dialog).getByText(/unsaved changes/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument(), T);
    expect(routeBox().value).toBe("SG-MY");

    fireEvent.click(newQuote());
    fireEvent.click(within(await screen.findByRole("dialog", undefined, T)).getByRole("button", { name: /Clear and start/ }));
    await waitFor(() => expect(routeBox().value).toBe(""), T);
  });

  test("the result goes back to 'Fill in the inputs, then click Run', and Save Quote is off", async () => {
    await start();
    runCalc();
    await screen.findByTestId("verdict", undefined, T);
    fireEvent.click(newQuote());
    expect(await screen.findByText(PROMPT, undefined, T)).toBeInTheDocument();
    expect(screen.queryByTestId("verdict")).not.toBeInTheDocument();
    expect(screen.queryByTestId("sandbox")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save Quote" })).toBeDisabled();
  });

  test("a calculation still running when New quote is clicked does not bring its result back", async () => {
    server.use(
      http.post(`${BASE}/api/v1/quotes/calculate`, async () => {
        await delay(600);
        return HttpResponse.json((await import("../mocks/fixtures")).MOCK_CALC_GO);
      }),
    );
    await start();
    runCalc();
    fireEvent.click(newQuote());
    await new Promise((r) => setTimeout(r, 1200));
    expect(screen.queryByTestId("verdict")).not.toBeInTheDocument();
    expect(screen.getByText(PROMPT)).toBeInTheDocument();
  });

  test("the previous quote's result is not shown greyed under the next Run", async () => {
    await start();
    runCalc();
    await screen.findByTestId("verdict", undefined, T);
    fireEvent.click(newQuote());
    await screen.findByText(PROMPT, undefined, T);
    fireEvent.click(screen.getByRole("button", { name: "Run", exact: true } as never));
    expect(await screen.findByText("Fill in the required fields to see a verdict", undefined, T)).toBeInTheDocument();
    expect(screen.queryByTestId("verdict")).not.toBeInTheDocument();
  });

  test("afterwards the form is clean: loading a previous quote does not ask", async () => {
    await start();
    setField("route", "SG-MY");
    fireEvent.click(newQuote());
    fireEvent.click(within(await screen.findByRole("dialog", undefined, T)).getByRole("button", { name: /Clear and start/ }));
    await waitFor(() => expect(routeBox().value).toBe(""), T);
    fireEvent.click(await screen.findByText("Start from a previous quote"));
    fireEvent.click(await screen.findByRole("button", { name: "Search" }));
    fireEvent.click((await screen.findByText(/TH-ID/, { selector: ".previous-main" }, T)).closest("button")!);
    await waitFor(() => expect(routeBox().value).toBe("TH-ID"), T);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  test("the chosen calculation precision is kept", async () => {
    await start();
    fireEvent.mouseDown(screen.getByRole("combobox", { name: /Calculation precision/ }));
    fireEvent.click(await screen.findByText("Full precision", { selector: ".ant-select-item-option-content" }));
    fireEvent.click(newQuote());
    await waitFor(() => expect(routeBox().value).toBe(""), T);
    expect(within(screen.getByRole("combobox", { name: /Calculation precision/ }).closest(".ant-select") as HTMLElement).getByText("Full precision")).toBeInTheDocument();
  });

  test("Chinese labels", async () => {
    await start("zh");
    expect(newQuote()).toBeInTheDocument();
  });
});
