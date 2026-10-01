import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { vi } from "vitest";
import { delay, http, HttpResponse } from "msw";
import { zh } from "../i18n/zh";
import { MOCK_HISTORY_DRAFTS, MOCK_HISTORY_QUOTES } from "../mocks/fixtures";
import { BASE, countRequests, loggedIn, renderApp, server, setField, useMockBackend } from "../test/harness";
import { setWorkspaceDefaults } from "../workspace/defaults";

useMockBackend();
afterEach(() => {
  setWorkspaceDefaults(null);
  server.events.removeAllListeners();
});
const T = { timeout: 8000 };

// Rows in the default mock: quotes 12 (GO, CN-VN), 11 (NO-GO, TH-ID), 10 (SG-MY, snapshot as a string) and draft 7 (CN-VN, ore).
async function openHistory(language: "en" | "zh" = "en") {
  loggedIn();
  await renderApp("/history", language);
  await screen.findByText("TH-ID", undefined, T);
}
const row = (text: string) => screen.getByText(text).closest("tr") as HTMLElement;
const selectAll = () => fireEvent.click(screen.getByLabelText(/^(Select all|全选)$/));
const routeBox = () => screen.getByLabelText("Route") as HTMLInputElement;

describe("History list (SA-26)", () => {
  test("one table for quotes and drafts: GO / NO-GO tags, a Draft tag, newest first, pills with counts (L2-13)", async () => {
    await openHistory();
    expect(within(row("TH-ID")).getByText("NO-GO")).toBeInTheDocument();
    const drafts = screen.getAllByText("Draft", { selector: ".ant-tag" });
    expect(drafts).toHaveLength(1);
    expect(screen.getByText("Total: 4")).toBeInTheDocument();
    expect(screen.getByLabelText("All 4")).toBeInTheDocument();
    expect(screen.getByLabelText("Quotes 3")).toBeInTheDocument();
    expect(screen.getByLabelText("Drafts 1")).toBeInTheDocument();
    const dates = Array.from(document.querySelectorAll("tbody tr.ant-table-row")).map((r) => r.textContent ?? "");
    expect(dates[0]).toContain("2026-09-18");
    expect(dates[dates.length - 1]).toContain("2026-09-14");
  });

  test("a pill filters the rows already loaded, without a request", async () => {
    await openHistory();
    const requests = countRequests("/quotes", "GET");
    fireEvent.click(screen.getByLabelText("Drafts 1"));
    await waitFor(() => expect(screen.queryByText("TH-ID")).not.toBeInTheDocument(), T);
    expect(screen.getAllByText("Draft", { selector: ".ant-tag" })).toHaveLength(1);
    expect(requests.count()).toBe(0);
    requests.stop();
  });

  test("a request that fails shows an error with Retry, never the empty state (L2-18)", async () => {
    loggedIn();
    server.use(http.get(`${BASE}/api/v1/quotes`, () => HttpResponse.error(), { once: true }));
    await renderApp("/history");
    expect(await screen.findByText("Could not load the history", undefined, T)).toBeInTheDocument();
    expect(screen.queryByText("No results were returned for this range")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("TH-ID", undefined, T)).toBeInTheDocument();
  });

  test("`200 []` shows the neutral empty state with Refresh (L2-19)", async () => {
    loggedIn();
    server.use(
      http.get(`${BASE}/api/v1/quotes`, () => HttpResponse.json([])),
      http.get(`${BASE}/api/v1/drafts`, () => HttpResponse.json([])),
    );
    await renderApp("/history");
    expect(await screen.findByText("No results were returned for this range", undefined, T)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Refresh" })).toBeInTheDocument();
  });
});

describe("History search (SA-27)", () => {
  test("submits the filled filters to both search routes (blank ones mean no filter)", async () => {
    const seen: string[] = [];
    server.events.on("request:start", ({ request }) => {
      const u = new URL(request.url);
      if (u.pathname.endsWith("/quotes/search") || u.pathname.endsWith("/drafts/search")) {
        seen.push(u.pathname.split("/").slice(-2).join("/") + "?" + Array.from(u.searchParams).filter(([, v]) => v !== "" && v !== "0").map(([k, v]) => `${k}=${v}`).join("&"));
      }
    });
    await openHistory();
    fireEvent.change(screen.getByLabelText("Route"), { target: { value: "TH-ID" } });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    await waitFor(() => expect(seen).toHaveLength(2), T);
    expect(seen.sort()).toEqual(["drafts/search?route=TH-ID", "quotes/search?route=TH-ID"]);
  });

  test("Reset returns to the month range", async () => {
    await openHistory();
    fireEvent.change(screen.getByLabelText("Route"), { target: { value: "TH-ID" } });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    await screen.findByText("Total: 3", undefined, T);
    fireEvent.click(screen.getByRole("button", { name: "Reset" }));
    await screen.findByText("Total: 4", undefined, T);
    expect((screen.getByLabelText("Route") as HTMLInputElement).value).toBe("");
  });
});

describe("Selecting and deleting (SA-28, SA-29)", () => {
  test("Select all counts the rows, and the confirmation shows the quote / draft split (L2-13)", async () => {
    await openHistory();
    selectAll();
    expect(await screen.findByText("4 selected")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Delete selected" }));
    const dialog = await screen.findByRole("dialog", undefined, T);
    expect(within(dialog).getByText("Delete 4 selected records?")).toBeInTheDocument();
    expect(within(dialog).getByText(/3 quotes will be removed from History, Search and Excel export/)).toBeInTheDocument();
    expect(within(dialog).getByText(/1 draft will be permanently deleted/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument(), T);
    expect(screen.getByText("4 selected")).toBeInTheDocument();
  });

  test("Delete selected is off until something is selected", async () => {
    await openHistory();
    expect(screen.getByRole("button", { name: "Delete selected" })).toBeDisabled();
  });

  test("a successful delete shows 'Deleted N', clears the selection and refetches both lists", async () => {
    await openHistory();
    const quotes = countRequests("/quotes", "GET");
    selectAll();
    fireEvent.click(await screen.findByRole("button", { name: "Delete selected" }));
    fireEvent.click(within(await screen.findByRole("dialog", undefined, T)).getByRole("button", { name: "Delete" }));
    expect(await screen.findByText("Deleted 4", undefined, T)).toBeInTheDocument();
    await waitFor(() => expect(quotes.count()).toBeGreaterThanOrEqual(1), T);
    await waitFor(() => expect(screen.queryByText(/^\d+ selected$/)).not.toBeInTheDocument(), T);
    quotes.stop();
  });

  test("one side failing names it, keeps the other's result and still refetches (L2-14)", async () => {
    server.use(http.get(`${BASE}/api/v1/drafts`, () => HttpResponse.json([{ ...MOCK_HISTORY_DRAFTS[0], id: 999 }])));
    await openHistory();
    const quotes = countRequests("/quotes", "GET");
    selectAll();
    fireEvent.click(await screen.findByRole("button", { name: "Delete selected" }));
    fireEvent.click(within(await screen.findByRole("dialog", undefined, T)).getByRole("button", { name: "Delete" }));
    expect(await screen.findByText("Deleted 3 quotes. The drafts could not be deleted.", undefined, T)).toBeInTheDocument();
    expect(screen.queryByText(/^Deleted 4/)).not.toBeInTheDocument();
    await waitFor(() => expect(quotes.count()).toBeGreaterThanOrEqual(1), T);
    quotes.stop();
  });

  test("the targets are frozen when Delete is clicked: ticking another row cannot change what is deleted (L2-27)", async () => {
    const deleted: number[][] = [];
    server.events.on("request:start", async ({ request }) => {
      if (request.method === "POST" && new URL(request.url).pathname.endsWith("/quotes/bulk-delete")) {
        deleted.push(((await request.clone().json()) as { record_ids: number[] }).record_ids);
      }
    });
    await openHistory();
    fireEvent.click(within(row("TH-ID")).getByRole("checkbox"));
    fireEvent.click(within(row("SG-MY")).getByRole("checkbox"));
    fireEvent.click(await screen.findByRole("button", { name: "Delete selected" }));
    const dialog = await screen.findByRole("dialog", undefined, T);
    expect(within(dialog).getByText("Delete 2 selected records?")).toBeInTheDocument();
    fireEvent.click(within(document.body).getAllByText("Iron ore")[0].closest("tr")!.querySelector("input[type=checkbox]")!);
    expect(within(dialog).getByText("Delete 2 selected records?")).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(deleted).toHaveLength(1), T);
    expect(deleted[0].sort()).toEqual([10, 11]);
  });
});

describe("Coming back to History (regression found by the real-backend smoke run, 2026-09-21)", () => {
  test("History -> Workspace -> History under StrictMode shows the list again, not a blank page", async () => {
    loggedIn();
    await renderApp("/history", "en", { strict: true });
    await screen.findByText("Total: 4", undefined, T);
    fireEvent.click(screen.getByRole("link", { name: /Workspace/ }));
    await screen.findByLabelText("Route", undefined, T);
    fireEvent.click(screen.getByRole("link", { name: /History/ }));
    expect(await screen.findByText("Total: 4", undefined, T)).toBeInTheDocument();
  });
});

describe("Loading a record into the Workspace (SA-30)", () => {
  test("Load on a row opens the Workspace filled with that record", async () => {
    await openHistory();
    fireEvent.click(within(row("TH-ID")).getByRole("button", { name: "Load" }));
    await waitFor(() => expect(routeBox().value).toBe("TH-ID"), T);
    expect(screen.getByTestId("where")).toHaveTextContent("/workspace");
  });

  test("double-clicking a row does the same", async () => {
    await openHistory();
    fireEvent.doubleClick(row("TH-ID"));
    await waitFor(() => expect(routeBox().value).toBe("TH-ID"), T);
    expect(screen.getByTestId("where")).toHaveTextContent("/workspace");
  });

  test("a draft row loads too", async () => {
    await openHistory();
    fireEvent.doubleClick(screen.getByText("ore").closest("tr")!);
    await waitFor(() => expect(routeBox().value).toBe("CN-VN"), T);
  });

  test("a dirty Workspace form asks before it is replaced (OQ-1)", async () => {
    loggedIn();
    await renderApp("/workspace");
    setField("route", "SG-ID");
    fireEvent.click(screen.getByRole("link", { name: /History/ }));
    await screen.findByText("TH-ID", undefined, T);
    fireEvent.doubleClick(row("TH-ID"));
    const dialog = await screen.findByRole("dialog", undefined, T);
    expect(within(dialog).getByText("Replace current inputs?")).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Replace" }));
    await waitFor(() => expect(routeBox().value).toBe("TH-ID"), T);
  });

  test("a record whose inputs cannot be read cannot be loaded", async () => {
    server.use(http.get(`${BASE}/api/v1/drafts`, () => HttpResponse.json([{ ...MOCK_HISTORY_DRAFTS[0], raw_input_json: null }])));
    await openHistory();
    expect(within(screen.getByText("ore").closest("tr")!).getByRole("button", { name: "Load" })).toBeDisabled();
  });
});

describe("Download Excel (SA-31, T2.22)", () => {
  const downloads: string[] = [];
  beforeEach(() => {
    downloads.length = 0;
    URL.createObjectURL = vi.fn(() => "blob:test");
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      downloads.push(this.download);
    });
  });
  afterEach(() => vi.restoreAllMocks());
  const download = () => screen.getByRole("button", { name: "Download Excel" });
  const exportBodies = () => {
    const bodies: { record_keys: string[] }[] = [];
    server.events.on("request:start", async ({ request }) => {
      if (request.method === "POST" && new URL(request.url).pathname.endsWith("/api/v1/export")) {
        bodies.push((await request.clone().json()) as { record_keys: string[] });
      }
    });
    return bodies;
  };

  test("is off until something is selected, then on", async () => {
    await openHistory();
    expect(download()).toBeDisabled();
    fireEvent.click(within(row("TH-ID")).getByRole("checkbox"));
    await waitFor(() => expect(download()).toBeEnabled(), T);
  });

  test("sends exactly the selected keys and saves the file under a dated name", async () => {
    const bodies = exportBodies();
    await openHistory();
    fireEvent.click(within(row("TH-ID")).getByRole("checkbox"));
    fireEvent.click(within(screen.getByText("ore").closest("tr")!).getByRole("checkbox"));
    await waitFor(() => expect(download()).toBeEnabled(), T);
    fireEvent.click(download());
    await waitFor(() => expect(downloads).toHaveLength(1), T);
    expect(bodies).toHaveLength(1);
    expect(bodies[0].record_keys.sort()).toEqual(["d7", "q11"]);
    expect(downloads[0]).toMatch(/^history_\d{4}-\d{2}-\d{2}\.xlsx$/);
    expect(URL.revokeObjectURL).toHaveBeenCalled();
    expect(screen.getByText("2 selected")).toBeInTheDocument(); // the selection is kept
  });

  test("a failed export says so and downloads nothing", async () => {
    server.use(http.post(`${BASE}/api/v1/export`, () => HttpResponse.json({ detail: "boom" }, { status: 500 })));
    await openHistory();
    fireEvent.click(within(row("TH-ID")).getByRole("checkbox"));
    await waitFor(() => expect(download()).toBeEnabled(), T);
    fireEvent.click(download());
    expect(await screen.findByText("Could not create the Excel file", undefined, T)).toBeInTheDocument();
    expect(downloads).toHaveLength(0);
  });

  test("while the file is being made the button shows it is busy and cannot be clicked again", async () => {
    let calls = 0;
    server.use(
      http.post(`${BASE}/api/v1/export`, async () => {
        calls += 1;
        await delay(400);
        return new HttpResponse(new Uint8Array([80, 75]), { headers: { "Content-Type": "application/octet-stream" } });
      }),
    );
    await openHistory();
    fireEvent.click(within(row("TH-ID")).getByRole("checkbox"));
    await waitFor(() => expect(download()).toBeEnabled(), T);
    const button = download();
    fireEvent.click(button);
    fireEvent.click(button);
    await waitFor(() => expect(downloads).toHaveLength(1), T);
    expect(calls).toBe(1);
  });
});

