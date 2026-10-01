import { ALL_FIELDS, BOOLEAN_FIELDS, LIST_FIELDS, PORT_LIST_FIELDS, STRING_FIELDS } from "./fields";

export interface FieldRule {
  min?: number;
  max?: number;
  exclusiveMin?: number;
  integer?: boolean;
}

export type FieldHint =
  | "mustBeANumber"
  | "mustBeGreaterThanZero"
  | "mustBeAtLeastZero"
  | "mustBeBetween0And100"
  | "mustBeWholeNumber"
  | "laycanOrder";

const POSITIVE = ["quantity", "freight_rate", "ballast_speed", "laden_speed", "loading_rate", "discharging_rate"];
const PERCENT = ["commission_rate", "go_threshold_pct"];

// Mirrors QuoteInput's constraints in schemas.py; pinned to the backend contract dump by CT-05.
export const FIELD_RULES: Record<string, FieldRule> = Object.fromEntries(
  ALL_FIELDS.filter((f) => !STRING_FIELDS.has(f) && !BOOLEAN_FIELDS.has(f) && !LIST_FIELDS.has(f) && !PORT_LIST_FIELDS.has(f)).map((f) => {
    if (POSITIVE.includes(f)) return [f, { exclusiveMin: 0 }];
    if (PERCENT.includes(f)) return [f, { min: 0, max: 100 }];
    if (f === "vessel_dwt") return [f, { min: 0, integer: true }];
    return [f, { min: 0 }];
  }),
);

const isBlank = (v: unknown) => v === null || v === undefined || (typeof v === "string" && v.trim() === "");

export function validateField(field: string, value: unknown): FieldHint | null {
  const rule = FIELD_RULES[field];
  if (!rule || isBlank(value)) return null;

  if (typeof value !== "number" || !Number.isFinite(value)) return "mustBeANumber";
  if (rule.integer && !Number.isInteger(value)) return "mustBeWholeNumber";
  if (rule.exclusiveMin !== undefined && !(value > rule.exclusiveMin)) return "mustBeGreaterThanZero";
  if (rule.max !== undefined && (value < (rule.min ?? -Infinity) || value > rule.max)) return "mustBeBetween0And100";
  if (rule.min !== undefined && value < rule.min) return "mustBeAtLeastZero";
  return null;
}

/** The laycan end must not be before its start (ISO dates compare as text). One end only is a completeness matter, not an order hint. */
export function laycanHint(start: string | null | undefined, end: string | null | undefined): FieldHint | null {
  if (!start || !end) return null;
  return end < start ? "laycanOrder" : null;
}

