import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { en } from "../i18n/en";
import { MOCK_CUSTOM_PORTS } from "../mocks/fixtures";
import { loggedIn, renderApp, useMockBackend } from "../test/harness";

// Distance lookup, Phase 1 (design_frontend.md §12, PT-21), and the voyage port sequence that replaced the separate
// Load port / Discharge port fields. config/cargoPorts.test.ts, form/voyagePorts.test.ts and vm/distance.test.ts
// cover the matching/summing/validation logic directly; this only checks the fields are wired to it.

useMockBackend();
const T = { timeout: 8000 };
const field = (name: keyof typeof en.fields) => screen.getByLabelText(en.fields[name]) as HTMLInputElement;

async function start() {
  loggedIn();
  await renderApp("/workspace?blank");
  fireEvent.click(screen.getByText("Voyage Schedule")); // the sequence lives in this collapsed group
}

function addPort(n: number, port: string, role?: "Load" | "Discharge") {
  fireEvent.click(screen.getByText("Add port"));
  fireEvent.change(screen.getByLabelText(`Port ${n}`), { target: { value: port } });
  if (role) fireEvent.click(within(screen.getByLabelText(`Role for port ${n}`)).getByText(role));
}

describe("Voyage ports: load / discharge derive laden distance", () => {
  test("a known pair fills laden_distance silently (no caption, client feedback 2026-09-22); it stays editable", async () => {
    await start();
    addPort(1, "Dalian", "Load");
    addPort(2, "Gunsan", "Discharge");
    await waitFor(() => expect(field("laden_distance").value).toBe("303"), T);
    expect(screen.queryByText(/No history for/)).not.toBeInTheDocument();
    fireEvent.change(field("laden_distance"), { target: { value: "999" } });
    expect(field("laden_distance").value).toBe("999");
  });

  test("switching to a pair with no history clears a previously-filled number, it is not left stale (client feedback 2026-09-22)", async () => {
    await start();
    addPort(1, "Dalian", "Load");
    addPort(2, "Gunsan", "Discharge");
    await waitFor(() => expect(field("laden_distance").value).toBe("303"), T);
    fireEvent.change(screen.getByLabelText("Port 2"), { target: { value: "Notaporttown" } });
    await waitFor(() => expect(screen.getByText(/No history for/)).toBeInTheDocument(), T);
    expect(field("laden_distance").value).toBe("");
  });

  test("an unknown pair fills nothing, and names the leg", async () => {
    await start();
    addPort(1, "Nowhereville", "Load");
    addPort(2, "Notaporttown", "Discharge");
    await waitFor(() => expect(screen.getByText(/No history for: Nowhereville/)).toBeInTheDocument(), T);
    expect(field("laden_distance").value).toBe("");
  });

  test("no caption with no ports tagged yet", async () => {
    await start();
    await new Promise((r) => setTimeout(r, 300));
    expect(screen.queryByText(/No history for/)).not.toBeInTheDocument();
  });
});

describe("Voyage ports: ballast is the legs before Load plus the legs after Discharge", () => {
  test("a waypoint before Load is one ballast leg, filled silently", async () => {
    await start();
    addPort(1, "Busan");
    addPort(2, "Vostochny", "Load");
    await waitFor(() => expect(field("ballast_distance").value).toBe("507"), T);
    expect(screen.queryByText(/No history for/)).not.toBeInTheDocument();
  });

  test("nothing after Discharge: no extra leg, ballast is just the pre-load chain", async () => {
    await start();
    addPort(1, "Busan");
    addPort(2, "Vostochny", "Load");
    addPort(3, "Tianjin", "Discharge");
    await waitFor(() => expect(field("ballast_distance").value).toBe("507"), T);
  });

  test("no waypoints and no Load tagged: nothing to look up, no caption", async () => {
    await start();
    await new Promise((r) => setTimeout(r, 300));
    expect(field("ballast_distance").value).toBe("");
  });
});

