import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { createApi } from "./api";
import { createHttpClient } from "./http";
import { collectForm } from "../form/collect";
import { completeForm } from "../test/fixtures";

const BASE = "http://api.test";
const server = setupServer();
interface Captured {
  method: string;
  path: string;
  query: Record<string, string>;
  body: unknown;
}
let captured: Captured | null = null;

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => {
  server.resetHandlers();
  captured = null;
});
afterAll(() => server.close());

function respondWith(payload: unknown) {
  server.use(
    http.all(`${BASE}/*`, async ({ request }) => {
      const url = new URL(request.url);
      const text = request.method === "GET" ? "" : await request.text();
      captured = {
        method: request.method,
        path: url.pathname,
        query: Object.fromEntries(url.searchParams.entries()),
        body: text ? JSON.parse(text) : undefined,
      };
      return HttpResponse.json(payload as never);
    }),
  );
}

const api = createApi(
  createHttpClient({ baseURL: BASE, onSessionExpired: () => {}, onRefreshUnavailable: () => {}, onRefreshSucceeded: () => {} }),
);
const form = collectForm(completeForm());

type Row = { name: string; call: () => Promise<unknown>; method: string; path: string; query?: Record<string, string>; body?: unknown };

const rows: Row[] = [
  { name: "me", call: () => api.me(), method: "GET", path: "/api/v1/auth/me" },
  { name: "login", call: () => api.login("a@b.co", "pw"), method: "POST", path: "/api/v1/auth/login", body: { email: "a@b.co", password: "pw" } },
  {
    name: "register",
    call: () => api.register({ company_name: "C", admin_email: "a@b.co", password: "pw", password_confirm: "pw" }),
    method: "POST",
    path: "/api/v1/auth/register",
    body: { company_name: "C", admin_email: "a@b.co", password: "pw", password_confirm: "pw" },
  },
  { name: "logout", call: () => api.logout(), method: "POST", path: "/api/v1/auth/logout" },
  { name: "calculate", call: () => api.calculate(form), method: "POST", path: "/api/v1/quotes/calculate", body: form },
  {
    name: "reverseQuote",
    call: () => api.reverseQuote(form, 9000),
    method: "POST",
    path: "/api/v1/quotes/reverse-quote",
    body: { ...form, target_tce: 9000 },
  },
  {
    name: "sandbox (target_tce)",
    call: () => api.sandbox(form, { target_tce: 9000 }),
    method: "POST",
    path: "/api/v1/quotes/sandbox",
    body: { ...form, target_tce: 9000 },
  },
  {
    name: "sandbox (rate + owner ask)",
    call: () => api.sandbox(form, { sandbox_freight_rate: 21, sandbox_shipowner_ask: 8000 }),
    method: "POST",
    path: "/api/v1/quotes/sandbox",
    body: { ...form, sandbox_freight_rate: 21, sandbox_shipowner_ask: 8000 },
  },
  { name: "riskScenarios (no deltas)", call: () => api.riskScenarios(form), method: "POST", path: "/api/v1/quotes/risk-scenarios", body: form },
  {
    name: "riskScenarios (deltas)",
    call: () => api.riskScenarios(form, { fuel: 10 }),
    method: "POST",
    path: "/api/v1/quotes/risk-scenarios",
    body: { ...form, deltas: { fuel: 10 } },
  },
  { name: "saveQuote (no target)", call: () => api.saveQuote(form), method: "POST", path: "/api/v1/quotes", body: form },
  {
    name: "saveQuote (target_tce)",
    call: () => api.saveQuote(form, 9000),
    method: "POST",
    path: "/api/v1/quotes",
    body: { ...form, target_tce: 9000 },
  },
  {
    name: "quoteHistory",
    call: () => api.quoteHistory("2026-08", "2026-09"),
    method: "GET",
    path: "/api/v1/quotes",
    query: { start_ym: "2026-08", end_ym: "2026-09" },
  },
  {
    name: "searchQuotes (all filters)",
    call: () => api.searchQuotes({ route: "A-B", cargo_description: "coal", vessel_name: "V", vessel_dwt: 5000 }),
    method: "GET",
    path: "/api/v1/quotes/search",
    query: { route: "A-B", cargo_description: "coal", vessel_name: "V", vessel_dwt: "5000" },
  },
  {
    name: "searchQuotes (only route: unset filters are not sent)",
    call: () => api.searchQuotes({ route: "A-B" }),
    method: "GET",
    path: "/api/v1/quotes/search",
    query: { route: "A-B" },
  },
  {
    name: "bulkDeleteQuotes",
    call: () => api.bulkDeleteQuotes([1, 2]),
    method: "POST",
    path: "/api/v1/quotes/bulk-delete",
    body: { record_ids: [1, 2] },
  },
  { name: "exportRecords", call: () => api.exportRecords(["q1", "d2"]), method: "POST", path: "/api/v1/export", body: { record_keys: ["q1", "d2"] } },
  // ── the operator's per-calculation precision (2026-09-21): sent only when chosen ──
  { name: "calculate (full precision)", call: () => api.calculate(form, "full"), method: "POST", path: "/api/v1/quotes/calculate", body: { ...form, precision_mode: "full" } },
  { name: "calculate (display precision)", call: () => api.calculate(form, "display"), method: "POST", path: "/api/v1/quotes/calculate", body: { ...form, precision_mode: "display" } },
  { name: "reverseQuote (precision)", call: () => api.reverseQuote(form, 9000, "full"), method: "POST", path: "/api/v1/quotes/reverse-quote", body: { ...form, target_tce: 9000, precision_mode: "full" } },
  { name: "sandbox (precision)", call: () => api.sandbox(form, { sandbox_freight_rate: 21 }, "display"), method: "POST", path: "/api/v1/quotes/sandbox", body: { ...form, sandbox_freight_rate: 21, precision_mode: "display" } },
  { name: "riskScenarios (precision, no deltas)", call: () => api.riskScenarios(form, undefined, "full"), method: "POST", path: "/api/v1/quotes/risk-scenarios", body: { ...form, precision_mode: "full" } },
  { name: "riskScenarios (precision + deltas)", call: () => api.riskScenarios(form, { fuel: 10 }, "display"), method: "POST", path: "/api/v1/quotes/risk-scenarios", body: { ...form, deltas: { fuel: 10 }, precision_mode: "display" } },
  { name: "saveQuote (precision, no target)", call: () => api.saveQuote(form, undefined, "full"), method: "POST", path: "/api/v1/quotes", body: { ...form, precision_mode: "full" } },
  { name: "saveQuote (precision + target)", call: () => api.saveQuote(form, 9000, "display"), method: "POST", path: "/api/v1/quotes", body: { ...form, target_tce: 9000, precision_mode: "display" } },
  { name: "saveDraft (raw form dict)", call: () => api.saveDraft({ route: "A", quantity: "not validated" }), method: "POST", path: "/api/v1/drafts", body: { route: "A", quantity: "not validated" } },
  { name: "latestDraft", call: () => api.latestDraft(), method: "GET", path: "/api/v1/drafts/latest" },
  {
    name: "draftHistory",
    call: () => api.draftHistory("2026-08", "2026-09"),
    method: "GET",
    path: "/api/v1/drafts",
    query: { start_ym: "2026-08", end_ym: "2026-09" },
  },
  {
    name: "searchDrafts",
    call: () => api.searchDrafts({ vessel_name: "V", vessel_dwt: 3000 }),
    method: "GET",
    path: "/api/v1/drafts/search",
    query: { vessel_name: "V", vessel_dwt: "3000" },
  },
  {
    name: "bulkDeleteDrafts",
    call: () => api.bulkDeleteDrafts([7]),
    method: "POST",
    path: "/api/v1/drafts/bulk-delete",
    body: { record_ids: [7] },
  },
  { name: "bunkerPrice", call: () => api.bunkerPrice("Singapore"), method: "GET", path: "/api/v1/bunker-price", query: { port: "Singapore" } },
  { name: "companyRoutes", call: () => api.companyRoutes(), method: "GET", path: "/api/v1/company/routes" },
  {
    name: "vesselConsumption",
    call: () => api.vesselConsumption(8000, true),
    method: "GET",
    path: "/api/v1/company/vessel-consumption",
    query: { dwt: "8000", has_crane: "true" },
  },
  {
    name: "vesselConsumption (no crane)",
    call: () => api.vesselConsumption(5000, false),
    method: "GET",
    path: "/api/v1/company/vessel-consumption",
    query: { dwt: "5000", has_crane: "false" },
  },
];

