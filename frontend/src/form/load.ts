import type { VoyagePort, VoyagePortRole } from "../api/types";
import { ALL_FIELDS, BOOLEAN_FIELDS, LIST_FIELDS, PORT_LIST_FIELDS, STRING_FIELDS, blankFormValues, type OtherCostRow, type QuoteFormValues } from "./fields";

function asObject(raw: unknown): Record<string, unknown> | null {
  let data: unknown = raw;
  if (typeof raw === "string") {
    try {
      data = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (data === null || typeof data !== "object" || Array.isArray(data)) return null;
  return data as Record<string, unknown>;
}

function parseOtherCosts(v: unknown): OtherCostRow[] {
  if (!Array.isArray(v)) return [];
  return v.flatMap((r) => {
    if (r === null || typeof r !== "object") return [];
    const { name, amount } = r as Record<string, unknown>;
    return typeof name === "string" && typeof amount === "number" && Number.isFinite(amount) ? [{ name, amount }] : [];
  });
}

const VOYAGE_PORT_ROLES = new Set<VoyagePortRole>(["load", "discharge", "waypoint"]);

function parseVoyagePorts(v: unknown): VoyagePort[] {
  if (!Array.isArray(v)) return [];
  return v.flatMap((r) => {
    if (r === null || typeof r !== "object") return [];
    const { port, role } = r as Record<string, unknown>;
    if (typeof port !== "string") return [];
    return [{ port, role: typeof role === "string" && VOYAGE_PORT_ROLES.has(role as VoyagePortRole) ? (role as VoyagePortRole) : "waypoint" }];
  });
}

// Accepts a snapshot as an object or a JSON string (the backend may return either); anything else is null.
// Records saved before v1.1 simply lack the new fields: they take the form's defaults (days mode, no Others, no dates).
export function parseSnapshot(raw: unknown): QuoteFormValues | null {
  const source = asObject(raw);
  if (source === null) return null;

  const out = blankFormValues() as Record<string, unknown>;
  for (const field of ALL_FIELDS) {
    const v = source[field];
    if (field === "loading_mode" || field === "discharging_mode") out[field] = v === "rate" ? "rate" : "days";
    else if (LIST_FIELDS.has(field)) out[field] = parseOtherCosts(v);
    else if (PORT_LIST_FIELDS.has(field)) out[field] = parseVoyagePorts(v);
    else if (STRING_FIELDS.has(field)) out[field] = typeof v === "string" ? v : null;
    else if (BOOLEAN_FIELDS.has(field)) out[field] = typeof v === "boolean" ? v : null;
    else out[field] = typeof v === "number" && Number.isFinite(v) ? v : null;
  }
  return out as QuoteFormValues;
}

export type SnapshotNotice = "pdaSplitEstimated";

/** The backend marks a record whose single old PDA it split evenly between the two ports (`_pda_split_estimated`). */
export function snapshotNotice(raw: unknown): SnapshotNotice | null {
  return asObject(raw)?._pda_split_estimated === true ? "pdaSplitEstimated" : null;
}
