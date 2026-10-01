import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { MemoryRouter, useLocation } from "react-router-dom";
import { AppProviders } from "./AppProviders";
import { createI18n } from "../i18n";
import { createHandlers, MOCK_AUTH_KEY } from "../mocks/handlers";
import { AppRoutes } from "../routes/AppRoutes";
import { SIDEBAR_KEY } from "../prefs/uiPrefs";

const BASE = "http://shell.test";
const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
beforeEach(() => {
  window.localStorage.clear();
  server.use(...createHandlers({ baseUrl: BASE, latencyMs: 0, idleExpiryMs: Infinity }));
});
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const loggedIn = () => window.localStorage.setItem(MOCK_AUTH_KEY, "1");

function Where() {
  return <div data-testid="where">{useLocation().pathname}</div>;
}

async function renderApp(path = "/workspace") {
  const i18n = await createI18n("en");
  return render(
    <AppProviders baseUrl={BASE} i18n={i18n}>
      <MemoryRouter initialEntries={[path]}>
        <Where />
        <AppRoutes />
      </MemoryRouter>
    </AppProviders>,
  );
}
const where = () => screen.getByTestId("where").textContent;
// The Workspace screen is recognised by its own content (it has no page title in the design).
const WORKSPACE_MARKER = "Fill in the inputs, then click Run to see a verdict";
const inWorkspace = () => screen.findByText(WORKSPACE_MARKER);

describe("L2-03 bootstrap", () => {
  test("a spinner first, then Workspace when authenticated", async () => {
    loggedIn();
    await renderApp("/workspace");
    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.queryByText("Login to your account")).not.toBeInTheDocument();
    await inWorkspace();
    expect(where()).toBe("/workspace");
  });

  test("anonymous visitors are sent to /login, and never see protected content", async () => {
    await renderApp("/history");
    expect(await screen.findByText("Login to your account")).toBeInTheDocument();
    expect(where()).toBe("/login");
    expect(screen.queryByRole("heading", { name: "History" })).not.toBeInTheDocument();
  });

  test("an unknown path goes to Workspace when authenticated, and root renders Workspace", async () => {
    loggedIn();
    await renderApp("/nope");
    await inWorkspace();
    expect(where()).toBe("/workspace");
  });

  test("/auth/me failing with 503 shows the retry screen (not the login page); Retry recovers", async () => {
    loggedIn();
    let healthy = false;
    server.use(
      http.get(`${BASE}/api/v1/auth/me`, () =>
        healthy ? HttpResponse.json({ user_id: 1, company_id: 1, company_name: "Acme Shipping Pte Ltd" }) : HttpResponse.json({ detail: "down" }, { status: 503 }),
      ),
    );
    await renderApp("/workspace");
    expect(await screen.findByText("Can't reach the server")).toBeInTheDocument();
    expect(screen.queryByText("Login to your account")).not.toBeInTheDocument();
    healthy = true;
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    await inWorkspace();
  });
});

describe("L2-01 login", () => {
  const fill = async (email: string, password = "pw12345678") => {
    await userEvent.type(await screen.findByLabelText("Email"), email);
    await userEvent.type(screen.getByLabelText("Password"), password);
    await userEvent.click(screen.getByRole("button", { name: "Login" }));
  };

  test("success lands on Workspace and shows the company name in the header", async () => {
    await renderApp("/login");
    await fill("me@example.com");
    await inWorkspace();
    expect(where()).toBe("/workspace");
    expect(await screen.findByText(/Acme Shipping Pte Ltd/)).toBeInTheDocument();
  });

  test("wrong password shows the generic error under Password and stays on /login", async () => {
    await renderApp("/login");
    await fill("wrong@example.com");
    expect(await screen.findByText("Invalid email or password")).toBeInTheDocument();
    expect(where()).toBe("/login");
  });

  test("a rate-limited account shows the rate-limit message", async () => {
    await renderApp("/login");
    await fill("locked@example.com");
    expect(await screen.findByText("Too many attempts, try again later")).toBeInTheDocument();
  });

  test("a network failure shows the generic message, not the wrong-password one", async () => {
    server.use(http.post(`${BASE}/api/v1/auth/login`, () => HttpResponse.error()));
    await renderApp("/login");
    await fill("me@example.com");
    expect(await screen.findByText("Something went wrong. Please try again.")).toBeInTheDocument();
    expect(screen.queryByText("Invalid email or password")).not.toBeInTheDocument();
  });

  test("an authenticated visitor to /login is sent to Workspace", async () => {
    loggedIn();
    await renderApp("/login");
    await inWorkspace();
    expect(where()).toBe("/workspace");
  });
});

