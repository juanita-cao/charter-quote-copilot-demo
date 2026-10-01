import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export interface RecognitionCaption {
  kind: "ok" | "warn" | "offer";
  key: string;
  params?: Record<string, string>;
}

/**
 * Shared caption/offer lifecycle for every PT-18 recognised field (design_backend.md §20's lesson: this exact state
 * machine — show a caption for a fill/offer, clear it once the field moves on, apply an offer only on an explicit
 * click — was hand-copied three times (cargo, terms, ports) in `WorkspaceProvider` before being extracted here. The
 * ports slice had to independently rediscover a bug cargo/terms had already fixed, specifically *because* the fix
 * was documented as a reusable pattern but never actually shared as code — a new recognised field now gets this
 * lifecycle for free instead of risking the same rediscovery.
 *
 * `currentValue`/`isEqual` are how the hook knows the field has moved on from what the caption/offer described (an
 * edit, an accepted offer, anything else) so it can clear itself — generalised over `T` (a `string` for cargo/terms,
 * a `VoyagePort[]` for ports, compared by content, not reference).
 */
export function useFieldRecognition<T>(currentValue: T, isEqual: (a: T, b: T) => boolean) {
  const [caption, setCaption] = useState<RecognitionCaption | null>(null);
  const [offer, setOffer] = useState<T | null>(null);
  const captionKey = useRef<T | null>(null);

  useEffect(() => {
    if (captionKey.current === null) return;
    if (!isEqual(currentValue, captionKey.current)) {
      setCaption(null);
      setOffer(null);
      captionKey.current = null;
    }
    // isEqual is expected to be referentially stable per field (an inline arrow is fine — it's only read here).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentValue]);

  /** Call once per Recognise click with this field's VM result: the caption to show, the offer value if any, and
   * the value the field would resolve to (the patched value on a fill, or its current value on a noop/offer) —
   * updates state and rearms the auto-clear watch above `resultingValue`. */
  const commit = useCallback((nextCaption: RecognitionCaption | null, nextOffer: T | null, resultingValue: T) => {
    setCaption(nextCaption);
    setOffer(nextOffer);
    captionKey.current = nextCaption ? resultingValue : null;
  }, []);

  const dismiss = useCallback(() => {
    setCaption(null);
    setOffer(null);
    captionKey.current = null;
  }, []);

  return useMemo(() => ({ caption, offer, commit, dismiss }), [caption, offer, commit, dismiss]);
}
