// Quantity, freight rate and total freight are linked in the input panel (a client requirement carried over from the
// predecessor). Only quantity and rate are form values and are sent to the backend; the total is an editable *view* of
// their product (editing it solves the rate). This is input convenience arithmetic: the authoritative Total Freight in the results is the backend's
// `freight_revenue`.
const finite = (n: number | null): n is number => typeof n === "number" && Number.isFinite(n);

export function totalFreight(quantity: number | null, rate: number | null): number | null {
  return finite(quantity) && finite(rate) ? quantity * rate : null;
}

export type SolveResult = { ok: true; rate: number } | { ok: false; reason: "needQuantity" | "invalid" };

// Editing the total holds the QUANTITY fixed and solves the freight rate — the predecessor's rule
// (`_on_freight_total_change`: rate = round(total / quantity, 6)). Rounded to 6 decimals so a long division leaves no float
// residue and the total redisplayed as quantity x rate stays within a cent for realistic quantities.
export function rateForTotal(total: number, quantity: number | null): SolveResult {
  if (!finite(quantity) || quantity <= 0) return { ok: false, reason: "needQuantity" };
  if (!Number.isFinite(total) || total <= 0) return { ok: false, reason: "invalid" };
  return { ok: true, rate: Math.round((total / quantity) * 1e6) / 1e6 };
}

export function displayTotal(total: number | null): string {
  return finite(total) ? String(Number(total.toFixed(2))) : "";
}
