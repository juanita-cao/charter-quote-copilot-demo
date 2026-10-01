import { fireEvent, render, screen } from "@testing-library/react";
import { StrictMode } from "react";
import { setupServer } from "msw/node";
import { MemoryRouter, useLocation } from "react-router-dom";
import { AppProviders } from "../app/AppProviders";
import { REQUIRED_FIELDS } from "../form/fields";
import { createI18n } from "../i18n";
import { en } from "../i18n/en";
import { zh } from "../i18n/zh";
import { MOCK_QUOTE_INPUT } from "../mocks/fixtures";
import { createHandlers, MOCK_AUTH_KEY } from "../mocks/handlers";
import { AppRoutes } from "../routes/AppRoutes";

export const BASE = "http://ws.test";
export const server = setupServer();

export function useMockBackend() {
  beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
  beforeEach(() => {
    window.localStorage.clear();
    server.use(...createHandlers({ baseUrl: BASE, latencyMs: 0, idleExpiryMs: Infinity }));
  });
  afterEach(() => server.resetHandlers());
  afterAll(() => server.close());
}

export const loggedIn = () => window.localStorage.setItem(MOCK_AUTH_KEY, "1");

function Where() {
  return <div data-testid="where">{useLocation().pathname}</div>;
}

export async function renderApp(path = "/workspace", language: "en" | "zh" = "en", options: { strict?: boolean } = {}) {
  const i18n = await createI18n(language);
  const app = (
    <AppProviders baseUrl={BASE} i18n={i18n}>
      <MemoryRouter initialEntries={[path]}>
        <Where />
        <AppRoutes />
      </MemoryRouter>
    </AppProviders>
  );
  // main.tsx renders under StrictMode, which runs every effect twice in development: opt in to reproduce that.
  const view = render(options.strict ? <StrictMode>{app}</StrictMode> : app);
  // Bootstrap (spinner) first; on the Workspace, wait until the form is on screen.
  if (path.startsWith("/workspace")) await screen.findByLabelText((language === "zh" ? zh : en).fields.route);
  return view;
}

const label = (field: string) => (en.fields as Record<string, string>)[field];

/** Sets one form field by its label (inputs are always mounted: the groups are force-rendered). */
export function setField(field: string, value: string) {
  fireEvent.change(screen.getByLabelText(label(field)), { target: { value } });
}

export function fillRequired(over: Record<string, string | number> = {}) {
  const src = { ...MOCK_QUOTE_INPUT, ...over } as unknown as Record<string, string | number>;
  // the always-required fields, plus the days of both ports (required in days mode, the default)
  for (const f of [...REQUIRED_FIELDS, "loading_days", "discharging_days"]) setField(f, String(src[f]));
}

export function countRequests(pathSuffix: string, method = "POST") {
  const seen: string[] = [];
  const listener = ({ request }: { request: Request }) => {
    if (request.method === method && new URL(request.url).pathname.endsWith(pathSuffix)) seen.push(request.url);
  };
  server.events.on("request:start", listener);
  return { count: () => seen.length, stop: () => server.events.removeListener("request:start", listener) };
}

/** Run (航次测算): the only thing that starts a calculation (client decision, 2026-09-21). */
export const runCalc = () => fireEvent.click(screen.getByRole("button", { name: /^(Run|航次测算)$/ }));
