import { setupServer } from "msw/node";
import { createApi } from "../api/api";
import { ApiError, createHttpClient } from "../api/http";
import { collectForm } from "../form/collect";
import { completeForm } from "../test/fixtures";
import { createHandlers, MOCK_AUTH_KEY } from "./handlers";
import { MOCK_BUNKER_NIL, MOCK_CALC_GO, MOCK_CALC_NOGO_NEG_ASK, MOCK_ME } from "./fixtures";

const BASE = "http://mock.test";
const server = setupServer();
let expired = 0;
const api = createApi(
  createHttpClient({ baseURL: BASE, onSessionExpired: () => void (expired += 1), onRefreshUnavailable: () => {}, onRefreshSucceeded: () => {} }),
);
const form = collectForm(completeForm());

function serve(opts: { idleExpiryMs?: number } = {}) {
  server.use(...createHandlers({ baseUrl: BASE, latencyMs: 0, idleExpiryMs: opts.idleExpiryMs ?? Infinity }));
}
const asError = async (p: Promise<unknown>) => (await p.catch((e) => e)) as ApiError;

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
beforeEach(() => {
  window.localStorage.clear();
  expired = 0;
});
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("mock handlers (Artifact 6 triggers)", () => {
  test("logged out: protected calls 401 and the refresh fails -> session expired", async () => {
    serve();
    const err = await asError(api.me());
    expect(err.code).toBe("SESSION_EXPIRED");
    expect(expired).toBe(1);
  });
  test("login wrong@example.com -> 401; locked@example.com -> 429; anything else logs in", async () => {
    serve();
    expect((await asError(api.login("wrong@example.com", "x"))).status).toBe(401);
    expect((await asError(api.login("locked@example.com", "x"))).status).toBe(429);
    expect(await api.login("me@example.com", "pw12345678")).toEqual({ success: true });
    expect(window.localStorage.getItem(MOCK_AUTH_KEY)).toBe("1");
    expect(await api.me()).toEqual(MOCK_ME);
  });
  test("logout ends the mock session", async () => {
    serve();
    await api.login("me@example.com", "pw");
    await api.logout();
    expect(window.localStorage.getItem(MOCK_AUTH_KEY)).toBeNull();
  });
  test("register: duplicate company -> 400 string detail; mismatched passwords -> 422 list detail; else 201", async () => {
    serve();
    const base = { company_name: "New Co", admin_email: "a@b.co", password: "pw12345678", password_confirm: "pw12345678" };
    expect((await asError(api.register({ ...base, company_name: "Duplicate Co" }))).message).toContain("already exists");
    const mismatch = await asError(api.register({ ...base, password_confirm: "other" }));
    expect(mismatch.status).toBe(422);
    expect(mismatch.message).toContain("Passwords do not match");
    expect((await api.register(base)).success).toBe(true);
  });

  describe("authenticated", () => {
    beforeEach(async () => {
      serve();
      await api.login("me@example.com", "pw");
    });
    test("quantity <= 0 -> 422 with a string detail, on every form-dict call", async () => {
      const bad = { ...form, quantity: 0 };
      for (const call of [() => api.calculate(bad), () => api.sandbox(bad, { target_tce: 1 }), () => api.riskScenarios(bad), () => api.saveQuote(bad)]) {
        const err = await asError(call());
        expect(err.status).toBe(422);
        expect(err.message).toBe("quantity must be greater than 0");
      }
    });
    test("calculate: freight_rate 5 -> the NO-GO fixture with a negative owner-ask spread; otherwise GO", async () => {
      const go = await api.calculate(form);
      const { freight_revenue: goRevenue, ...goRest } = go.tce_result;
      const { freight_revenue: _fixtureRevenue, ...fixtureRest } = MOCK_CALC_GO.tce_result;
      expect(goRest).toEqual(fixtureRest);
      expect(goRevenue).toBe(form.quantity * form.freight_rate); // computed from the request, as the backend does
      expect(go.deal_decision).toMatchObject({ decision: "GO", spread_vs_shipowner_ask: MOCK_CALC_GO.deal_decision.spread_vs_shipowner_ask });
      const nogo = await api.calculate({ ...form, freight_rate: 5 });
      expect(nogo.deal_decision).toMatchObject({ decision: "NO-GO", spread_vs_shipowner_ask: MOCK_CALC_NOGO_NEG_ASK.deal_decision.spread_vs_shipowner_ask });
    });
    test("the calculate response carries freight_revenue = quantity x rate, and the sandbox carries it for the resolved rate", async () => {
      const calc = await api.calculate({ ...form, quantity: 1000, freight_rate: 30 });
      expect(calc.tce_result.freight_revenue).toBe(30000);
      const box = await api.sandbox({ ...form, quantity: 1000, freight_rate: 30 }, { sandbox_freight_rate: 32.5 });
      expect(box.resolved_freight_revenue).toBe(32500);
    });
    test("like the real backend, the decision echoes the inputs it was computed from", async () => {
      const res = await api.calculate({ ...form, quantity: 1234, freight_rate: 31 });
      expect(res.deal_decision.inputs_snapshot).toMatchObject({ quantity: 1234, freight_rate: 31 });
    });
    test("sandbox knobs move the results; risk deltas move the row they name", async () => {
      const byTarget = await api.sandbox(form, { target_tce: 4296.28 });
      expect(byTarget.resolved_tce).toBe(4296.28);
      expect(byTarget.resolved_freight_rate).toBeCloseTo(form.freight_rate + 1, 6);
      const lowAsk = await api.sandbox(form, { sandbox_freight_rate: form.freight_rate, sandbox_shipowner_ask: 3000 });
      const highAsk = await api.sandbox(form, { sandbox_freight_rate: form.freight_rate, sandbox_shipowner_ask: 5000 });
      expect(highAsk.break_even_rate).toBeGreaterThan(lowAsk.break_even_rate);
      const rows = await api.riskScenarios(form, { port_cost: 9000 });
      expect(rows[1].delta).toBe(9000);
      expect(rows[2].delta).toBe(10);
    });
    test("save quote with route FAIL-SAVE -> { success: false }", async () => {
      expect(await api.saveQuote({ ...form, route: "FAIL-SAVE" })).toEqual({ success: false });
      expect(await api.saveQuote(form)).toEqual({ success: true });
    });
    test("bulk-delete containing id 999 -> 500 (both routes)", async () => {
      expect((await asError(api.bulkDeleteQuotes([1, 999]))).status).toBe(500);
      expect((await asError(api.bulkDeleteDrafts([999]))).status).toBe(500);
      expect(await api.bulkDeleteQuotes([1, 2])).toEqual({ deleted_count: 2 });
    });
    test("bunker-price: NOWHERE -> null; NIL-PORT -> all highs null; SINGAPORE -> a row", async () => {
      expect(await api.bunkerPrice("NOWHERE")).toBeNull();
      expect(await api.bunkerPrice("NIL-PORT")).toEqual(MOCK_BUNKER_NIL);
      expect((await api.bunkerPrice("SINGAPORE"))?.vlsfo_high).toBe(520);
    });
    test("history: start_ym 1999-01 -> a network error (both routes); 2000-01 -> 200 []; otherwise rows", async () => {
      expect((await asError(api.quoteHistory("1999-01", "1999-02"))).status).toBeUndefined();
      expect((await asError(api.draftHistory("1999-01", "1999-02"))).status).toBeUndefined();
      expect(await api.quoteHistory("2000-01", "2000-02")).toEqual([]);
      expect(await api.draftHistory("2000-01", "2000-02")).toEqual([]);
      expect((await api.quoteHistory("2026-09", "2026-09")).length).toBeGreaterThan(1);
    });
    test("vessel consumption: a tier -> a profile; a non-tier DWT -> null", async () => {
      expect((await api.vesselConsumption(5000, false))?.ballast_speed).toBe(11);
      expect(await api.vesselConsumption(2800, false)).toBeNull();
    });
    test("every remaining route answers (routes, latest draft, drafts, search, risk rows, reverse quote, sandbox)", async () => {
      expect((await api.companyRoutes()).length).toBeGreaterThan(0);
      expect((await api.latestDraft()).draft).not.toBeNull();
      expect((await api.draftHistory("2026-09", "2026-09")).length).toBeGreaterThan(0);
      expect((await api.searchQuotes({ route: "CN" })).length).toBeGreaterThan(0);
      expect((await api.searchDrafts({ route: "CN" })).length).toBeGreaterThan(0);
      expect(await api.saveDraft({ route: "x" })).toEqual({ success: true });
      expect((await api.riskScenarios(form)).length).toBe(5);
      expect((await api.reverseQuote(form, 3000)).current_rate).toBe(form.freight_rate);
      expect((await api.sandbox(form, { sandbox_freight_rate: 25 })).resolved_freight_rate).toBe(25);
    });
  });

  test("the idle trigger: after the idle window the next authenticated call gets one 401, the refresh succeeds and the call is retried", async () => {
    serve({ idleExpiryMs: 20 });
    await api.login("me@example.com", "pw");
    await new Promise((r) => setTimeout(r, 40));
    expect(await api.me()).toEqual(MOCK_ME);
    expect(expired).toBe(0);
  });
});
