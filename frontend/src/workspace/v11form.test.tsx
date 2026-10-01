import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { parseSnapshot } from "../form/load";
import { todayIso } from "../form/fields";
import { MOCK_QUOTE_INPUT } from "../mocks/fixtures";
import { BASE, loggedIn, renderApp, runCalc, server, setField, useMockBackend } from "../test/harness";
import { setWorkspaceDefaults } from "./defaults";

useMockBackend();
afterEach(() => {
  setWorkspaceDefaults(null);
  server.events.removeAllListeners();
});
const T = { timeout: 8000 };
const FILL_IN = "Fill in the required fields to see a verdict";

type Body = Record<string, unknown>;
function recordCalc(bucket: Body[]) {
  server.events.on("request:start", async ({ request }) => {
    if (request.method === "POST" && new URL(request.url).pathname.endsWith("/quotes/calculate")) bucket.push((await request.clone().json()) as Body);
  });
}

async function start(language: "en" | "zh" = "en", filled = true) {
  loggedIn();
  if (filled) setWorkspaceDefaults(parseSnapshot(MOCK_QUOTE_INPUT));
  await renderApp("/workspace", language);
}
const box = (label: string) => screen.getByLabelText(label) as HTMLInputElement;
const timing = (name: "Loading time" | "Discharging time") => screen.getByLabelText(name);
const chooseRate = (name: "Loading time" | "Discharging time") => fireEvent.click(within(timing(name)).getByText("Rate"));
const chooseDays = (name: "Loading time" | "Discharging time") => fireEvent.click(within(timing(name)).getByText("Days"));

describe("Loading / discharging time: days or rate (L2-35, L2-36)", () => {
  test("days is the default: the days input is there and no rate input", async () => {
    await start();
    expect(box("Loading days").value).toBe("2");
    expect(screen.queryByLabelText("Loading rate (MT/day)")).not.toBeInTheDocument();
  });

  test("switching loading to Rate swaps the input, and says the days are calculated on Run", async () => {
    await start();
    chooseRate("Loading time");
    expect(await screen.findByLabelText("Loading rate (MT/day)")).toBeInTheDocument();
    expect(screen.queryByLabelText("Loading days")).not.toBeInTheDocument();
    expect(within(timing("Loading time").closest(".ant-form-item") as HTMLElement).getByText("calculated on Run")).toBeInTheDocument();
    expect(screen.getByLabelText("Discharging days")).toBeInTheDocument(); // the other port is untouched
  });

  test("after a Run the days the backend calculated are shown next to the rate", async () => {
    await start();
    chooseRate("Loading time");
    setField("loading_rate", "2500");
    runCalc();
    await screen.findByTestId("verdict", undefined, T);
    expect(await screen.findByText("= 2 days", undefined, T)).toBeInTheDocument(); // 5000 / 2500, from the response
  });

  test("the request carries the rate and the mode, not the typed days", async () => {
    const bodies: Body[] = [];
    recordCalc(bodies);
    await start();
    chooseRate("Loading time");
    setField("loading_rate", "2500");
    runCalc();
    await screen.findByTestId("verdict", undefined, T);
    expect(bodies[0]).toMatchObject({ loading_mode: "rate", loading_rate: 2500, discharging_days: 2 });
    expect("loading_days" in bodies[0]).toBe(false);
    expect("discharging_mode" in bodies[0]).toBe(false);
  });

  test("switching back restores the days that were typed", async () => {
    await start();
    setField("loading_days", "3.5");
    chooseRate("Loading time");
    chooseDays("Loading time");
    expect((await screen.findByLabelText("Loading days") as HTMLInputElement).value).toBe("3.5");
  });

  test("rate mode without a rate keeps Run at 'Fill in the required fields' and sends nothing", async () => {
    const bodies: Body[] = [];
    recordCalc(bodies);
    await start();
    chooseRate("Discharging time");
    runCalc();
    expect(await screen.findByText(FILL_IN, undefined, T)).toBeInTheDocument();
    expect(bodies).toHaveLength(0);
  });

  test("days mode without days likewise", async () => {
    const bodies: Body[] = [];
    recordCalc(bodies);
    await start();
    setField("loading_days", "");
    runCalc();
    expect(await screen.findByText(FILL_IN, undefined, T)).toBeInTheDocument();
    expect(bodies).toHaveLength(0);
  });
});

