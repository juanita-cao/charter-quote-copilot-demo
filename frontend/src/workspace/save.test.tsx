import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { delay, http, HttpResponse } from "msw";
import { parseSnapshot } from "../form/load";
import { zh } from "../i18n/zh";
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

type Body = Record<string, unknown>;
function record(path: string, bucket: Body[]) {
  server.events.on("request:start", async ({ request }) => {
    if (request.method === "POST" && new URL(request.url).pathname.endsWith(path)) bucket.push((await request.clone().json()) as Body);
  });
}

async function startWithSample(language: "en" | "zh" = "en") {
  loggedIn();
  setWorkspaceDefaults(parseSnapshot(MOCK_QUOTE_INPUT));
  await renderApp("/workspace", language);
}
async function startBlank(language: "en" | "zh" = "en") {
  loggedIn();
  await renderApp("/workspace", language);
}

const saveQuote = () => screen.getByRole("button", { name: /^(Save Quote|保存报价)$/ });
const saveDraft = () => screen.getByRole("button", { name: /^(Save Draft|保存草稿)$/ });
const routeBox = () => screen.getByLabelText("Route") as HTMLInputElement;
// The result row by its text: role queries over this form are slow in jsdom, and the row's role is covered by the tag test.
const previousRow = async (text: RegExp) => (await screen.findByText(text, { selector: ".previous-main" }, T)).closest("button") as HTMLButtonElement;
const openSearch = async () => {
  fireEvent.click(await screen.findByText("Start from a previous quote"));
  fireEvent.click(await screen.findByRole("button", { name: "Search" }));
};

describe("Save Quote (SA-20)", () => {
  test("is disabled until a Run has calculated the current inputs, and again after any edit", async () => {
    await startWithSample();
    expect(saveQuote()).toBeDisabled();
    runCalc();
    await screen.findByTestId("verdict", undefined, T);
    await waitFor(() => expect(saveQuote()).toBeEnabled(), T);
    setField("route", "TH-ID");
    await waitFor(() => expect(saveQuote()).toBeDisabled(), T);
  });

  test("sends the inputs and precision of the Run that was shown, then shows a success toast (L2-08)", async () => {
    const bodies: Body[] = [];
    record("/quotes", bodies);
    await startWithSample();
    runCalc();
    await screen.findByTestId("verdict", undefined, T);
    await waitFor(() => expect(saveQuote()).toBeEnabled(), T);
    fireEvent.click(saveQuote());
    expect(await screen.findByText("Quote saved", undefined, T)).toBeInTheDocument();
    const saved = bodies.find((b) => "precision_mode" in b && !("target_tce" in b) && b.route === "CN-VN");
    expect(saved?.precision_mode).toBe("display");
    expect(saved?.quantity).toBe(5000);
  });

  test("`success: false` shows the non-blocking warning and leaves the form alone (L2-08)", async () => {
    await startWithSample();
    setField("route", "FAIL-SAVE");
    runCalc();
    await screen.findByTestId("verdict", undefined, T);
    await waitFor(() => expect(saveQuote()).toBeEnabled(), T);
    fireEvent.click(saveQuote());
    expect(await screen.findByText("Could not save — nothing was stored", undefined, T)).toBeInTheDocument();
    expect(routeBox().value).toBe("FAIL-SAVE");
    expect(screen.queryByText("Quote saved")).not.toBeInTheDocument();
  });

  test("a 422 from the server is shown with its message", async () => {
    server.use(http.post(`${BASE}/api/v1/quotes`, () => HttpResponse.json({ detail: "quantity must be greater than 0" }, { status: 422 })));
    await startWithSample();
    runCalc();
    await screen.findByTestId("verdict", undefined, T);
    await waitFor(() => expect(saveQuote()).toBeEnabled(), T);
    fireEvent.click(saveQuote());
    expect(await screen.findByText("quantity must be greater than 0", undefined, T)).toBeInTheDocument();
  });

  test("a second click while the save is in flight sends one request", async () => {
    const bodies: Body[] = [];
    server.use(
      http.post(`${BASE}/api/v1/quotes`, async () => {
        await delay(300);
        return HttpResponse.json({ success: true });
      }),
    );
    record("/quotes", bodies);
    await startWithSample();
    runCalc();
    await screen.findByTestId("verdict", undefined, T);
    await waitFor(() => expect(saveQuote()).toBeEnabled(), T);
    const button = saveQuote();
    fireEvent.click(button);
    fireEvent.click(button);
    await screen.findByText("Quote saved", undefined, T);
    expect(bodies.filter((b) => b.route === "CN-VN" && !("target_tce" in b) && "precision_mode" in b)).toHaveLength(1);
  });
});

