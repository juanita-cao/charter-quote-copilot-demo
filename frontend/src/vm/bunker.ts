import type { BunkerPriceResult } from "../api/types";
import type { QuoteFormValues } from "../form/fields";
import type { BunkerAutofillVM } from "./types";

export const STALE_AFTER_DAYS = 5;
export const LOW_CONFIDENCE_BELOW = 0.6;

function ageInDays(reportDate: string, today: Date): number {
  const [y, m, d] = reportDate.split("-").map(Number);
  const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  return Math.floor((todayUtc - Date.UTC(y, m - 1, d)) / 86_400_000);
}

export function buildBunkerAutofillVM(
  req: { port: string },
  current: { bunkering_port: string | null },
  result: BunkerPriceResult | null,
  today: Date,
): BunkerAutofillVM {
  if ((current.bunkering_port ?? "").trim() !== req.port.trim()) return { patch: {}, caption: null };
  // A lookup that comes back with nothing usable clears the prices rather than leaving whatever the previous
  // port's lookup filled in — a stale price next to "no data for this port" reads as a real answer (found
  // 2026-09-22, alongside the identical bug in the distance lookup, vm/distance.ts).
  const CLEAR = { hfo_price: null, mgo_price: null };
  if (result === null) return { patch: CLEAR, caption: { kind: "warn", key: "noData" } };

  // Either price missing from this port's report clears that one field too — the same reasoning as above, just
  // one field at a time instead of both.
  const patch: Partial<QuoteFormValues> = {
    hfo_price: result.vlsfo_high,
    mgo_price: result.lsmgo_high,
  };
  if (result.vlsfo_high === null && result.lsmgo_high === null) return { patch: CLEAR, caption: { kind: "warn", key: "nil" } };

  const days = ageInDays(result.report_date, today);
  if (days > STALE_AFTER_DAYS) {
    return { patch, caption: { kind: "warn", key: "stale", params: { date: result.report_date, days: String(days) } } };
  }
  if (result.vote_agreement < LOW_CONFIDENCE_BELOW) {
    return { patch, caption: { kind: "warn", key: "lowConfidence", params: { date: result.report_date } } };
  }
  return { patch, caption: { kind: "ok", key: "ok", params: { date: result.report_date } } };
}
