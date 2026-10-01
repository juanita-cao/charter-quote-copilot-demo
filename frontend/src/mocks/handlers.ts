import { sampleWorkbookBytes } from "./sampleWorkbook";
import { delay, http, HttpResponse } from "msw";
import {
  MOCK_BUNKER,
  MOCK_BUNKER_NIL,
  MOCK_CALC_GO,
  MOCK_CALC_NOGO_NEG_ASK,
  MOCK_DRAFT_LATEST,
  MOCK_HISTORY_DRAFTS,
  MOCK_HISTORY_QUOTES,
  MOCK_HISTORY_QUOTE_STRING_SNAPSHOT,
  MOCK_CUSTOM_PORTS,
  MOCK_DISTANCES,
  MOCK_ME,
  MOCK_ROUTES,
  MOCK_VESSEL,
} from "./fixtures";

export const MOCK_AUTH_KEY = "cqc.mock.authed";

export interface MockOptions {
  baseUrl: string;
  /** After this much idle time an authenticated call gets one 401 (then refresh succeeds). Infinity disables it. */
  idleExpiryMs?: number;
  latencyMs?: number;
}

function readAuthed(): boolean {
  try {
    return window.localStorage.getItem(MOCK_AUTH_KEY) === "1";
  } catch {
    return false;
  }
}
function writeAuthed(v: boolean) {
  try {
    if (v) window.localStorage.setItem(MOCK_AUTH_KEY, "1");
    else window.localStorage.removeItem(MOCK_AUTH_KEY);
  } catch {
    /* ignore */
  }
}

const unauthorized = () => HttpResponse.json({ detail: "Not authenticated" }, { status: 401 });

