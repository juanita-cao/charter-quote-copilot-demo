import type { OtherCost, QuoteInput, VoyagePort } from "../api/types";
import { ALL_FIELDS, BOOLEAN_FIELDS, LIST_FIELDS, PORT_LIST_FIELDS, PORT_TIME, STRING_FIELDS, type OtherCostRow, type QuoteFormValues } from "./fields";

// Per port: the mode field, and which of days / rate the backend must NOT be sent.
const MODE_OF: Record<string, { mode: string; when: "days" | "rate" }> = {
  loading_days: { mode: PORT_TIME.loading.mode, when: "days" },
  loading_rate: { mode: PORT_TIME.loading.mode, when: "rate" },
  discharging_days: { mode: PORT_TIME.discharging.mode, when: "days" },
  discharging_rate: { mode: PORT_TIME.discharging.mode, when: "rate" },
};
const MODE_FIELDS = new Set<string>([PORT_TIME.loading.mode, PORT_TIME.discharging.mode]);
const isRate = (values: QuoteFormValues, modeField: string) => (values as Record<string, unknown>)[modeField] === "rate";
const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

function completeRows(rows: OtherCostRow[] | null): OtherCost[] {
  return (rows ?? []).flatMap((r) => {
    const name = (r.name ?? "").trim();
    return name !== "" && finite(r.amount) ? [{ name, amount: r.amount }] : [];
  });
}

function completeVoyagePorts(rows: VoyagePort[] | null): VoyagePort[] {
  return (rows ?? []).flatMap((r) => {
    const port = r.port.trim();
    return port !== "" ? [{ port, role: r.role }] : [];
  });
}

export function collectForm(values: QuoteFormValues): QuoteInput {
  const body: Record<string, unknown> = {};
  for (const field of ALL_FIELDS) {
    const v = values[field];
    if (MODE_FIELDS.has(field)) {
      if (v === "rate") body[field] = "rate"; // "days" is the default: nothing to say
      continue;
    }
    const port = MODE_OF[field];
    if (port && isRate(values, port.mode) !== (port.when === "rate")) continue; // the field this mode does not use
    if (LIST_FIELDS.has(field)) {
      const rows = completeRows(v as OtherCostRow[] | null);
      if (rows.length > 0) body[field] = rows;
      continue;
    }
    if (PORT_LIST_FIELDS.has(field)) {
      const ports = completeVoyagePorts(v as VoyagePort[] | null);
      if (ports.length > 0) body[field] = ports;
      continue;
    }
    if (v === null || v === undefined) continue;
    if (STRING_FIELDS.has(field)) {
      const s = String(v).trim();
      if (s !== "") body[field] = s;
    } else if (BOOLEAN_FIELDS.has(field)) {
      body[field] = Boolean(v);
    } else {
      if (!finite(v)) throw new Error(`collectForm: field ${field} is not a finite number`);
      body[field] = v;
    }
  }
  return body as unknown as QuoteInput;
}

// A draft is "a raw form dict, no validation" (SA-21): keep whatever the user typed, but never send a blank, NaN or Infinity.
// Both the days and the rate are kept (the operator may switch back); the mode only when it is not the default.
export function collectDraftBody(values: QuoteFormValues): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  for (const field of ALL_FIELDS) {
    const v = values[field];
    if (MODE_FIELDS.has(field)) {
      if (v === "rate") body[field] = "rate";
      continue;
    }
    if (LIST_FIELDS.has(field)) {
      const rows = ((v as OtherCostRow[] | null) ?? [])
        .map((r) => {
          const row: Record<string, unknown> = {};
          const name = (r.name ?? "").trim();
          if (name !== "") row.name = name;
          if (finite(r.amount)) row.amount = r.amount;
          return row;
        })
        .filter((r) => Object.keys(r).length > 0);
      if (rows.length > 0) body[field] = rows;
      continue;
    }
    if (PORT_LIST_FIELDS.has(field)) {
      const ports = completeVoyagePorts(v as VoyagePort[] | null);
      if (ports.length > 0) body[field] = ports;
      continue;
    }
    if (v === null || v === undefined) continue;
    if (typeof v === "string") {
      if (v.trim() !== "") body[field] = v.trim();
    } else if (typeof v === "number") {
      if (Number.isFinite(v)) body[field] = v;
    } else {
      body[field] = v;
    }
  }
  return body;
}
