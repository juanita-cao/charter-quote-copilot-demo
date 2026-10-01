// The one decision every PT-18 field recognizer makes, shared so it is written once and reused, not re-derived by
// hand for each new field (found 2026-09-23: building the ports slice separately from cargo/terms let the exact
// same "a differing existing value must be offered, not silently blocked" bug happen a third time, even though the
// fix was already proven twice — the pattern was documented as reusable but never actually shared as code).
//
// Stateless on purpose (see vm/cargo.ts's docstring for the fuller history): whether the current value came from a
// confirmed recognise, a hand-typed entry, or a reloaded draft looks identical here — it only ever compares the
// current value against a freshly proposed one, nothing else.

export type RecognitionDecision<T> =
  | { kind: "fill" | "offer"; value: T }
  /** Nothing was found in this text. `hadValue` tells the caller whether the field was already empty (worth a "no
   * match" warning) or already held something (worth a quiet "kept, nothing new found" note instead of silence —
   * found 2026-09-23: a second, unrelated enquiry left a first enquiry's recognised value sitting in the field with
   * no indication it wasn't about the text now pasted). */
  | { kind: "noMatch"; hadValue: boolean }
  /** The field already holds exactly what was just proposed — genuinely nothing to say. */
  | { kind: "noop" };

/**
 * `currentIsEmpty`: true when there is nothing to protect (an empty field, or an empty list).
 * `proposed`: the fresh match, or `null` if nothing was found this time.
 * `matchesCurrent`: true when `proposed` already equals the current value (nothing to offer).
 */
export function decideRecognition<T>(currentIsEmpty: boolean, proposed: T | null, matchesCurrent: boolean): RecognitionDecision<T> {
  if (proposed === null) return { kind: "noMatch", hadValue: !currentIsEmpty };
  if (currentIsEmpty) return { kind: "fill", value: proposed };
  if (matchesCurrent) return { kind: "noop" };
  return { kind: "offer", value: proposed };
}