describe("Voyage ports: only one Load, only one Discharge, Discharge after Load", () => {
  test("a second Load row is an error, not a silent swap", async () => {
    await start();
    addPort(1, "A", "Load");
    addPort(2, "B", "Load");
    expect(await screen.findByText("Only one row can be Load — change or remove the other one", undefined, T)).toBeInTheDocument();
  });

  test("a second Discharge row is an error", async () => {
    await start();
    addPort(1, "A", "Load");
    addPort(2, "B", "Discharge");
    addPort(3, "C", "Discharge");
    expect(await screen.findByText("Only one row can be Discharge — change or remove the other one", undefined, T)).toBeInTheDocument();
  });

  test("Discharge before Load is an error", async () => {
    await start();
    addPort(1, "A", "Discharge");
    addPort(2, "B", "Load");
    expect(await screen.findByText("Discharge must come after Load in the list", undefined, T)).toBeInTheDocument();
  });
});

describe("Voyage ports: suggestions and custom ports", () => {
  test("typing an old spelling suggests the standard port, and picking it fills the row", async () => {
    await start();
    fireEvent.click(screen.getByText("Add port"));
    fireEvent.change(screen.getByLabelText("Port 1"), { target: { value: "Kunsan" } });
    const options = await screen.findAllByText("Gunsan", undefined, T);
    fireEvent.click(options.map((o) => o.closest(".ant-select-item-option")).find(Boolean)!);
    expect((screen.getByLabelText("Port 1") as HTMLInputElement).value).toBe("Gunsan");
  });

  test("a company's custom ports (no standard entry) are suggested too", async () => {
    await start();
    fireEvent.click(screen.getByText("Add port"));
    fireEvent.change(screen.getByLabelText("Port 1"), { target: { value: MOCK_CUSTOM_PORTS[0].slice(0, 4) } });
    expect(await screen.findByText(MOCK_CUSTOM_PORTS[0], undefined, T)).toBeInTheDocument();
  });

  test("free text with no match is still accepted", async () => {
    await start();
    fireEvent.click(screen.getByText("Add port"));
    fireEvent.change(screen.getByLabelText("Port 1"), { target: { value: "A made-up jetty" } });
    expect((screen.getByLabelText("Port 1") as HTMLInputElement).value).toBe("A made-up jetty");
  });
});

describe("Voyage ports: reordering (client request 2026-09-22 — move up/down, not drag-and-drop)", () => {
  test("moving the second row up swaps the two rows", async () => {
    await start();
    addPort(1, "A");
    addPort(2, "B");
    fireEvent.click(screen.getByLabelText("Move port 2 up"));
    expect((screen.getByLabelText("Port 1") as HTMLInputElement).value).toBe("B");
    expect((screen.getByLabelText("Port 2") as HTMLInputElement).value).toBe("A");
  });

  test("the first row cannot move up, the last row cannot move down", async () => {
    await start();
    addPort(1, "A");
    addPort(2, "B");
    expect(screen.getByLabelText("Move port 1 up")).toBeDisabled();
    expect(screen.getByLabelText("Move port 2 down")).toBeDisabled();
    expect(screen.getByLabelText("Move port 1 down")).not.toBeDisabled();
    expect(screen.getByLabelText("Move port 2 up")).not.toBeDisabled();
  });

  test("the tagged role travels with its row", async () => {
    await start();
    addPort(1, "A", "Load");
    addPort(2, "B");
    fireEvent.click(screen.getByLabelText("Move port 2 up"));
    fireEvent.click(within(screen.getByLabelText("Role for port 1")).getByText("Waypoint"));
    // "A" (still tagged Load) is now row 2
    expect(within(screen.getByLabelText("Role for port 2")).getByText("Load").closest(".ant-segmented-item-selected")).toBeTruthy();
  });

  test("reordering into an invalid sequence clears both distances instead of leaving (or doubling) the old numbers (found 2026-09-22)", async () => {
    await start();
    addPort(1, "Busan", "Load");
    addPort(2, "Vostochny", "Discharge");
    await waitFor(() => expect(field("laden_distance").value).toBe("507"), T);
    fireEvent.click(screen.getByLabelText("Move port 2 up")); // now Discharge, then Load — invalid
    await waitFor(() => expect(screen.getByText("Discharge must come after Load in the list")).toBeInTheDocument(), T);
    expect(field("ballast_distance").value).toBe("");
    expect(field("laden_distance").value).toBe("");
  });
});