export function createHandlers({ baseUrl, idleExpiryMs = 5000, latencyMs = 150 }: MockOptions) {
  let accessValid = true;
  let lastCallAt = Date.now();
  const url = (path: string) => `${baseUrl}${path}`;

  // Every protected route goes through this: 401 when logged out, or once after the idle window (exercises single-flight refresh).
  function guard(): Response | null {
    if (!readAuthed()) return unauthorized();
    const now = Date.now();
    if (now - lastCallAt > idleExpiryMs) accessValid = false;
    lastCallAt = now;
    return accessValid ? null : unauthorized();
  }

  const protectedJson = (path: string, method: "get" | "post", build: (ctx: { request: Request }) => Promise<Response> | Response) =>
    http[method](url(path), async ({ request }) => {
      await delay(latencyMs);
      return guard() ?? build({ request });
    });

  // Like the real backend, request controls (precision, sandbox knobs, deltas) are not part of the inputs it echoes.
  const withoutControls = (b: Record<string, unknown>) => {
    const { precision_mode: _p, target_tce: _t, sandbox_freight_rate: _r, sandbox_shipowner_ask: _a, deltas: _d, ...inputs } = b;
    return inputs;
  };
  const body = async (request: Request) => (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const validateForm = (b: Record<string, unknown>): Response | null =>
    typeof b.quantity === "number" && b.quantity <= 0 ? HttpResponse.json({ detail: "quantity must be greater than 0" }, { status: 422 }) : null;

  return [
    // ── auth ──
    http.post(url("/api/v1/auth/login"), async ({ request }) => {
      await delay(latencyMs);
      const { email } = await body(request);
      if (email === "wrong@example.com") return HttpResponse.json({ detail: "Invalid email or password" }, { status: 401 });
      if (email === "locked@example.com") return HttpResponse.json({ detail: "Too many attempts" }, { status: 429 });
      writeAuthed(true);
      accessValid = true;
      lastCallAt = Date.now();
      return HttpResponse.json({ success: true });
    }),
    http.post(url("/api/v1/auth/register"), async ({ request }) => {
      await delay(latencyMs);
      const b = await body(request);
      if (b.company_name === "Duplicate Co") return HttpResponse.json({ detail: "A company with this name already exists" }, { status: 400 });
      if (b.password !== b.password_confirm) {
        return HttpResponse.json({ detail: [{ loc: ["body", "password_confirm"], msg: "Passwords do not match", type: "value_error" }] }, { status: 422 });
      }
      return HttpResponse.json({ success: true, company_id: 9, user_id: 9, error_message: null }, { status: 201 });
    }),
    http.post(url("/api/v1/auth/refresh"), async () => {
      await delay(latencyMs);
      if (!readAuthed()) return unauthorized();
      accessValid = true;
      lastCallAt = Date.now();
      return HttpResponse.json({ success: true });
    }),
    http.post(url("/api/v1/auth/logout"), async () => {
      await delay(latencyMs);
      writeAuthed(false);
      return HttpResponse.json({ success: true });
    }),
    protectedJson("/api/v1/auth/me", "get", () => HttpResponse.json(MOCK_ME)),

    // ── quotes ──
    protectedJson("/api/v1/quotes/calculate", "post", async ({ request }) => {
      const b = await body(request);
      const base = b.freight_rate === 5 ? MOCK_CALC_NOGO_NEG_ASK : MOCK_CALC_GO;
      // Like the real backend, the decision carries the inputs it was computed from.
      // ... and the freight revenue (quantity x rate), which the backend returns as tce_result.freight_revenue (T2.29).
      const freightRevenue = Number(b.quantity) * Number(b.freight_rate);
      // v1.1: the effective days the backend calculates — typed, or quantity / rate (rounded to 2 decimals)
      const effectiveDays = (mode: unknown, days: unknown, rate: unknown) =>
        mode === "rate" ? Math.round((Number(b.quantity) / Number(rate)) * 100) / 100 : Number(days ?? 0);
      return (
        validateForm(b) ??
        HttpResponse.json({
          tce_result: {
            ...base.tce_result,
            freight_revenue: freightRevenue,
            loading_days: effectiveDays(b.loading_mode, b.loading_days, b.loading_rate),
            discharging_days: effectiveDays(b.discharging_mode, b.discharging_days, b.discharging_rate),
          },
          deal_decision: { ...base.deal_decision, inputs_snapshot: withoutControls(b) },
        })
      );
    }),
    protectedJson("/api/v1/quotes/reverse-quote", "post", async ({ request }) => {
      const b = await body(request);
      return validateForm(b) ?? HttpResponse.json({ break_even_rate: 18.4, minimum_safe_rate: 19.6, current_rate: Number(b.freight_rate ?? 0) });
    }),
    protectedJson("/api/v1/quotes/sandbox", "post", async ({ request }) => {
      const b = await body(request);
      const bad = validateForm(b);
      if (bad) return bad;
      // Illustrative maths only (the frontend never checks it): tce moves 200 per USD/RT away from the form's own rate.
      const formRate = Number(b.freight_rate);
      const ask = typeof b.sandbox_shipowner_ask === "number" ? b.sandbox_shipowner_ask : Number(b.shipowner_asking_tce);
      const target = typeof b.target_tce === "number" ? b.target_tce : null;
      const rate = target !== null ? formRate + (target - 4096.28) / 200 : Number(b.sandbox_freight_rate);
      const tce = target !== null ? target : 4096.28 + (rate - formRate) * 200;
      const spread = tce - ask;
      const inputs = withoutControls(b);
      return HttpResponse.json({
        resolved_freight_rate: rate,
        resolved_freight_revenue: Number(b.quantity) * rate, // quantity x the RESOLVED rate, as the backend returns it (T2.29)
        resolved_tce: tce,
        break_even_rate: 40 + ask / 1000,
        decision: {
          ...MOCK_CALC_GO.deal_decision,
          decision: spread >= 0 ? "GO" : "NO-GO",
          profit_margin_pct: spread / 30,
          operator_profit_usd: spread * 20.5,
          spread_vs_shipowner_ask: spread,
          inputs_snapshot: { ...inputs, freight_rate: rate, shipowner_asking_tce: ask },
        },
      });
    }),
    protectedJson("/api/v1/quotes/risk-scenarios", "post", async ({ request }) => {
      const b = await body(request);
      const bad = validateForm(b);
      if (bad) return bad;
      const deltas = (b.deltas ?? {}) as Record<string, number>;
      const base = 4096.28;
      // [key, name, zh, default delta, step, unit, tce change per unit of delta]
      const spec: [string, string, string, number, number, string, number][] = [
        ["port_cost", "Port Cost", "港口使费", 5000, 1000, "USD", -0.05],
        ["bunker_price", "Bunker Price", "燃油价格", 10, 50, "%", -20],
        ["margin_days", "Margin Days", "富余天数", 1, 0.5, "day", -150],
        ["freight_rate", "Freight Rate", "单吨运费", -2, 0.5, "USD/RT", 200],
      ];
      const rows = spec.map(([key, name, zh, def, step, unit, per]) => {
        const delta = deltas[key] ?? def;
        const tce = base + delta * per;
        return { scenario_name: name, scenario_name_zh: zh, delta, delta_step: step, delta_unit: unit, estimated_tce: tce, tce_impact: tce - base, profit_margin_pct: (tce - 4000) / 30, decision: tce >= 4000 ? "GO" : "NO-GO" };
      });
      return HttpResponse.json([
        { scenario_name: "Base Case", scenario_name_zh: "基准情景", delta: null, delta_step: 0, delta_unit: "", estimated_tce: base, tce_impact: 0, profit_margin_pct: (base - 4000) / 30, decision: "GO" },
        ...rows,
      ]);
    }),
    protectedJson("/api/v1/quotes", "post", async ({ request }) => {
      const b = await body(request);
      const bad = validateForm(b);
      if (bad) return bad;
      return HttpResponse.json({ success: b.route !== "FAIL-SAVE" });
    }),
    http.get(url("/api/v1/quotes"), async ({ request }) => {
      await delay(latencyMs);
      const denied = guard();
      if (denied) return denied;
      const start = new URL(request.url).searchParams.get("start_ym");
      if (start === "1999-01") return HttpResponse.error();
      if (start === "2000-01") return HttpResponse.json([]);
      return HttpResponse.json([...MOCK_HISTORY_QUOTES, MOCK_HISTORY_QUOTE_STRING_SNAPSHOT]);
    }),
    protectedJson("/api/v1/quotes/search", "get", () => HttpResponse.json(MOCK_HISTORY_QUOTES)),
    protectedJson("/api/v1/quotes/bulk-delete", "post", async ({ request }) => {
      const ids = ((await body(request)).record_ids as number[]) ?? [];
      return ids.includes(999) ? HttpResponse.json({ detail: "boom" }, { status: 500 }) : HttpResponse.json({ deleted_count: ids.length });
    }),

    protectedJson("/api/v1/export", "post", async ({ request }) => {
      const keys = ((await body(request)).record_keys as string[]) ?? [];
      if (keys.length === 0) return HttpResponse.json({ detail: "select between 1 and 100 records" }, { status: 422 });
      // a tiny valid workbook that says it is mock data (the real one is built by the backend)
      return new HttpResponse(sampleWorkbookBytes(), {
        headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
      });
    }),

    // ── drafts ──
    protectedJson("/api/v1/drafts", "post", () => HttpResponse.json({ success: true })),
    protectedJson("/api/v1/drafts/latest", "get", () => HttpResponse.json(MOCK_DRAFT_LATEST)),
    http.get(url("/api/v1/drafts"), async ({ request }) => {
      await delay(latencyMs);
      const denied = guard();
      if (denied) return denied;
      const start = new URL(request.url).searchParams.get("start_ym");
      if (start === "1999-01") return HttpResponse.error();
      if (start === "2000-01") return HttpResponse.json([]);
      return HttpResponse.json(MOCK_HISTORY_DRAFTS);
    }),
    protectedJson("/api/v1/drafts/search", "get", () => HttpResponse.json(MOCK_HISTORY_DRAFTS)),
    protectedJson("/api/v1/drafts/bulk-delete", "post", async ({ request }) => {
      const ids = ((await body(request)).record_ids as number[]) ?? [];
      return ids.includes(999) ? HttpResponse.json({ detail: "boom" }, { status: 500 }) : HttpResponse.json({ deleted_count: ids.length });
    }),

    // ── reference data ──
    protectedJson("/api/v1/bunker-price", "get", ({ request }) => {
      const port = new URL(request.url).searchParams.get("port");
      if (port === "NOWHERE") return HttpResponse.json(null);
      if (port === "NIL-PORT") return HttpResponse.json(MOCK_BUNKER_NIL);
      return HttpResponse.json({ ...MOCK_BUNKER, port });
    }),
    protectedJson("/api/v1/company/routes", "get", () => HttpResponse.json(MOCK_ROUTES)),
    protectedJson("/api/v1/company/custom-ports", "get", () => HttpResponse.json(MOCK_CUSTOM_PORTS)),
    protectedJson("/api/v1/company/vessel-consumption", "get", ({ request }) => {
      const dwt = Number(new URL(request.url).searchParams.get("dwt"));
      return HttpResponse.json([2000, 3000, 4000, 5000, 6000, 7000, 8000, 9000, 10000, 15000, 20000].includes(dwt) ? MOCK_VESSEL : null);
    }),
    protectedJson("/api/v1/company/distance", "get", ({ request }) => {
      const params = new URL(request.url).searchParams;
      const key = [params.get("a") ?? "", params.get("b") ?? ""].sort().join("|");
      return HttpResponse.json(MOCK_DISTANCES[key] ?? null);
    }),
  ];
}
