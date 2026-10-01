import type { DraftRow, QuoteRow } from "../api/types";
import type { QuoteFormValues } from "../form/fields";
import { parseSnapshot, snapshotNotice } from "../form/load";
import type { HistoryRowVM } from "./types";

const nonBlank = (s: string | null | undefined): s is string => typeof s === "string" && s.trim() !== "";

function parseWithWarning(raw: unknown, recordKey: string): QuoteFormValues | null {
  const values = parseSnapshot(raw);
  if (values === null && raw !== null && raw !== undefined) {
    console.warn(`History: snapshot of record ${recordKey} could not be parsed; Load is disabled for it`);
  }
  return values;
}

function quoteRowVM(q: QuoteRow): HistoryRowVM {
  const key = `q${q.id}`;
  const values = parseWithWarning(q.quote_input_snapshot, key);
  return {
    key,
    kind: "quote",
    typeLabel: q.decision ?? "UNKNOWN",
    dateIso: q.created_at,
    route: nonBlank(q.route) ? q.route : (nonBlank(values?.route) ? values.route : ""),
    cargo: nonBlank(q.cargo_description) ? q.cargo_description : (nonBlank(values?.cargo_description) ? values.cargo_description : ""),
    vessel: values?.vessel_name ?? "",
    quantity: q.quantity ?? values?.quantity ?? null,
    rate: q.freight_rate ?? values?.freight_rate ?? null,
    tce: q.tce ?? null,
    values,
    notice: snapshotNotice(q.quote_input_snapshot),
  };
}

function draftRowVM(d: DraftRow): HistoryRowVM {
  const key = `d${d.id}`;
  const values = parseWithWarning(d.raw_input_json, key);
  return {
    key,
    kind: "draft",
    typeLabel: "DRAFT",
    dateIso: d.updated_at,
    route: nonBlank(d.route) ? d.route : (nonBlank(values?.route) ? values.route : ""),
    cargo: nonBlank(d.cargo_description) ? d.cargo_description : (nonBlank(values?.cargo_description) ? values.cargo_description : ""),
    vessel: values?.vessel_name ?? "",
    quantity: null,
    rate: null,
    tce: null,
    values,
    notice: snapshotNotice(d.raw_input_json),
  };
}

export function buildHistoryRowsVM(
  quotes: QuoteRow[],
  drafts: DraftRow[],
  pill: "ALL" | "QUOTES" | "DRAFTS",
): HistoryRowVM[] {
  const rows: HistoryRowVM[] = [];
  if (pill !== "DRAFTS") rows.push(...quotes.map(quoteRowVM));
  if (pill !== "QUOTES") rows.push(...drafts.map(draftRowVM));
  return rows.sort((a, b) => Date.parse(b.dateIso) - Date.parse(a.dateIso));
}