describe("Save Draft (SA-21)", () => {
  test("works on an incomplete form, sends only what was typed, and shows a toast (L2-09)", async () => {
    const bodies: Body[] = [];
    record("/drafts", bodies);
    await startBlank();
    setField("route", "SG-MY");
    fireEvent.click(saveDraft());
    expect(await screen.findByText("Draft saved", undefined, T)).toBeInTheDocument();
    expect(bodies).toHaveLength(1);
    // only what was typed, plus the fill-in date the form opens with (today, editable)
    expect(bodies[0]).toEqual({ route: "SG-MY", fill_in_date: todayIso() });
  });

  test("each click creates a new draft", async () => {
    const bodies: Body[] = [];
    record("/drafts", bodies);
    await startBlank();
    setField("route", "SG-MY");
    fireEvent.click(saveDraft());
    await screen.findByText("Draft saved", undefined, T);
    setField("route", "SG-ID");
    fireEvent.click(saveDraft());
    await waitFor(() => expect(bodies).toHaveLength(2), T);
  });
});

describe("Resume-draft banner (SA-11, SA-22, SA-23)", () => {
  test("shows once with Resume and Dismiss; Resume fills the form and removes the banner (L2-10)", async () => {
    await startBlank();
    expect(await screen.findByText(/You have an unfinished draft, saved/, undefined, T)).toBeInTheDocument();
    expect(routeBox().value).toBe("");
    fireEvent.click(screen.getByRole("button", { name: "Resume" }));
    await waitFor(() => expect(routeBox().value).toBe("CN-VN"), T);
    expect(screen.queryByText(/You have an unfinished draft/)).not.toBeInTheDocument();
  });

  test("Dismiss hides it, and it does not come back after a later Save Draft (L2-10)", async () => {
    await startBlank();
    await screen.findByText(/You have an unfinished draft/, undefined, T);
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByText(/You have an unfinished draft/)).not.toBeInTheDocument();
    setField("route", "SG-MY");
    fireEvent.click(saveDraft());
    await screen.findByText("Draft saved", undefined, T);
    await waitFor(() => expect(saveDraft()).toBeEnabled());
    expect(screen.queryByText(/You have an unfinished draft/)).not.toBeInTheDocument();
  });

  test("with no draft on the server there is no banner", async () => {
    server.use(http.get(`${BASE}/api/v1/drafts/latest`, () => HttpResponse.json({ draft: null, updated_at: null })));
    await startBlank();
    await screen.findByLabelText("Route");
    expect(screen.queryByText(/You have an unfinished draft/)).not.toBeInTheDocument();
  });

  test("dirty form: Resume + Cancel leaves the form and the banner; Resume + Replace applies and dismisses it (L2-23)", async () => {
    await startBlank();
    await screen.findByText(/You have an unfinished draft/, undefined, T);
    setField("route", "SG-MY");
    fireEvent.click(screen.getByRole("button", { name: "Resume" }));
    const dialog = await screen.findByRole("dialog", undefined, T);
    expect(within(dialog).getByText("Replace current inputs?")).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument(), T);
    expect(routeBox().value).toBe("SG-MY");
    expect(screen.getByText(/You have an unfinished draft/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Resume" }));
    fireEvent.click(within(await screen.findByRole("dialog", undefined, T)).getByRole("button", { name: "Replace" }));
    await waitFor(() => expect(routeBox().value).toBe("CN-VN"), T);
    expect(screen.queryByText(/You have an unfinished draft/)).not.toBeInTheDocument();
  });
});

