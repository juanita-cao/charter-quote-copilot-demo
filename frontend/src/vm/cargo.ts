import { matchCargo } from "../config/cargoMatch";
import type { QuoteFormValues } from "../form/fields";
import { buildFieldRecognitionVM, type FieldCaption } from "./fieldRecognition";

// Cargo recognition, PT-18 first slice (design_backend.md §18, design_frontend.md §13). Triggered by the "Recognise
// fields" button in the enquiry box, never by a paste/change event (design_frontend.md §13's trigger decision).
//
// [AMENDMENT 2026-09-23] A thin wrapper around `fieldRecognition.ts`'s shared engine — the fill/offer/kept/noMatch
// decision, and the history of why it looks like this (stateless, offers rather than overwrites, never leaves a
// stale value silent), all live there now; read that file's docstring, not this one, for the reasoning.

export interface CargoRecognitionVM {
  patch: Partial<QuoteFormValues>;
  caption: {
    kind: "ok" | "warn" | "offer";
    key: "cargoRecognised" | "cargoNoMatch" | "cargoNoEnquiryText" | "cargoKept" | "cargoOffer";
    params?: Record<string, string>;
  } | null;
  /** Present only when caption.kind === "offer": the value "Replace" would write to cargo_description. */
  offerValue?: string;
}

const isEmpty = (v: string) => v.trim() === "";
const isEqual = (a: string, b: string) => a === b;

export function buildCargoRecognitionVM(enquiryText: string | null, currentCargoDescription: string | null): CargoRecognitionVM {
  const text = (enquiryText ?? "").trim();
  if (!text) return { patch: {}, caption: { kind: "warn", key: "cargoNoEnquiryText" } };

  const current = (currentCargoDescription ?? "").trim();
  const result = buildFieldRecognitionVM(current, isEmpty, matchCargo(text), isEqual, (outcome, value): FieldCaption => {
    switch (outcome) {
      case "recognised":
        return { kind: "ok", key: "cargoRecognised", params: { cargo: value } };
      case "kept":
        return { kind: "warn", key: "cargoKept", params: { cargo: value } };
      case "offer":
        return { kind: "offer", key: "cargoOffer", params: { cargo: value, current } };
      case "noMatch":
        return { kind: "warn", key: "cargoNoMatch" };
    }
  });

  return { patch: result.value !== null ? { cargo_description: result.value } : {}, caption: result.caption as CargoRecognitionVM["caption"], offerValue: result.offerValue };
}
