import { screen, within } from "@testing-library/react";
import { parseSnapshot } from "../form/load";
import { MOCK_QUOTE_INPUT } from "../mocks/fixtures";
import { loggedIn, renderApp, runCalc, useMockBackend } from "../test/harness";
import { getWorkspaceDefaults, setWorkspaceDefaults } from "./defaults";

useMockBackend();
afterEach(() => setWorkspaceDefaults(null));

describe("Workspace default case (mock-mode convenience)", () => {
  test("with no defaults installed the form starts blank (the production behaviour)", async () => {
    loggedIn();
    expect(getWorkspaceDefaults()).toBeNull();
    await renderApp();
    expect((screen.getByLabelText("Route") as HTMLInputElement).value).toBe("");
    expect(await screen.findByText("Fill in the inputs, then click Run to see a verdict")).toBeInTheDocument();
  });

  test("an installed default case fills the form; one click on Run produces a verdict without typing anything", async () => {
    loggedIn();
    setWorkspaceDefaults(parseSnapshot(MOCK_QUOTE_INPUT));
    await renderApp();
    expect((screen.getByLabelText("Route") as HTMLInputElement).value).toBe("CN-VN");
    expect((screen.getByLabelText("Quantity (RT)") as HTMLInputElement).value).toBe("5000");
    expect(screen.queryByTestId("verdict")).not.toBeInTheDocument(); // nothing calculated yet
    runCalc();
    const verdict = await screen.findByTestId("verdict", undefined, { timeout: 5000 });
    expect(within(verdict).getByText("● GO")).toBeInTheDocument();
  });

  test("the default case is not 'unsaved changes': loading a previous quote would apply at once", async () => {
    loggedIn();
    setWorkspaceDefaults(parseSnapshot(MOCK_QUOTE_INPUT));
    await renderApp();
    // dirty stays false until the user edits something; the overwrite guard is exercised in round 2c
    expect(screen.queryByText("Replace current inputs?")).not.toBeInTheDocument();
  });
});