describe("Load-port and discharge-port PDA (L2-38)", () => {
  test("two fields, both sent; the single port cost field is gone", async () => {
    const bodies: Body[] = [];
    recordCalc(bodies);
    await start();
    expect(screen.queryByLabelText("Port cost / PDA (USD)")).not.toBeInTheDocument();
    expect(box("Load-port PDA (USD)").value).toBe("4000");
    setField("load_port_pda", "12000");
    setField("discharge_port_pda", "18000");
    runCalc();
    await screen.findByTestId("verdict", undefined, T);
    expect(bodies[0]).toMatchObject({ load_port_pda: 12000, discharge_port_pda: 18000 });
    expect("port_cost" in bodies[0]).toBe(false);
  });

  test("both are required", async () => {
    await start();
    setField("discharge_port_pda", "");
    runCalc();
    expect(await screen.findByText(FILL_IN, undefined, T)).toBeInTheDocument();
  });
});

describe("Others: custom voyage costs (L2-37)", () => {
  // the group is collapsed (its fields stay mounted), so a role query would skip the button: find it by its text
  const addCostButton = () => screen.getByText("Add cost").closest("button") as HTMLButtonElement;
  const addCost = () => fireEvent.click(addCostButton());

  test("add a row, fill it in, and it reaches the request as other_costs", async () => {
    const bodies: Body[] = [];
    recordCalc(bodies);
    await start();
    addCost();
    fireEvent.change(await screen.findByLabelText("Cost name 1"), { target: { value: "Fumigation" } });
    fireEvent.change(screen.getByLabelText("Cost amount 1 (USD)"), { target: { value: "800" } });
    runCalc();
    await screen.findByTestId("verdict", undefined, T);
    expect(bodies[0].other_costs).toEqual([{ name: "Fumigation", amount: 800 }]);
  });

  test("no rows: nothing is sent", async () => {
    const bodies: Body[] = [];
    recordCalc(bodies);
    await start();
    runCalc();
    await screen.findByTestId("verdict", undefined, T);
    expect("other_costs" in bodies[0]).toBe(false);
  });

  test("a half-filled row is incomplete; removing it makes the form complete again", async () => {
    await start();
    addCost();
    fireEvent.change(await screen.findByLabelText("Cost name 1"), { target: { value: "Survey" } });
    runCalc();
    expect(await screen.findByText(FILL_IN, undefined, T)).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Remove cost 1"));
    await waitFor(() => expect(screen.queryByLabelText("Cost name 1")).not.toBeInTheDocument(), T);
    runCalc();
    expect(await screen.findByTestId("verdict", undefined, T)).toBeInTheDocument();
  });

  test("rows can be added and removed independently", async () => {
    await start();
    addCost();
    addCost();
    fireEvent.change(await screen.findByLabelText("Cost name 1"), { target: { value: "A" } });
    fireEvent.change(screen.getByLabelText("Cost name 2"), { target: { value: "B" } });
    fireEvent.click(screen.getByLabelText("Remove cost 1"));
    await waitFor(() => expect((screen.getByLabelText("Cost name 1") as HTMLInputElement).value).toBe("B"), T);
    expect(screen.queryByLabelText("Cost name 2")).not.toBeInTheDocument();
  });

  test("20 is the maximum: the button is off, with a reason", async () => {
    await start();
    for (let i = 0; i < 20; i++) addCost();
    await screen.findByLabelText("Cost name 20", undefined, T);
    expect(addCostButton()).toBeDisabled();
    expect(screen.getByText("At most 20 items")).toBeInTheDocument();
  });
});

