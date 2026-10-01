import { matchLaycan } from "../config/laycanMatch";
import type { QuoteFormValues } from "../form/fields";
import { buildFieldRecognitionVM, type FieldCaption } from "./fieldRecognition";

// Laycan recognition, PT-18 sixth slice. `laycan_start`/`laycan_end` are two fields, treated as one pair here (same
// idea as ports treating the whole `voyage_ports` list as one value) — an operator who has typed only one of the
// two still has "something to protect", so either one present counts as non-empty.
//
// A fuzzy match (下旬/END OF/AROUND, no exact days — config/laycanMatch.ts's docstring) is reported directly here,
// bypassing the shared engine entirely, the same way quantity.ts bypasses it for a range: "found something, refuse
// to act on it regardless of the field's current state" isn't one of the engine's four outcomes. An exact date-pair
// match goes through the same engine as cargo/terms/ports/quantity — T is `LaycanRange` here, nothing new.

export interface LaycanRange {
  start: string | null;
  end: string | null;
}

export interface LaycanRecognitionVM {
  patch: Partial<QuoteFormValues>;
  caption: {
    kind: "ok" | "warn" | "offer";
    key: "laycanRecognised" | "laycanNoMatch" | "laycanKept" | "laycanOffer" | "laycanFuzzyFound";
    params?: Record<string, string>;
  } | null;
  /** Present only when caption.kind === "offer": the range "Replace" would write to laycan_start/laycan_end. */
  offerValue?: LaycanRange | null;
}

const isEmpty = (v: LaycanRange) => v.start === null && v.end === null;
const isEqual = (a: LaycanRange, b: LaycanRange) => a.start === b.start && a.end === b.end;

export function buildLaycanRecognitionVM(
  enquiryText: string | null,
  currentLaycanStart: string | null,
  currentLaycanEnd: string | null,
  fillInDate: string,
): LaycanRecognitionVM {
  const text = (enquiryText ?? "").trim();
  if (!text) return { patch: {}, caption: null }; // the enquiry-box notice belongs to cargo recognition, not duplicated here

  const match = matchLaycan(text, fillInDate);
  if (match?.kind === "fuzzy") {
    return { patch: {}, caption: { kind: "warn", key: "laycanFuzzyFound", params: { text: match.text } } };
  }

  const current: LaycanRange = { start: currentLaycanStart, end: currentLaycanEnd };
  const proposed: LaycanRange | null = match ? { start: match.start, end: match.end } : null;

  const result = buildFieldRecognitionVM<LaycanRange>(current, isEmpty, proposed, isEqual, (outcome, value): FieldCaption => {
    switch (outcome) {
      case "recognised":
        return { kind: "ok", key: "laycanRecognised", params: { start: value.start ?? "", end: value.end ?? "" } };
      case "kept":
        return { kind: "warn", key: "laycanKept", params: { start: value.start ?? "", end: value.end ?? "" } };
      case "offer":
        return {
          kind: "offer",
          key: "laycanOffer",
          params: { start: value.start ?? "", end: value.end ?? "", currentStart: current.start ?? "", currentEnd: current.end ?? "" },
        };
      case "noMatch":
        return { kind: "warn", key: "laycanNoMatch" };
    }
  });

  return {
    patch: result.value !== null ? { laycan_start: result.value.start, laycan_end: result.value.end } : {},
    caption: result.caption as LaycanRecognitionVM["caption"],
    offerValue: result.offerValue,
  };
}
