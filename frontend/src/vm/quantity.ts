import { matchQuantity } from "../config/quantityMatch";
import type { QuoteFormValues } from "../form/fields";
import { buildFieldRecognitionVM, type FieldCaption } from "./fieldRecognition";

// Quantity recognition, PT-18 fourth slice. A range match is never resolved to one number (client decision
// 2026-09-23, config/quantityMatch.ts's docstring) — that case is reported directly here, bypassing the shared
// fill/offer/kept/noMatch engine entirely, since "found something, refuse to act on it regardless of the field's
// current state" isn't one of that engine's four outcomes and shouldn't be forced into one. A single-value match
// goes through the same engine as cargo/terms/ports (`fieldRecognition.ts`) — T is a `number` here, nothing new.

export interface QuantityRecognitionVM {
  patch: Partial<QuoteFormValues>;
  caption: {
    kind: "ok" | "warn" | "offer";
    key: "quantityRecognised" | "quantityNoMatch" | "quantityKept" | "quantityOffer" | "quantityRangeFound";
    params?: Record<string, string>;
  } | null;
  /** Present only when caption.kind === "offer": the value "Replace" would write to quantity. */
  offerValue?: number | null;
}

// T is `number | null` (not just `number`) so "no quantity yet" has a real value to compare/report, rather than a
// NaN-style sentinel — `isEqual` never has to reason about a `proposed` value being null itself, since a real match
// is always a parsed number (see matchQuantity: `kind: "single"` never carries a null `value`).
const isEmpty = (v: number | null) => v === null;
const isEqual = (a: number | null, b: number | null) => a === b;

export function buildQuantityRecognitionVM(enquiryText: string | null, currentQuantity: number | null): QuantityRecognitionVM {
  const text = (enquiryText ?? "").trim();
  if (!text) return { patch: {}, caption: null }; // the enquiry-box notice belongs to cargo recognition, not duplicated here

  const match = matchQuantity(text);
  if (match?.kind === "range") {
    return { patch: {}, caption: { kind: "warn", key: "quantityRangeFound", params: { min: String(match.min), max: String(match.max) } } };
  }

  const result = buildFieldRecognitionVM<number | null>(currentQuantity, isEmpty, match?.value ?? null, isEqual, (outcome, value): FieldCaption => {
    switch (outcome) {
      case "recognised":
        return { kind: "ok", key: "quantityRecognised", params: { quantity: String(value) } };
      case "kept":
        return { kind: "warn", key: "quantityKept", params: { quantity: String(value) } };
      case "offer":
        return { kind: "offer", key: "quantityOffer", params: { quantity: String(value), current: String(currentQuantity) } };
      case "noMatch":
        return { kind: "warn", key: "quantityNoMatch" };
    }
  });

  return { patch: result.value !== null ? { quantity: result.value } : {}, caption: result.caption as QuantityRecognitionVM["caption"], offerValue: result.offerValue };
}
