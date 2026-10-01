import { decideRecognition } from "./recognitionRule";

// The one engine behind every PT-18 recognised field (design_backend.md §20's lesson — see recognitionRule.ts's
// docstring for the fuller history of why this had to stop being a hand-copied pattern). `T` is whatever a field's
// value is shaped like: a `string` for cargo/terms, a `VoyagePort[]` for ports. The only thing every field still
// supplies for itself is `buildCaption` — turning an outcome into human-readable text is irreducibly field-specific,
// everything else (the fill/offer/keep/noMatch decision, which of `value`/`offerValue` comes back) is not.

export type RecognitionOutcome = "recognised" | "noMatch" | "kept" | "offer";

export interface FieldCaption {
  kind: "ok" | "warn" | "offer";
  key: string;
  params?: Record<string, string>;
}

export interface FieldRecognitionResult<T> {
  /** The value to write, or `null` if nothing should be written this click (noMatch, kept, or offer — an offer is
   * never applied automatically). */
  value: T | null;
  caption: FieldCaption | null;
  /** Present only when the outcome is "offer": the value a "Replace" action would write. */
  offerValue?: T;
}

/**
 * `current`: the field's value right now. `isEmpty`: whether that counts as "nothing to protect" (a blank string, an
 * empty list). `proposed`: this click's fresh match, or `null` if nothing was found. `isEqual`: content equality for
 * `T` (`===` for a string, a structural comparison for a list). `buildCaption`: given the outcome and the value it's
 * about (the proposed value for "recognised"/"offer", the *current* value for "kept" — there is nothing else to
 * describe when nothing new was found), returns the caption to show.
 */
export function buildFieldRecognitionVM<T>(
  current: T,
  isEmpty: (value: T) => boolean,
  proposed: T | null,
  isEqual: (a: T, b: T) => boolean,
  buildCaption: (outcome: RecognitionOutcome, value: T) => FieldCaption,
): FieldRecognitionResult<T> {
  const decision = decideRecognition(isEmpty(current), proposed, proposed !== null && isEqual(proposed, current));

  switch (decision.kind) {
    case "noMatch":
      return decision.hadValue ? { value: null, caption: buildCaption("kept", current) } : { value: null, caption: buildCaption("noMatch", current) };
    case "noop":
      return { value: null, caption: null };
    case "fill":
      return { value: decision.value, caption: buildCaption("recognised", decision.value) };
    case "offer":
      return { value: null, caption: buildCaption("offer", decision.value), offerValue: decision.value };
  }
}
