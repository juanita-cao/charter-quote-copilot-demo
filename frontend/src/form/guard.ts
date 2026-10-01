import { ALL_FIELDS, PORT_TIME, REQUIRED_FIELDS, STRING_FIELDS, type OtherCostRow, type QuoteFormValues } from "./fields";
import { laycanHint, validateField } from "./fieldRules";

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const blank = (v: unknown) => v === null || v === undefined || (typeof v === "string" && v.trim() === "");

/** Per port, the input the chosen mode does NOT use: never required, never validated. */
export function unusedTimeFields(values: QuoteFormValues): Set<string> {
  const unused = new Set<string>();
  for (const port of Object.values(PORT_TIME)) {
    unused.add((values as Record<string, unknown>)[port.mode] === "rate" ? port.days : port.rate);
  }
  return unused;
}

function otherCostsComplete(rows: OtherCostRow[] | null): boolean {
  return (rows ?? []).every((r) => {
    const noName = blank(r.name);
    const noAmount = r.amount === null || r.amount === undefined;
    if (noName && noAmount) return true; // an untouched row is ignored
    return !noName && finite(r.amount); // negative allowed (credit), AMENDMENT 2026-09-24
  });
}

export function isComplete(values: QuoteFormValues): boolean {
  const unused = unusedTimeFields(values);
  const needed = [...REQUIRED_FIELDS, ...[PORT_TIME.loading, PORT_TIME.discharging].map((p) => ((values as Record<string, unknown>)[p.mode] === "rate" ? p.rate : p.days))];
  for (const field of needed) {
    const v = (values as Record<string, unknown>)[field];
    if (v === null || v === undefined) return false;
    if (STRING_FIELDS.has(field)) {
      if (typeof v !== "string" || v.trim() === "") return false;
    } else if (!finite(v)) {
      return false;
    }
  }
  if (!otherCostsComplete(values.other_costs)) return false;
  const start = values.laycan_start ?? null;
  const end = values.laycan_end ?? null;
  if (blank(start) !== blank(end)) return false;
  if (laycanHint(start, end) !== null) return false;
  return ALL_FIELDS.every((field) => unused.has(field) || validateField(field, (values as Record<string, unknown>)[field]) === null);
}
