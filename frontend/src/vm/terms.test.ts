import { describe, expect, test } from "vitest";
import { buildTermsRecognitionVM } from "./terms";

// [AMENDMENT 2026-09-22] Rewritten for the stateless offer-not-overwrite rule — see vm/cargo.ts's docstring (terms
// mirrors it exactly) and cargo.test.ts for the fuller rationale.

describe("buildTermsRecognitionVM", () => {
  test("no enquiry text -> empty, no caption (the enquiry-box notice belongs to cargo recognition, not duplicated here)", () => {
    expect(buildTermsRecognitionVM(null, null)).toEqual({ patch: {}, caption: null });
  });

  test("no recognisable term -> warn, no patch", () => {
    expect(buildTermsRecognitionVM("5000吨吨袋氯化钙", null)).toEqual({ patch: {}, caption: { kind: "warn", key: "termsNoMatch" } });
  });

  test("a match on an empty field fills it and marks it recognised", () => {
    expect(buildTermsRecognitionVM("FRT: INVITE OWS BSS 1/1 FILO", null)).toEqual({
      patch: { contract_terms: "FILO" },
      caption: { kind: "ok", key: "termsRecognised", params: { terms: "FILO" } },
    });
  });

  test("a match that agrees with the existing value does nothing", () => {
    expect(buildTermsRecognitionVM("terms are FIO", "FIO")).toEqual({ patch: {}, caption: null });
  });

  test("no match, field already has a value -> kept, not silent (found 2026-09-23: a leftover value from an earlier enquiry must say so)", () => {
    expect(buildTermsRecognitionVM("5000吨吨袋氯化钙", "FIO")).toEqual({
      patch: {},
      caption: { kind: "warn", key: "termsKept", params: { terms: "FIO" } },
    });
  });

  test("a differing match on a non-empty field is offered, never applied automatically", () => {
    expect(buildTermsRecognitionVM("terms are FLT", "FIO")).toEqual({
      patch: {},
      caption: { kind: "offer", key: "termsOffer", params: { terms: "FLT", current: "FIO" } },
      offerValue: "FLT",
    });
  });
});
