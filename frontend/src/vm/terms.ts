import { matchTerms } from "../config/termsMatch";
import type { QuoteFormValues } from "../form/fields";
import { buildFieldRecognitionVM, type FieldCaption } from "./fieldRecognition";

// Contract-terms recognition, PT-18 second slice (design_frontend.md §14). A thin wrapper around
// `fieldRecognition.ts`'s shared engine — see vm/cargo.ts's docstring and fieldRecognition.ts's for why.

export interface TermsRecognitionVM {
  patch: Partial<QuoteFormValues>;
  caption: {
    kind: "ok" | "warn" | "offer";
    key: "termsRecognised" | "termsNoMatch" | "termsKept" | "termsOffer";
    params?: Record<string, string>;
  } | null;
  /** Present only when caption.kind === "offer": the value "Replace" would write to contract_terms. */
  offerValue?: string;
}

const isEmpty = (v: string) => v.trim() === "";
const isEqual = (a: string, b: string) => a === b;

export function buildTermsRecognitionVM(enquiryText: string | null, currentTerms: string | null): TermsRecognitionVM {
  const text = (enquiryText ?? "").trim();
  if (!text) return { patch: {}, caption: null }; // the enquiry-box notice belongs to cargo recognition, not duplicated here

  const current = (currentTerms ?? "").trim();
  const result = buildFieldRecognitionVM(current, isEmpty, matchTerms(text), isEqual, (outcome, value): FieldCaption => {
    switch (outcome) {
      case "recognised":
        return { kind: "ok", key: "termsRecognised", params: { terms: value } };
      case "kept":
        return { kind: "warn", key: "termsKept", params: { terms: value } };
      case "offer":
        return { kind: "offer", key: "termsOffer", params: { terms: value, current } };
      case "noMatch":
        return { kind: "warn", key: "termsNoMatch" };
    }
  });

  return { patch: result.value !== null ? { contract_terms: result.value } : {}, caption: result.caption as TermsRecognitionVM["caption"], offerValue: result.offerValue };
}
