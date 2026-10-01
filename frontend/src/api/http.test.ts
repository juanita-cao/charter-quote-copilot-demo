import { http, HttpResponse, delay } from "msw";
import { setupServer } from "msw/node";
import { ApiError, createHttpClient } from "./http";

const BASE = "http://api.test";
const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

interface Backend {
  authed: boolean;
  refreshCalls: number;
  dataCalls: number;
}

// `refresh`: what POST /auth/refresh answers. "network" = connection failure.
function useBackend(opts: { refresh: 200 | 401 | 503 | 500 | "network"; alwaysUnauthorized?: boolean }): Backend {
  const state: Backend = { authed: false, refreshCalls: 0, dataCalls: 0 };
  server.use(
    http.get(`${BASE}/api/v1/quotes`, () => {
      state.dataCalls += 1;
      if (opts.alwaysUnauthorized || !state.authed) return HttpResponse.json({ detail: "expired" }, { status: 401 });
      return HttpResponse.json([{ id: 1 }]);
    }),
    http.post(`${BASE}/api/v1/auth/refresh`, async () => {
      state.refreshCalls += 1;
      await delay(25);
      if (opts.refresh === "network") return HttpResponse.error();
      if (opts.refresh === 200) {
        state.authed = true;
        return HttpResponse.json({ ok: true });
      }
      return HttpResponse.json({ detail: "x" }, { status: opts.refresh });
    }),
  );
  return state;
}

function makeClient() {
  const events = { expired: 0, unavailable: 0, refreshed: 0 };
  const client = createHttpClient({
    baseURL: BASE,
    onSessionExpired: () => void (events.expired += 1),
    onRefreshUnavailable: () => void (events.unavailable += 1),
    onRefreshSucceeded: () => void (events.refreshed += 1),
  });
  return { client, events };
}