describe("Start from a previous quote and the overwrite guard (SA-24, SA-25, OQ-1)", () => {
  test("search results carry a GO / NO-GO tag or a Draft tag", async () => {
    await startBlank();
    await openSearch();
    const quote = await previousRow(/TH-ID/);
    expect(within(quote).getByText("NO-GO")).toBeInTheDocument();
    const draft = screen.getByRole("button", { name: /^Draft/ });
    expect(within(draft).getByText("Draft")).toBeInTheDocument();
  });

  test("a clean form is replaced at once, without a modal (L2-11)", async () => {
    await startBlank();
    await openSearch();
    fireEvent.click(await previousRow(/TH-ID/));
    await waitFor(() => expect(routeBox().value).toBe("TH-ID"), T);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  test("a dirty form asks first; Cancel keeps it, Replace applies (L2-11)", async () => {
    await startBlank();
    setField("route", "SG-MY");
    await openSearch();
    fireEvent.click(await previousRow(/TH-ID/));
    const dialog = await screen.findByRole("dialog", undefined, T);
    expect(within(dialog).getByText("Replace current inputs?")).toBeInTheDocument();
    expect(within(dialog).getByText(/unsaved changes/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument(), T);
    expect(routeBox().value).toBe("SG-MY");

    // the closing modal briefly hides the page from assistive technology, so wait for the row to be reachable
    fireEvent.click(await previousRow(/TH-ID/));
    fireEvent.click(within(await screen.findByRole("dialog", undefined, T)).getByRole("button", { name: "Replace" }));
    await waitFor(() => expect(routeBox().value).toBe("TH-ID"), T);
  });

  test("loading a quote makes the result stale: Save Quote is disabled until Run", async () => {
    await startWithSample();
    runCalc();
    await screen.findByTestId("verdict", undefined, T);
    await openSearch();
    fireEvent.click(await previousRow(/TH-ID/));
    await waitFor(() => expect(routeBox().value).toBe("TH-ID"), T);
    expect(saveQuote()).toBeDisabled();
  });

  test("an empty search says so", async () => {
    server.use(
      http.get(`${BASE}/api/v1/quotes/search`, () => HttpResponse.json([])),
      http.get(`${BASE}/api/v1/drafts/search`, () => HttpResponse.json([])),
    );
    await startBlank();
    await openSearch();
    expect(await screen.findByText("No matching quotes or drafts", undefined, T)).toBeInTheDocument();
  });

  test("a failed search shows an error, not an empty list", async () => {
    server.use(http.get(`${BASE}/api/v1/quotes/search`, () => HttpResponse.json({ detail: "boom" }, { status: 500 })));
    await startBlank();
    await openSearch();
    expect(await screen.findByText("The search failed", undefined, T)).toBeInTheDocument();
    expect(screen.queryByText("No matching quotes or drafts")).not.toBeInTheDocument();
  });
});

describe("Save and edits made while saving (L2-22)", () => {
  test("an edit during an in-flight Save Quote keeps the form dirty, so loading still asks first", async () => {
    server.use(
      http.post(`${BASE}/api/v1/quotes`, async () => {
        await delay(400);
        return HttpResponse.json({ success: true });
      }),
    );
    await startWithSample();
    runCalc();
    await screen.findByTestId("verdict", undefined, T);
    await waitFor(() => expect(saveQuote()).toBeEnabled(), T);
    setField("cargo_description", "Coal"); // dirty, then the Run below matches it
    runCalc();
    await waitFor(() => expect(saveQuote()).toBeEnabled(), T);
    fireEvent.click(saveQuote());
    setField("route", "SG-MY"); // edited while the save is in flight
    await screen.findByText("Quote saved", undefined, T);
    await openSearch();
    fireEvent.click(await previousRow(/TH-ID/));
    expect(await screen.findByRole("dialog", undefined, T)).toBeInTheDocument();
  });

  test("saving with nothing edited since leaves the form clean: loading applies at once", async () => {
    await startWithSample();
    setField("cargo_description", "Coal");
    fireEvent.click(saveDraft());
    await screen.findByText("Draft saved", undefined, T);
    await openSearch();
    fireEvent.click(await previousRow(/TH-ID/));
    await waitFor(() => expect(routeBox().value).toBe("TH-ID"), T);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

describe("The form survives navigation (L2-12)", () => {
  test("Workspace → History → Workspace keeps the inputs", async () => {
    await startBlank();
    setField("route", "SG-MY");
    fireEvent.click(screen.getByRole("link", { name: /History/ }));
    await screen.findByTestId("where");
    await waitFor(() => expect(screen.getByTestId("where")).toHaveTextContent("/history"), T);
    fireEvent.click(screen.getByRole("link", { name: /Workspace/ }));
    await waitFor(() => expect(routeBox().value).toBe("SG-MY"), T);
  });
});

describe("Chinese labels", () => {
  test("buttons, banner, search and modal follow the language", async () => {
    await startBlank("zh");
    expect(await screen.findByText(/你有一份未完成的草稿/, undefined, T)).toBeInTheDocument();
    expect(saveQuote()).toBeDisabled();
    expect(saveDraft()).toBeEnabled();
    fireEvent.change(screen.getByLabelText(zh.fields.route), { target: { value: "SG-MY" } });
    fireEvent.click(screen.getByRole("button", { name: /恢\s?复/ }));
    expect(await screen.findByText("替换当前输入？", undefined, T)).toBeInTheDocument();
  });
});