describe("Start from an enquiry: the cargo notes box (client correction 2026-09-21)", () => {
  const headers = () => Array.from(document.querySelectorAll(".workspace-inputs .ant-collapse-header-text")).map((h) => h.textContent);

  test("it is the first panel of the inputs, above 'Start from a previous quote' and the field groups", async () => {
    await start("en", false);
    expect(headers().slice(0, 3)).toEqual(["Start from an enquiry", "Start from a previous quote", "Cargo & Voyage Terms"]);
  });

  test("the notes box lives in that panel, not in the Cargo & Voyage Terms group", async () => {
    await start("en", false);
    const panel = box("Cargo notes").closest(".ant-collapse-item") as HTMLElement;
    expect(within(panel).getByText("Start from an enquiry")).toBeInTheDocument();
    const cargo = Array.from(document.querySelectorAll(".ant-collapse-item")).find((i) => i.textContent?.startsWith("Cargo & Voyage Terms")) as HTMLElement;
    expect(within(cargo).queryByLabelText("Cargo notes")).not.toBeInTheDocument();
  });

  test("it is open when the page opens, and says what to paste", async () => {
    await start("en", false);
    const panel = box("Cargo notes").closest(".ant-collapse-item") as HTMLElement;
    expect(panel.className).toContain("ant-collapse-item-active");
    expect((box("Cargo notes") as unknown as HTMLTextAreaElement).placeholder).toMatch(/Paste the customer's enquiry/);
  });

  test("Chinese: the panel is called 从询盘开始", async () => {
    await start("zh", false);
    expect(headers()[0]).toBe("从询盘开始");
  });
});

describe("Dates (L2-39) and cargo notes (L2-40)", () => {
  test("the fill-in date opens with today, and the laycan is empty", async () => {
    await start("en", false);
    expect(box("Fill-in date").value).toBe(todayIso());
    expect(box("Laycan from").value).toBe("");
    expect(box("Laycan to").value).toBe("");
  });

  test("dates, ports (via the voyage port sequence) and notes reach the request", async () => {
    const bodies: Body[] = [];
    recordCalc(bodies);
    await start();
    setField("laycan_start", "2026-11-10");
    setField("laycan_end", "2026-11-15");
    fireEvent.click(screen.getByText("Voyage Schedule"));
    fireEvent.click(screen.getByText("Add port"));
    fireEvent.click(screen.getByText("Add port"));
    fireEvent.change(screen.getByLabelText("Port 1"), { target: { value: "HOCHIMINH" } });
    fireEvent.click(within(screen.getByLabelText("Role for port 1")).getByText("Load"));
    fireEvent.change(screen.getByLabelText("Port 2"), { target: { value: "RIZHAO" } });
    fireEvent.click(within(screen.getByLabelText("Role for port 2")).getByText("Discharge"));
    fireEvent.change(box("Cargo notes"), { target: { value: "line 1\nline 2" } });
    runCalc();
    await screen.findByTestId("verdict", undefined, T);
    expect(bodies[0]).toMatchObject({ laycan_start: "2026-11-10", laycan_end: "2026-11-15", load_port: "HOCHIMINH", discharge_port: "RIZHAO", cargo_notes: "line 1\nline 2" });
    expect(bodies[0].voyage_ports).toEqual([
      { port: "HOCHIMINH", role: "load" },
      { port: "RIZHAO", role: "discharge" },
    ]);
  });

  test("laycan needs both ends", async () => {
    const bodies: Body[] = [];
    recordCalc(bodies);
    await start();
    setField("laycan_start", "2026-11-10");
    runCalc();
    expect(await screen.findByText(FILL_IN, undefined, T)).toBeInTheDocument();
    expect(bodies).toHaveLength(0);
  });

  test("an end before the start shows the hint and sends nothing", async () => {
    const bodies: Body[] = [];
    recordCalc(bodies);
    await start();
    setField("laycan_start", "2026-11-15");
    setField("laycan_end", "2026-11-10");
    expect(await screen.findByText("The laycan end must not be before the start", undefined, T)).toBeInTheDocument();
    runCalc();
    expect(await screen.findByText(FILL_IN, undefined, T)).toBeInTheDocument();
    expect(bodies).toHaveLength(0);
  });

  test("the notes keep their line breaks, show a counter, and are saved with a draft", async () => {
    const drafts: Body[] = [];
    server.events.on("request:start", async ({ request }) => {
      if (request.method === "POST" && new URL(request.url).pathname.endsWith("/drafts")) drafts.push((await request.clone().json()) as Body);
    });
    await start("en", false);
    fireEvent.change(box("Cargo notes"), { target: { value: "RUSSIA / VOSTOCHNY 3000\nAwaiting berthing about 1 day." } });
    expect(box("Cargo notes").value).toContain("\n");
    expect(screen.getByText(/\d+ \/ 4000/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save Draft" }));
    await waitFor(() => expect(drafts).toHaveLength(1), T);
    expect(drafts[0].cargo_notes).toBe("RUSSIA / VOSTOCHNY 3000\nAwaiting berthing about 1 day.");
  });

  test("Resume restores the notes and the new fields from a draft", async () => {
    server.use(
      http.get(`${BASE}/api/v1/drafts/latest`, () =>
        HttpResponse.json({ draft: { route: "CN-VN", cargo_notes: "keep me\nsecond line", loading_mode: "rate", loading_rate: 2500, other_costs: [{ name: "Survey", amount: 250 }] }, updated_at: "2026-09-18T14:02:00Z" }),
      ),
    );
    await start("en", false);
    fireEvent.click(await screen.findByText("Resume", undefined, T)); // by text: role queries are slow on this large form
    await waitFor(() => expect(box("Cargo notes").value).toBe("keep me\nsecond line"), T);
    expect((screen.getByLabelText("Loading rate (MT/day)") as HTMLInputElement).value).toBe("2500");
    expect((screen.getByLabelText("Cost name 1") as HTMLInputElement).value).toBe("Survey");
  });
});

describe("Old records: the estimated PDA split (L2-41)", () => {
  test("loading a draft that carries the backend's marker shows the notice once", async () => {
    server.use(
      http.get(`${BASE}/api/v1/drafts/latest`, () =>
        HttpResponse.json({ draft: { route: "CN-VN", load_port_pda: 15000, discharge_port_pda: 15000, _pda_split_estimated: true }, updated_at: "2026-08-10T10:00:00Z" }),
      ),
    );
    await start("en", false);
    fireEvent.click(await screen.findByText("Resume", undefined, T)); // by text: role queries are slow on this large form
    expect(await screen.findByText(/split evenly between the two ports/, undefined, T)).toBeInTheDocument();
    expect(box("Load-port PDA (USD)").value).toBe("15000");
    expect(box("Discharge-port PDA (USD)").value).toBe("15000");
  });

  test("a record without the marker shows no notice", async () => {
    await start("en", false);
    fireEvent.click(await screen.findByText("Resume", undefined, T)); // by text: role queries are slow on this large form
    await waitFor(() => expect(box("Route").value).toBe("CN-VN"), T);
    expect(screen.queryByText(/split evenly between the two ports/)).not.toBeInTheDocument();
  });
});

describe("New quote resets the v1.1 fields", () => {
  test("today's date, days mode and no Others again", async () => {
    await start();
    chooseRate("Loading time");
    fireEvent.click(screen.getByText("Add cost").closest("button")!);
    setField("fill_in_date", "2020-01-01");
    fireEvent.click(screen.getByText("New quote"));
    fireEvent.click(await screen.findByText("Clear and start", undefined, T));
    await waitFor(() => expect(box("Fill-in date").value).toBe(todayIso()), T);
    expect(screen.getByLabelText("Loading days")).toBeInTheDocument();
    expect(screen.queryByLabelText("Cost name 1")).not.toBeInTheDocument();
  });
});

describe("Chinese labels", () => {
  test("the new fields follow the language", async () => {
    await start("zh");
    for (const label of ["填表日期", "受载期 起", "受载期 止", "货盘备注", "装港 PDA（美元）", "卸港 PDA（美元）", "装货时间", "卸货时间"]) {
      expect(screen.getByLabelText(label), label).toBeInTheDocument();
    }
    expect(screen.getByText("其他费用")).toBeInTheDocument();
    fireEvent.click(screen.getByText("航次时间"));
    expect(screen.getByText("航次港口")).toBeInTheDocument();
    fireEvent.click(screen.getByText("添加港口"));
    expect(screen.getByLabelText("港口 1 的角色")).toBeInTheDocument();
    for (const role of ["途经", "装港", "卸港"]) expect(screen.getByText(role)).toBeInTheDocument();
  });
});