describe("F-Http", () => {
  test("S01 every request carries credentials (withCredentials is set)", () => {
    expect(makeClient().client.defaults.withCredentials).toBe(true);
  });

  test("S02 a 401 on an ordinary call -> one refresh, the original is retried once and succeeds", async () => {
    const b = useBackend({ refresh: 200 });
    const { client, events } = makeClient();
    const res = await client.get("/api/v1/quotes");
    expect(res.data).toEqual([{ id: 1 }]);
    expect(b.refreshCalls).toBe(1);
    expect(b.dataCalls).toBe(2);
    expect(events.refreshed).toBe(1);
  });

  test("S03 N concurrent 401s -> exactly ONE refresh call; all N are retried and succeed", async () => {
    const b = useBackend({ refresh: 200 });
    const { client, events } = makeClient();
    const results = await Promise.all(Array.from({ length: 6 }, () => client.get("/api/v1/quotes")));
    expect(results.every((r) => r.status === 200)).toBe(true);
    expect(b.refreshCalls).toBe(1);
    expect(b.dataCalls).toBe(12);
    expect(events.refreshed).toBe(1);
  });

  test("S04 refresh returns 401 -> no retry; sessionExpired emitted; the original rejects", async () => {
    const b = useBackend({ refresh: 401 });
    const { client, events } = makeClient();
    const err = await client.get("/api/v1/quotes").catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(401);
    expect(err.code).toBe("SESSION_EXPIRED");
    expect(b.dataCalls).toBe(1);
    expect(b.refreshCalls).toBe(1);
    expect(events).toEqual({ expired: 1, unavailable: 0, refreshed: 0 });
  });

  test("S05 login returning 401 -> no refresh attempted", async () => {
    const b = useBackend({ refresh: 200 });
    server.use(http.post(`${BASE}/api/v1/auth/login`, () => HttpResponse.json({ detail: "Invalid credentials" }, { status: 401 })));
    const { client, events } = makeClient();
    const err = await client.post("/api/v1/auth/login", { email: "a", password: "b" }).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(401);
    expect(err.message).toBe("Invalid credentials");
    expect(b.refreshCalls).toBe(0);
    expect(events).toEqual({ expired: 0, unavailable: 0, refreshed: 0 });
  });

  test("S06 the refresh call itself returning 401 -> no second refresh (no loop)", async () => {
    const b = useBackend({ refresh: 401 });
    const { client } = makeClient();
    await client.get("/api/v1/quotes").catch(() => undefined);
    expect(b.refreshCalls).toBe(1);
  });

  test("S07 the retried request returning 401 again -> no second refresh; the failure surfaces", async () => {
    const b = useBackend({ refresh: 200, alwaysUnauthorized: true });
    const { client } = makeClient();
    const err = await client.get("/api/v1/quotes").catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(401);
    expect(b.refreshCalls).toBe(1);
    expect(b.dataCalls).toBe(2);
  });

  test("S08 a 403 -> no refresh", async () => {
    const b = useBackend({ refresh: 200 });
    server.use(http.get(`${BASE}/api/v1/quotes`, () => HttpResponse.json({ detail: "Forbidden" }, { status: 403 })));
    const { client } = makeClient();
    const err = await client.get("/api/v1/quotes").catch((e) => e);
    expect(err.status).toBe(403);
    expect(b.refreshCalls).toBe(0);
  });

  test("S09 a 422 with a string detail and with a list detail are both normalised into ApiError.message", async () => {
    server.use(
      http.post(`${BASE}/api/v1/quotes/calculate`, async ({ request }) => {
        const body = (await request.json()) as { mode: string };
        return body.mode === "string"
          ? HttpResponse.json({ detail: "quantity must be positive" }, { status: 422 })
          : HttpResponse.json({ detail: [{ loc: ["body", "quantity"], msg: "must be > 0", type: "x" }] }, { status: 422 });
      }),
    );
    const { client } = makeClient();
    const a = await client.post("/api/v1/quotes/calculate", { mode: "string" }).catch((e) => e);
    const b = await client.post("/api/v1/quotes/calculate", { mode: "list" }).catch((e) => e);
    expect(a).toBeInstanceOf(ApiError);
    expect(a.status).toBe(422);
    expect(a.message).toBe("quantity must be positive");
    expect(b.message).toContain("quantity");
    expect(b.message).toContain("must be > 0");
  });

  test("S10 a network error -> a normalised ApiError with no status", async () => {
    server.use(http.get(`${BASE}/api/v1/quotes`, () => HttpResponse.error()));
    const { client } = makeClient();
    const err = await client.get("/api/v1/quotes").catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBeUndefined();
    expect(err.message).toBeTruthy();
  });

  test("S11 [REVIEW 8] refresh returns 503 -> refreshUnavailable emitted, NOT sessionExpired; the original rejects", async () => {
    const b = useBackend({ refresh: 503 });
    const { client, events } = makeClient();
    const err = await client.get("/api/v1/quotes").catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.code).toBe("AUTH_UNAVAILABLE");
    expect(events).toEqual({ expired: 0, unavailable: 1, refreshed: 0 });
    expect(b.dataCalls).toBe(1);
  });

  test("S12 [REVIEW 8] a network error during the refresh -> the same as S11", async () => {
    useBackend({ refresh: "network" });
    const { client, events } = makeClient();
    const err = await client.get("/api/v1/quotes").catch((e) => e);
    expect(err.code).toBe("AUTH_UNAVAILABLE");
    expect(events).toEqual({ expired: 0, unavailable: 1, refreshed: 0 });
  });

  test("S12b any other refresh failure (500) also keeps the session: unavailable, never expired", async () => {
    useBackend({ refresh: 500 });
    const { client, events } = makeClient();
    await client.get("/api/v1/quotes").catch(() => undefined);
    expect(events).toEqual({ expired: 0, unavailable: 1, refreshed: 0 });
  });

  test("S13 [REVIEW 8] a request after S11 retries the refresh (a failure is not cached)", async () => {
    const b = useBackend({ refresh: 503 });
    const { client } = makeClient();
    await client.get("/api/v1/quotes").catch(() => undefined);
    expect(b.refreshCalls).toBe(1);
    await client.get("/api/v1/quotes").catch(() => undefined);
    expect(b.refreshCalls).toBe(2);
  });

  test("S14 [REVIEW 8] N concurrent 401s while the refresh returns 503 -> ONE refresh call; all N rejected with the same error kind", async () => {
    const b = useBackend({ refresh: 503 });
    const { client, events } = makeClient();
    const errs = await Promise.all(Array.from({ length: 5 }, () => client.get("/api/v1/quotes").catch((e) => e)));
    expect(b.refreshCalls).toBe(1);
    expect(errs.every((e) => e instanceof ApiError && e.code === "AUTH_UNAVAILABLE")).toBe(true);
    expect(events.unavailable).toBe(1);
  });

  test("concurrent 401s while the refresh returns 401 -> one refresh, one sessionExpired, all reject", async () => {
    const b = useBackend({ refresh: 401 });
    const { client, events } = makeClient();
    const errs = await Promise.all(Array.from({ length: 4 }, () => client.get("/api/v1/quotes").catch((e) => e)));
    expect(b.refreshCalls).toBe(1);
    expect(events.expired).toBe(1);
    expect(errs.every((e) => e.code === "SESSION_EXPIRED")).toBe(true);
  });

  test("register and logout 401s never trigger a refresh either", async () => {
    const b = useBackend({ refresh: 200 });
    server.use(
      http.post(`${BASE}/api/v1/auth/register`, () => HttpResponse.json({ detail: "x" }, { status: 401 })),
      http.post(`${BASE}/api/v1/auth/logout`, () => HttpResponse.json({ detail: "x" }, { status: 401 })),
    );
    const { client } = makeClient();
    await client.post("/api/v1/auth/register", {}).catch(() => undefined);
    await client.post("/api/v1/auth/logout").catch(() => undefined);
    expect(b.refreshCalls).toBe(0);
  });

  test("a non-JSON or empty error body still yields a readable message", async () => {
    server.use(http.get(`${BASE}/api/v1/quotes`, () => new HttpResponse("boom", { status: 500 })));
    const { client } = makeClient();
    const err = await client.get("/api/v1/quotes").catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(500);
    expect(err.message).toBeTruthy();
  });
});
