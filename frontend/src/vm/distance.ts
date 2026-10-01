import type { DistanceResult } from "../api/types";
import type { QuoteFormValues } from "../form/fields";

// Distance lookup, Phase 1 (design_frontend.md §12, PT-21): mirrors the bunker-price VM shape (a patch plus a
// caption naming the source). Both ballast and laden are a chain of one or more legs (ballast: before the load port
// plus after the discharge port; laden: load port through discharge port, possibly via stops) summed the same way.

export interface DistanceCaption {
  kind: "warn";
  key: "distanceMissingLegs";
  params?: Record<string, string>;
}
export interface DistanceAutofillVM {
  patch: Partial<QuoteFormValues>;
  caption: DistanceCaption | null;
}

const EMPTY: DistanceAutofillVM = { patch: {}, caption: null };

/** One leg's result: `undefined` = still loading (or not queried), `null` = no history for that pair. */
export interface DistanceLeg {
  a: string;
  b: string;
  result: DistanceResult | null | undefined;
}

// null total = a leg is missing (fields.filter distinguishes "no lookup possible yet" — a genuine null return —
// from "resolved, every leg matched").
function sumLegs(legs: DistanceLeg[]): { total: number | null; caption: DistanceCaption | null } | null {
  if (legs.length === 0) return null;
  if (legs.some((l) => l.result === undefined)) return null; // still loading: say nothing rather than something wrong

  const missing = legs.filter((l) => l.result === null);
  if (missing.length > 0) {
    return { total: null, caption: { kind: "warn", key: "distanceMissingLegs", params: { legs: missing.map((l) => `${l.a} → ${l.b}`).join(", ") } } };
  }

  // A match fills the field silently (no caption) — client feedback, 2026-09-22: the number itself is enough.
  const results = legs.map((l) => l.result as DistanceResult);
  const total = Math.round(results.reduce((sum, r) => sum + r.nm, 0) * 10) / 10;
  return { total, caption: null };
}

// A resolved-but-missing leg clears the field rather than leaving whatever was there before (client feedback,
// 2026-09-22): a stale number sitting next to a "no history" caption reads as a real answer when it is not one.
export function buildBallastDistanceVM(legs: DistanceLeg[]): DistanceAutofillVM {
  const r = sumLegs(legs);
  if (!r) return EMPTY;
  return { patch: { ballast_distance: r.total }, caption: r.caption };
}

export function buildLadenDistanceVM(legs: DistanceLeg[]): DistanceAutofillVM {
  const r = sumLegs(legs);
  if (!r) return EMPTY;
  return { patch: { laden_distance: r.total }, caption: r.caption };
}