describe("F-Api (Artifact 5 routes)", () => {
  test.each(rows)("S01 $name -> correct method, path, query, body", async (row) => {
    respondWith({});
    await row.call();
    expect(captured).not.toBeNull();
    expect(captured!.method).toBe(row.method);
    expect(captured!.path).toBe(row.path);
    expect(captured!.query).toEqual(row.query ?? {});
    expect(captured!.body).toEqual(row.body);
  });

  test("responses are returned as the parsed body", async () => {
    respondWith({ user_id: 1, company_id: 2, company_name: "X" });
    expect(await api.me()).toEqual({ user_id: 1, company_id: 2, company_name: "X" });
  });

  test("SOFT reads pass a null body through unchanged (bunker price, vessel consumption)", async () => {
    respondWith(null);
    expect(await api.bunkerPrice("Nowhere")).toBeNull();
    expect(await api.vesselConsumption(5000, false)).toBeNull();
  });

  test("company_id / user_id are never sent by any call", async () => {
    for (const row of rows) {
      respondWith({});
      await row.call();
      const sent = JSON.stringify(captured);
      expect(sent).not.toContain("company_id");
      expect(sent).not.toContain("user_id");
    }
  });

  test("the export route does not exist yet (T2.22): there is no api.exportXlsx", () => {
    expect((api as Record<string, unknown>).exportXlsx).toBeUndefined();
  });
});