describe("Other controls", () => {
  test("an older, slower response does not replace a newer one (L2-25)", async () => {
    let calls = 0;
    server.use(
      http.get(`${BASE}/api/v1/quotes`, async () => {
        calls += 1;
        if (calls === 1) return HttpResponse.json(MOCK_HISTORY_QUOTES);
        if (calls === 2) {
          await delay(1500);
          return HttpResponse.json([{ ...MOCK_HISTORY_QUOTES[0], id: 71, route: "OLD-ROUTE" }]);
        }
        return HttpResponse.json([{ ...MOCK_HISTORY_QUOTES[0], id: 72, route: "NEW-ROUTE" }]);
      }),
    );
    await openHistory();
    fireEvent.click(screen.getByRole("button", { name: "Reset" })); // request 2 (slow)
    fireEvent.click(screen.getByRole("button", { name: "Reset" })); // request 3 (fast) supersedes it
    expect(await screen.findByText("NEW-ROUTE", undefined, T)).toBeInTheDocument();
    await new Promise((r) => setTimeout(r, 1800));
    expect(screen.queryByText("OLD-ROUTE")).not.toBeInTheDocument();
    expect(screen.getByText("NEW-ROUTE")).toBeInTheDocument();
  });

  test("labels follow the language", async () => {
    await openHistory("zh");
    expect(screen.getByRole("button", { name: /搜\s?索/ })).toBeInTheDocument();
    expect(screen.getByLabelText(zh.history.selectAll)).toBeInTheDocument();
    expect(screen.getByText("共 4 条")).toBeInTheDocument();
  });
});