describe("L2-02 register", () => {
  const fillRegister = async (over: { company?: string; password?: string; confirm?: string } = {}) => {
    await userEvent.type(await screen.findByLabelText("Company name"), over.company ?? "New Co");
    await userEvent.type(screen.getByLabelText("Admin email"), "admin@newco.example");
    await userEvent.type(screen.getByLabelText("Password (min 8)"), over.password ?? "pw12345678");
    await userEvent.type(screen.getByLabelText("Confirm password"), over.confirm ?? over.password ?? "pw12345678");
    await userEvent.click(screen.getByRole("button", { name: "Register" }));
  };

  test("a 400 with a string detail shows it inline", async () => {
    await renderApp("/register");
    await fillRegister({ company: "Duplicate Co" });
    expect(await screen.findByText("A company with this name already exists")).toBeInTheDocument();
    expect(where()).toBe("/register");
  });

  test("a 422 with a list detail shows the joined message inline", async () => {
    server.use(
      http.post(`${BASE}/api/v1/auth/register`, () =>
        HttpResponse.json({ detail: [{ loc: ["body", "password"], msg: "Password is too weak", type: "value_error" }] }, { status: 422 }),
      ),
    );
    await renderApp("/register");
    await fillRegister();
    expect(await screen.findByText(/Password is too weak/)).toBeInTheDocument();
  });

  test("mismatched passwords are caught before any request is sent", async () => {
    let called = false;
    server.use(http.post(`${BASE}/api/v1/auth/register`, () => ((called = true), HttpResponse.json({}, { status: 201 }))));
    await renderApp("/register");
    await fillRegister({ password: "pw12345678", confirm: "different99" });
    expect(await screen.findByText("Passwords do not match")).toBeInTheDocument();
    expect(called).toBe(false);
  });

  test("success registers, logs in with the same credentials and lands on Workspace", async () => {
    await renderApp("/register");
    await fillRegister();
    await inWorkspace();
  });
});

describe("L2-17 logout", () => {
  const openMenuAndLogout = async () => {
    await userEvent.click(await screen.findByRole("button", { name: "Account" }));
    await userEvent.click(await screen.findByText("Logout"));
  };

  test("success returns to /login and the session is gone", async () => {
    loggedIn();
    await renderApp("/workspace");
    await openMenuAndLogout();
    expect(await screen.findByText("Login to your account")).toBeInTheDocument();
    expect(where()).toBe("/login");
    expect(window.localStorage.getItem(MOCK_AUTH_KEY)).toBeNull();
  });

  test("a 500 keeps the user logged in, on the same page, with an error message", async () => {
    loggedIn();
    server.use(http.post(`${BASE}/api/v1/auth/logout`, () => HttpResponse.json({ detail: "boom" }, { status: 500 })));
    await renderApp("/workspace");
    await openMenuAndLogout();
    expect(await screen.findByText("Logout failed. Please try again.")).toBeInTheDocument();
    expect(where()).toBe("/workspace");
    expect(screen.getByText(WORKSPACE_MARKER)).toBeInTheDocument();
    expect(window.localStorage.getItem(MOCK_AUTH_KEY)).toBe("1");
  });
});

describe("L2-15 sidebar", () => {
  test("collapse toggles the rail, persists across a reload", async () => {
    loggedIn();
    const first = await renderApp("/workspace");
    const nav = await screen.findByRole("navigation", { name: "main" });
    expect(nav).not.toHaveClass("collapsed");
    expect(within(nav).getByText("History")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Collapse sidebar" }));
    expect(nav).toHaveClass("collapsed");
    expect(within(nav).queryByText("History")).not.toBeInTheDocument();
    expect(window.localStorage.getItem(SIDEBAR_KEY)).toBe("true");

    first.unmount();
    await renderApp("/workspace");
    expect(await screen.findByRole("navigation", { name: "main" })).toHaveClass("collapsed");
    await userEvent.click(screen.getByRole("button", { name: "Expand sidebar" }));
    expect(screen.getByRole("navigation", { name: "main" })).not.toHaveClass("collapsed");
  });

  test("auto-collapses below the lg breakpoint (without overwriting the saved preference)", async () => {
    const original = window.matchMedia;
    window.matchMedia = ((q: string) => ({ matches: q.includes("max-width"), media: q, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {} })) as never;
    loggedIn();
    await renderApp("/workspace");
    expect(await screen.findByRole("navigation", { name: "main" })).toHaveClass("collapsed");
    expect(window.localStorage.getItem(SIDEBAR_KEY)).toBeNull();
    window.matchMedia = original;
  });

  test("the current route's item is highlighted", async () => {
    loggedIn();
    await renderApp("/history");
    const nav = await screen.findByRole("navigation", { name: "main" });
    await waitFor(() => expect(within(nav).getByRole("link", { name: /History/ })).toHaveClass("active"));
    expect(within(nav).getByRole("link", { name: /Workspace/ })).not.toHaveClass("active");
  });
});

describe("language and footer", () => {
  test("the footer and the language switch work on the auth shell", async () => {
    await renderApp("/login");
    expect(await screen.findByText("Copyright @ 2026 InnerDrive Studio All Rights Reserved")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Language" }));
    await userEvent.click(await screen.findByText("中文"));
    expect(await screen.findByText("登录您的账户")).toBeInTheDocument();
  });
});

describe("keyboard scrolling of the page (accessibility)", () => {
  test("the main content area can take focus (so PageDown / End work after clicking it) without becoming a Tab stop", async () => {
    loggedIn();
    await renderApp("/history");
    const main = await screen.findByRole("main");
    expect(main).toHaveAttribute("tabindex", "-1");
    main.focus();
    expect(document.activeElement).toBe(main);
  });
});
